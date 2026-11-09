import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loginUser, logoutUser, registerUser, resolveSession, setUserStatus, type AuthResult } from "./auth-service";
import type { Viewer } from "./auth-types";
import { getCorpusDocument, getCorpusStats, listCorpusDocuments, searchCorpus } from "./corpus-db";

vi.mock("@/lib/server-database", () => import("./server-database"));

const schema = readFileSync(path.resolve(__dirname, "../../../db/sqlite/001_research_corpus.sql"), "utf8");
const password = "test-pass-10";
let directory: string;

function viewer(user: AuthResult["user"]): Viewer {
  return { id: user.id, role: user.role };
}

async function seedUsersAndCorpus() {
  const admin = await register("admin@test.invalid", "Admin");
  const ownerRegistration = await register("owner@test.invalid", "Owner");
  const mateRegistration = await register("mate@test.invalid", "Mate");
  const otherRegistration = await register("other@test.invalid", "Other");
  const owner = setUserStatus(viewer(admin.user), ownerRegistration.user.id, "active");
  const mate = setUserStatus(viewer(admin.user), mateRegistration.user.id, "active");
  const other = setUserStatus(viewer(admin.user), otherRegistration.user.id, "active");
  const users = { admin: admin.user, owner, mate, other };
  seedCorpus(users);
  return users;
}

function assertBoundary(user: AuthResult["user"] | null, expectedIds: string[]) {
  const currentViewer = user ? viewer(user) : null;
  expect(listCorpusDocuments("", "all", 100, currentViewer).map((document) => document.id).sort()).toEqual([...expectedIds].sort());
  expect(searchCorpus("shared", 20, currentViewer).map((source) => source.documentId).sort()).toEqual([...expectedIds].sort());
  expect(getCorpusStats(currentViewer)).toEqual({
    documents: expectedIds.length,
    chunks: expectedIds.length,
    institutions: expectedIds.length,
    characters: expectedIds.length,
  });
  for (const id of ["public", "private", "team", "other"]) {
    const detail = getCorpusDocument(id, currentViewer);
    if (expectedIds.includes(id)) {
      expect(detail?.document.id).toBe(id);
      expect(detail?.chunks).toHaveLength(1);
    } else {
      expect(detail).toBeNull();
    }
  }
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "auth-service-"));
  process.env.CORPUS_DB_PATH = path.join(directory, "corpus.db");
  withDatabase((database) => database.exec(schema));
});

afterEach(() => {
  delete process.env.CORPUS_DB_PATH;
  rmSync(directory, { recursive: true, force: true });
});

