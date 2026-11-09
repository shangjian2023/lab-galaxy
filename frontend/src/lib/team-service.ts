import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { AuthError } from "./auth-service";
import type { Viewer } from "./auth-types";
import { openIdentityDatabase } from "./server-database";

export type TeamRole = "owner" | "member";

export interface TeamSummary {
  id: string;
  name: string;
  ownerId: string;
  owner_id: string;
  createdAt: string;
  created_at: string;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  email: string;
  displayName: string;
  role: TeamRole;
  joinedAt: string;
  user_id: string;
  joined_at: string;
}

export interface TeamDetail extends TeamSummary {
  members: TeamMember[];
}

export interface TeamInvite {
  id: string;
  token: string;
  expiresAt: string;
}

interface TeamRow {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

interface MemberRow {
  team_id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: TeamRole;
  created_at: string;
}

const MINUTE_MS = 60 * 1000;

function now() {
  return new Date().toISOString();
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function ensureTeamSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS team_invites (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked')),
      max_uses INTEGER NOT NULL CHECK (max_uses > 0),
      uses_count INTEGER NOT NULL DEFAULT 0 CHECK (uses_count >= 0 AND uses_count <= max_uses),
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      accepted_by TEXT REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_team_invites_team ON team_invites(team_id);
    CREATE INDEX IF NOT EXISTS idx_team_invites_expiry ON team_invites(expires_at);
  `);
}

function openTeamDatabase(): DatabaseSync {
  const database = openIdentityDatabase();
  try {
    ensureTeamSchema(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

function transaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  }
}

function requireViewer(viewer: Viewer | null): asserts viewer is Viewer {
  if (!viewer) throw new AuthError("请先登录", 401, "LOGIN_REQUIRED");
}

function validateTeamName(input: { name?: unknown }) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2 || name.length > 80) throw new AuthError("团队名称长度应为 2–80 个字符");
  return name;
}

function serializeTeam(row: TeamRow): TeamSummary {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    owner_id: row.owner_id,
    createdAt: row.created_at,
    created_at: row.created_at,
  };
}

function serializeMember(row: MemberRow): TeamMember {
  return {
    teamId: row.team_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    joinedAt: row.created_at,
    user_id: row.user_id,
    joined_at: row.created_at,
  };
}

function getTeam(database: DatabaseSync, teamId: string): TeamRow | undefined {
  return database.prepare("SELECT id, name, owner_id, created_at FROM teams WHERE id = ?").get(teamId) as TeamRow | undefined;
}

function getMembership(database: DatabaseSync, teamId: string, userId: string): MemberRow | undefined {
  return database.prepare(`
    SELECT m.team_id, m.user_id, u.email, u.display_name, m.role, m.created_at
    FROM team_members m JOIN users u ON u.id = m.user_id
    WHERE m.team_id = ? AND m.user_id = ?
  `).get(teamId, userId) as MemberRow | undefined;
}

function requireMembership(database: DatabaseSync, teamId: string, userId: string): MemberRow {
  const membership = getMembership(database, teamId, userId);
  if (!membership) throw new AuthError("团队不存在", 404, "TEAM_NOT_FOUND");
  return membership;
}

function requireOwner(database: DatabaseSync, teamId: string, userId: string): MemberRow {
  const membership = requireMembership(database, teamId, userId);
  if (membership.role !== "owner") throw new AuthError("需要团队所有者权限", 403, "TEAM_OWNER_REQUIRED");
  return membership;
}

function ownerCount(database: DatabaseSync, teamId: string) {
  const row = database.prepare("SELECT COUNT(*) AS count FROM team_members WHERE team_id = ? AND role = 'owner'").get(teamId) as { count: number };
  return Number(row.count);
}

function refreshCanonicalOwner(database: DatabaseSync, teamId: string) {
  database.prepare(`
    UPDATE teams
    SET owner_id = (
      SELECT user_id FROM team_members
      WHERE team_id = ? AND role = 'owner'
      ORDER BY created_at ASC, user_id ASC LIMIT 1
    )
    WHERE id = ?
  `).run(teamId, teamId);
}

function teamDetail(database: DatabaseSync, team: TeamRow): TeamDetail {
  const rows = database.prepare(`
    SELECT m.team_id, m.user_id, u.email, u.display_name, m.role, m.created_at
    FROM team_members m JOIN users u ON u.id = m.user_id
    WHERE m.team_id = ?
    ORDER BY m.created_at ASC, u.display_name ASC
  `).all(team.id) as unknown as MemberRow[];
  return { ...serializeTeam(team), members: rows.map(serializeMember) };
}

export function createTeam(viewer: Viewer | null, input: { name?: unknown }): TeamDetail {
  requireViewer(viewer);
  const name = validateTeamName(input);
  const database = openTeamDatabase();
  try {
    return transaction(database, () => {
      const id = randomUUID();
      const timestamp = now();
      database.prepare("INSERT INTO teams (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)")
        .run(id, name, viewer.id, timestamp);
      database.prepare("INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)")
        .run(id, viewer.id, timestamp);
      const team = getTeam(database, id);
      if (!team) throw new AuthError("团队创建失败", 500, "TEAM_CREATE_FAILED");
      return teamDetail(database, team);
    });
  } finally {
    database.close();
  }
}

export function listTeams(viewer: Viewer | null): TeamSummary[] {
  requireViewer(viewer);
  const database = openTeamDatabase();
  try {
    const rows = database.prepare(`
      SELECT t.id, t.name, t.owner_id, t.created_at
      FROM teams t
      JOIN team_members m ON m.team_id = t.id AND m.user_id = ?
      ORDER BY t.created_at DESC, t.name ASC
    `).all(viewer.id) as unknown as TeamRow[];
    return rows.map(serializeTeam);
  } finally {
    database.close();
  }
}

export function getTeamDetail(viewer: Viewer | null, teamId: string): TeamDetail {
  requireViewer(viewer);
  const database = openTeamDatabase();
  try {
    return transaction(database, () => {
      requireMembership(database, teamId, viewer.id);
      const team = getTeam(database, teamId);
      if (!team) throw new AuthError("团队不存在", 404, "TEAM_NOT_FOUND");
      return teamDetail(database, team);
    });
  } finally {
    database.close();
  }
}

export function createTeamInvite(
  viewer: Viewer | null,
  teamId: string,
  input: { expiresInHours?: unknown },
): TeamInvite {
  requireViewer(viewer);
  const hoursInput = input.expiresInHours ?? 24;
  if (typeof hoursInput !== "number" || !Number.isFinite(hoursInput) || Math.trunc(hoursInput) !== hoursInput || hoursInput < 1 || hoursInput > 168) {
    throw new AuthError("邀请有效期应为 1–168 小时");
  }
  const hours = hoursInput;
  const database = openTeamDatabase();
  try {
    return transaction(database, () => {
      requireOwner(database, teamId, viewer.id);
      const token = randomBytes(32).toString("base64url");
      const createdAt = now();
      const expiresAt = new Date(Date.now() + hours * 60 * MINUTE_MS).toISOString();
      const id = randomUUID();
      database.prepare(`
        INSERT INTO team_invites (id, team_id, token_hash, status, max_uses, uses_count, created_by, created_at, expires_at)
        VALUES (?, ?, ?, 'pending', 1, 0, ?, ?, ?)
      `).run(id, teamId, hashInviteToken(token), viewer.id, createdAt, expiresAt);
      return { id, token, expiresAt };
    });
  } finally {
    database.close();
  }
}

export function joinTeam(viewer: Viewer | null, input: { token?: unknown }): TeamDetail {
  requireViewer(viewer);
  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AuthError("邀请无效或已过期", 404, "INVITE_INVALID");
  const database = openTeamDatabase();
  try {
    return transaction(database, () => {
      const invite = database.prepare(`
        SELECT id, team_id, status, max_uses, uses_count, expires_at
        FROM team_invites WHERE token_hash = ?
      `).get(hashInviteToken(token)) as {
        id: string;
        team_id: string;
        status: "pending" | "accepted" | "revoked";
        max_uses: number;
        uses_count: number;
        expires_at: string;
      } | undefined;
      const invalid = () => new AuthError("邀请无效或已过期", 404, "INVITE_INVALID");
      if (!invite) throw invalid();
      const team = getTeam(database, invite.team_id);
      if (!team) throw invalid();
      const existing = getMembership(database, invite.team_id, viewer.id);
      if (existing) return teamDetail(database, team);
      const timestamp = now();
      if (invite.status !== "pending" || invite.uses_count >= invite.max_uses || Date.parse(invite.expires_at) <= Date.parse(timestamp)) throw invalid();
      const accepted = database.prepare(`
        UPDATE team_invites
        SET status = 'accepted', uses_count = uses_count + 1, accepted_at = ?, accepted_by = ?
        WHERE id = ? AND status = 'pending' AND uses_count < max_uses AND expires_at > ?
      `).run(timestamp, viewer.id, invite.id, timestamp) as { changes: number };
      if (Number(accepted.changes) !== 1) throw invalid();
      database.prepare("INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)")
        .run(invite.team_id, viewer.id, timestamp);
      return teamDetail(database, team);
    });
  } finally {
    database.close();
  }
}

export function leaveTeam(viewer: Viewer | null, teamId: string): TeamSummary {
  requireViewer(viewer);
  const database = openTeamDatabase();
  try {
    return transaction(database, () => {
      const membership = requireMembership(database, teamId, viewer.id);
      if (membership.role === "owner" && ownerCount(database, teamId) <= 1) {
        throw new AuthError("必须保留至少一名团队所有者", 409, "LAST_TEAM_OWNER");
      }
      database.prepare("DELETE FROM team_members WHERE team_id = ? AND user_id = ?").run(teamId, viewer.id);
      if (membership.role === "owner") refreshCanonicalOwner(database, teamId);
      const team = getTeam(database, teamId);
      if (!team) throw new AuthError("团队不存在", 404, "TEAM_NOT_FOUND");
      return serializeTeam(team);
    });
  } finally {
    database.close();
  }
}

export function removeTeamMember(viewer: Viewer | null, teamId: string, userId: string): TeamSummary {
  requireViewer(viewer);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new AuthError("成员不存在", 404, "MEMBER_NOT_FOUND");
  }
  const database = openTeamDatabase();
  try {
    return transaction(database, () => {
      requireOwner(database, teamId, viewer.id);
      if (viewer.id === userId) throw new AuthError("所有者请使用退出团队接口", 409, "OWNER_LEAVE_REQUIRED");
      const membership = getMembership(database, teamId, userId);
      if (!membership) throw new AuthError("成员不存在", 404, "MEMBER_NOT_FOUND");
      if (membership.role === "owner" && ownerCount(database, teamId) <= 1) {
        throw new AuthError("必须保留至少一名团队所有者", 409, "LAST_TEAM_OWNER");
      }
      database.prepare("DELETE FROM team_members WHERE team_id = ? AND user_id = ?").run(teamId, userId);
      if (membership.role === "owner") refreshCanonicalOwner(database, teamId);
      const team = getTeam(database, teamId);
      if (!team) throw new AuthError("团队不存在", 404, "TEAM_NOT_FOUND");
      return serializeTeam(team);
    });
  } finally {
    database.close();
  }
}

export function setTeamMemberRole(viewer: Viewer | null, teamId: string, userId: string, roleInput: unknown): TeamMember {
  requireViewer(viewer);
  const role = roleInput === "owner" || roleInput === "member" ? roleInput : null;
  if (!role) throw new AuthError("团队角色无效");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new AuthError("成员不存在", 404, "MEMBER_NOT_FOUND");
  }
  const database = openTeamDatabase();
  try {
    return transaction(database, () => {
      requireOwner(database, teamId, viewer.id);
      const membership = getMembership(database, teamId, userId);
      if (!membership) throw new AuthError("成员不存在", 404, "MEMBER_NOT_FOUND");
      if (membership.role === "owner" && role === "member" && ownerCount(database, teamId) <= 1) {
        throw new AuthError("必须保留至少一名团队所有者", 409, "LAST_TEAM_OWNER");
      }
      database.prepare("UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?").run(role, teamId, userId);
      if (membership.role === "owner" && role === "member") refreshCanonicalOwner(database, teamId);
      const updated = getMembership(database, teamId, userId);
      if (!updated) throw new AuthError("成员不存在", 404, "MEMBER_NOT_FOUND");
      return serializeMember(updated);
    });
  } finally {
    database.close();
  }
}
