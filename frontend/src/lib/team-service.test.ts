import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerUser, setUserStatus } from "./auth-service";
import type { Viewer } from "./auth-types";
import { getCorpusDocument, listCorpusDocuments } from "./corpus-db";
import {
  createTeam,
  createTeamInvite,
  getTeamDetail,
  joinTeam,
  leaveTeam,
  listTeams,
  removeTeamMember,
  setTeamMemberRole,
} from "./team-service";

vi.mock("@/lib/server-database", () => import("./server-database"));

const schema = readFileSync(path.resolve(__dirname, "../../../db/sqlite/001_research_corpus.sql"), "utf8");
let directory: string;
let admin: Awaited<ReturnType<typeof registerUser>>;

async function activeUser(email: string, displayName: string) {
  const result = await registerUser({ email, password: "test-pass-10", displayName });
  if (result.user.status === "pending") {
    result.user = setUserStatus({ id: admin.user.id, role: "admin" }, result.user.id, "active");
  }
  return { user: result.user, viewer: { id: result.user.id, role: result.user.role } as Viewer };
}

function withDatabase<T>(operation: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(process.env.CORPUS_DB_PATH!);
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

function insertTeamDocument(teamId: string, ownerId: string) {
  const timestamp = new Date().toISOString();
  withDatabase((database) => {
    database.prepare(`
      INSERT INTO documents (
        id, title, source_url, format, status, text_length, created_at, updated_at,
        owner_id, visibility, team_id
      ) VALUES ('team-doc', 'Team document', 'test:team-doc', 'pdf', 'parsed', 1, ?, ?, ?, 'team', ?)
    `).run(timestamp, timestamp, ownerId, teamId);
  });
}

beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "team-service-"));
  process.env.CORPUS_DB_PATH = path.join(directory, "corpus.db");
  withDatabase((database) => database.exec(schema));
  admin = await registerUser({ email: "team-admin@test.invalid", password: "test-pass-10", displayName: "Team Admin" });
  expect(admin.user.status).toBe("active");
});

afterEach(() => {
  delete process.env.CORPUS_DB_PATH;
  rmSync(directory, { recursive: true, force: true });
});