describe("账户生命周期", () => {
  it("首用户获得管理员会话，后续用户审核前不可登录且密码错误被拒绝", async () => {
    const admin = await register("admin@test.invalid", "Admin");
    expect(admin.user).toMatchObject({ role: "admin", status: "active" });
    expect(admin.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(resolveSession(admin.token!)?.user.id).toBe(admin.user.id);
    const pending = await register("member@test.invalid", "Member");
    expect(pending.user).toMatchObject({ role: "member", status: "pending" });
    expect(pending.token).toBeNull();
    expect(pending.requiresApproval).toBe(true);
    await expect(loginUser({ email: pending.user.email, password })).rejects.toMatchObject({ code: "APPROVAL_REQUIRED", status: 403 });
    expect(setUserStatus(viewer(admin.user), pending.user.id, "active").status).toBe("active");
    const login = await loginUser({ email: pending.user.email, password });
    expect(login.token).toBeTypeOf("string");
    expect(resolveSession(login.token!)?.user.id).toBe(pending.user.id);
    await expect(loginUser({ email: pending.user.email, password: "wrong-pass-10" })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
  });

  it("原始 token 不入库，logout 后失效，禁用用户会话失效", async () => {
    const admin = await register("admin@test.invalid", "Admin");
    const rows = withDatabase((database) => database.prepare("SELECT token_hash FROM sessions").all() as Array<{ token_hash: string }>);
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(admin.token);
    expect(rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    logoutUser(admin.token!);
    expect(resolveSession(admin.token!)).toBeNull();
    const registration = await register("member@test.invalid", "Member");
    setUserStatus(viewer(admin.user), registration.user.id, "active");
    const login = await loginUser({ email: registration.user.email, password });
    expect(resolveSession(login.token!)).not.toBeNull();
    expect(setUserStatus(viewer(admin.user), registration.user.id, "disabled").status).toBe("disabled");
    expect(resolveSession(login.token!)).toBeNull();
    await expect(loginUser({ email: registration.user.email, password })).rejects.toMatchObject({ code: "ACCOUNT_DISABLED" });
  });

  it("允许两名管理员中禁用一名，并拒绝最后管理员禁用自己", async () => {
    const admin = await register("admin@test.invalid", "Admin");
    const pending = await register("member@test.invalid", "Member");
    setUserStatus(viewer(admin.user), pending.user.id, "active");
    withDatabase((database) => {
      database.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(pending.user.id);
    });
    const secondAdmin = viewer({ ...pending.user, status: "active", role: "admin" });
    expect(setUserStatus(secondAdmin, admin.user.id, "disabled").status).toBe("disabled");
    expect(resolveSession(admin.token!)).toBeNull();
    expect(() => setUserStatus(secondAdmin, pending.user.id, "disabled")).toThrow(expect.objectContaining({ code: "SELF_DISABLE", status: 409 }));
  });
});

describe("语料知识边界", () => {
  it("匿名仅见 public，所有者见 private，同团队成员见 team", async () => {
    const users = await seedUsersAndCorpus();
    assertBoundary(null, ["public"]);
    assertBoundary(users.owner, ["public", "private", "team"]);
    assertBoundary(users.mate, ["public", "team"]);
  });

  it("其他账号与管理员默认不可读他人 private，详情搜索统计均不泄漏", async () => {
    const users = await seedUsersAndCorpus();
    assertBoundary(users.other, ["public", "other"]);
    assertBoundary(users.admin, ["public"]);
  });
});

function withDatabase<T>(operation: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(process.env.CORPUS_DB_PATH!);
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

async function register(email: string, displayName: string) {
  return registerUser({ email, password, displayName });
}

function seedCorpus(users: Record<"owner" | "mate" | "other" | "admin", AuthResult["user"]>) {
  withDatabase((database) => {
    const timestamp = "2026-01-01T00:00:00.000Z";
    database.prepare("INSERT INTO teams (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)")
      .run("team-a", "A", users.owner.id, timestamp);
    const addMember = database.prepare("INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)");
    addMember.run("team-a", users.owner.id, "owner", timestamp);
    addMember.run("team-a", users.mate.id, "member", timestamp);
    const addDocument = database.prepare(`INSERT INTO documents (
      id, title, source_url, institution, format, status, text_length,
      created_at, updated_at, owner_id, visibility, team_id
    ) VALUES (?, ?, ?, ?, 'pdf', 'parsed', 1, ?, ?, ?, ?, ?)`);
    const documents = [
      ["public", "public-doc", "Public", users.owner.id, "public", null],
      ["private", "private-doc", "Owner", users.owner.id, "private", null],
      ["team", "team-doc", "Team", users.owner.id, "team", "team-a"],
      ["other", "other-doc", "Other", users.other.id, "private", null],
    ] as const;
    for (const [id, title, institution, ownerId, visibility, teamId] of documents) {
      addDocument.run(id, title, `test:${id}`, institution, timestamp, timestamp, ownerId, visibility, teamId);
      database.prepare("INSERT INTO document_chunks (id, document_id, chunk_index, text, char_count, token_estimate) VALUES (?, ?, 0, ?, 1, 1)")
        .run(`${id}-chunk`, id, `shared-${id}-text`);
    }
  });
}