describe("团队生命周期", () => {
  it("active 用户创建团队后成为 owner，非成员列表和详情均不可见", async () => {
    const owner = await activeUser("owner@test.invalid", "Owner");
    const outsider = await activeUser("outsider@test.invalid", "Outsider");
    const team = createTeam(owner.viewer, { name: "知识图谱组" });

    expect(team.ownerId).toBe(owner.user.id);
    expect(team.members).toEqual([
      expect.objectContaining({ userId: owner.user.id, role: "owner" }),
    ]);
    expect(listTeams(owner.viewer).map((item) => item.id)).toEqual([team.id]);
    expect(listTeams(outsider.viewer)).toEqual([]);
    expect(getTeamDetail(owner.viewer, team.id).id).toBe(team.id);
    expect(() => getTeamDetail(outsider.viewer, team.id)).toThrow(
      expect.objectContaining({ status: 404, code: "TEAM_NOT_FOUND" }),
    );
    expect(() => createTeam(owner.viewer, { name: "x" })).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() => createTeamInvite(owner.viewer, team.id, { expiresInHours: "24" })).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() => removeTeamMember(owner.viewer, team.id, "not-a-user")).toThrow(
      expect.objectContaining({ status: 404, code: "MEMBER_NOT_FOUND" }),
    );
  });

  it("邀请令牌哈希入库，过期和一次使用均拒绝，加入后可见 team 文档", async () => {
    const owner = await activeUser("owner@test.invalid", "Owner");
    const mate = await activeUser("mate@test.invalid", "Mate");
    const outsider = await activeUser("outsider@test.invalid", "Outsider");
    const team = createTeam(owner.viewer, { name: "Team" });
    insertTeamDocument(team.id, owner.user.id);
    expect(listCorpusDocuments("", "all", 100, mate.viewer).some((item) => item.id === "team-doc")).toBe(false);

    const invite = createTeamInvite(owner.viewer, team.id, { expiresInHours: 1 });
    expect(invite.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(() => createTeamInvite(owner.viewer, team.id, { expiresInHours: 0 })).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    const rows = withDatabase((database) => database.prepare("SELECT token_hash, status FROM team_invites").all() as Array<{ token_hash: string; status: string }>);
    expect(rows).toEqual([{ token_hash: createHash("sha256").update(invite.token).digest("hex"), status: "pending" }]);

    const joined = joinTeam(mate.viewer, { token: invite.token });
    expect(joined.members.some((member) => member.userId === mate.user.id && member.role === "member")).toBe(true);
    expect(listCorpusDocuments("", "all", 100, mate.viewer).some((item) => item.id === "team-doc")).toBe(true);
    expect(getCorpusDocument("team-doc", mate.viewer)?.document.id).toBe("team-doc");
    expect(() => joinTeam(outsider.viewer, { token: invite.token })).toThrow(
      expect.objectContaining({ status: 404, code: "INVITE_INVALID" }),
    );
    expect(() => joinTeam(outsider.viewer, { token: `invalid-${invite.token}` })).toThrow(
      expect.objectContaining({ status: 404, code: "INVITE_INVALID" }),
    );

    const fresh = createTeamInvite(owner.viewer, team.id, { expiresInHours: 1 });
    withDatabase((database) => database.prepare("UPDATE team_invites SET expires_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", fresh.id));
    expect(() => joinTeam(outsider.viewer, { token: fresh.token })).toThrow(
      expect.objectContaining({ status: 404, code: "INVITE_INVALID" }),
    );
  });

  it("成员退出后 corpus team 文档自然失权", async () => {
    const owner = await activeUser("owner@test.invalid", "Owner");
    const mate = await activeUser("mate@test.invalid", "Mate");
    const team = createTeam(owner.viewer, { name: "Team" });
    insertTeamDocument(team.id, owner.user.id);
    const invite = createTeamInvite(owner.viewer, team.id, { expiresInHours: 1 });
    joinTeam(mate.viewer, { token: invite.token });
    expect(listCorpusDocuments("", "all", 100, mate.viewer).some((item) => item.id === "team-doc")).toBe(true);

    leaveTeam(mate.viewer, team.id);
    expect(listCorpusDocuments("", "all", 100, mate.viewer).some((item) => item.id === "team-doc")).toBe(false);
    expect(getCorpusDocument("team-doc", mate.viewer)).toBeNull();
    expect(() => getTeamDetail(mate.viewer, team.id)).toThrow(
      expect.objectContaining({ status: 404, code: "TEAM_NOT_FOUND" }),
    );
  });

  it("owner 可移除成员和变更角色，普通成员无管理权", async () => {
    const owner = await activeUser("owner@test.invalid", "Owner");
    const mate = await activeUser("mate@test.invalid", "Mate");
    const outsider = await activeUser("outsider@test.invalid", "Outsider");
    const team = createTeam(owner.viewer, { name: "Team" });
    const mateInvite = createTeamInvite(owner.viewer, team.id, { expiresInHours: 1 });
    joinTeam(mate.viewer, { token: mateInvite.token });
    const outsiderInvite = createTeamInvite(owner.viewer, team.id, { expiresInHours: 1 });
    joinTeam(outsider.viewer, { token: outsiderInvite.token });

    expect(setTeamMemberRole(owner.viewer, team.id, mate.user.id, "owner").role).toBe("owner");
    expect(() => createTeamInvite(outsider.viewer, team.id, { expiresInHours: 1 })).toThrow(
      expect.objectContaining({ status: 403, code: "TEAM_OWNER_REQUIRED" }),
    );
    expect(() => setTeamMemberRole(outsider.viewer, team.id, mate.user.id, "member")).toThrow(
      expect.objectContaining({ status: 403, code: "TEAM_OWNER_REQUIRED" }),
    );
    expect(() => removeTeamMember(outsider.viewer, team.id, mate.user.id)).toThrow(
      expect.objectContaining({ status: 403, code: "TEAM_OWNER_REQUIRED" }),
    );

    const withoutOwner = removeTeamMember(mate.viewer, team.id, owner.user.id);
    expect(withoutOwner.ownerId).toBe(mate.user.id);
    expect(() => removeTeamMember(mate.viewer, team.id, mate.user.id)).toThrow(
      expect.objectContaining({ status: 409, code: "OWNER_LEAVE_REQUIRED" }),
    );
    expect(() => setTeamMemberRole(mate.viewer, team.id, mate.user.id, "member")).toThrow(
      expect.objectContaining({ status: 409, code: "LAST_TEAM_OWNER" }),
    );
    expect(() => leaveTeam(mate.viewer, team.id)).toThrow(
      expect.objectContaining({ status: 409, code: "LAST_TEAM_OWNER" }),
    );
  });
});
