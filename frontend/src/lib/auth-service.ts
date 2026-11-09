import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AccountUser, UserStatus, Viewer } from "@/lib/auth-types";
import { openIdentityDatabase } from "@/lib/server-database";

function deriveKey(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derived) => error ? reject(error) : resolve(derived));
  });
}
const SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 64 };
let dummyHash: Promise<string> | undefined;

export class AuthError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "AUTH_ERROR") {
    super(message);
    this.name = "AuthError";
  }
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: AccountUser["role"];
  status: UserStatus;
  created_at: string;
  last_login_at: string | null;
}

export interface AuthResult {
  user: AccountUser;
  token: string | null;
  requiresApproval: boolean;
}

export interface ResolvedSession {
  user: AccountUser;
  expiresAt: string;
  refreshed: boolean;
}

function now() {
  return new Date().toISOString();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function publicUser(row: UserRow): AccountUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

function validateCredentials(emailInput: unknown, password: unknown, displayName?: unknown) {
  const email = typeof emailInput === "string" ? emailInput.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError("请输入有效邮箱地址");
  }
  if (typeof password !== "string" || Array.from(password).length < 10 || Array.from(password).length > 128 || Buffer.byteLength(password) > 512) {
    throw new AuthError("密码长度应为 10–128 个字符");
  }
  let name: string | undefined;
  if (displayName !== undefined) {
    name = typeof displayName === "string" ? displayName.trim() : "";
    if (Array.from(name).length < 2 || Array.from(name).length > 40) {
      throw new AuthError("昵称长度应为 2–40 个字符");
    }
  }
  return { email, password, displayName: name };
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, SCRYPT.keyLength, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024,
  }) as Buffer;
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), derived.toString("base64url")].join("$");
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  try {
    const [algorithm, n, r, p, salt, expected] = encoded.split("$");
    if (algorithm !== "scrypt" || !salt || !expected) return false;
    const expectedBuffer = Buffer.from(expected, "base64url");
    const derived = await deriveKey(password, Buffer.from(salt, "base64url"), expectedBuffer.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    }) as Buffer;
    return derived.length === expectedBuffer.length && timingSafeEqual(derived, expectedBuffer);
  } catch {
    return false;
  }
}

function createSession(database: DatabaseSync, userId: string): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  const timestamp = now();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS).toISOString();
  database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(timestamp);
  database.prepare("INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(hashToken(token), userId, timestamp, timestamp, expiresAt);
  return { token, expiresAt };
}

export async function registerUser(input: { email?: unknown; password?: unknown; displayName?: unknown }): Promise<AuthResult> {
  const { email, password, displayName } = validateCredentials(input.email, input.password, input.displayName);
  if (displayName === undefined) throw new AuthError("昵称长度应为 2–40 个字符");
  const passwordHash = await hashPassword(password);
  const database = openIdentityDatabase();
  let userId = "";
  let firstUser = false;
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      const count = database.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
      firstUser = Number(count.count) === 0;
      userId = randomUUID();
      const timestamp = now();
      database.prepare(`
        INSERT INTO users (id, email, display_name, password_hash, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, email, displayName, passwordHash, firstUser ? "admin" : "member", firstUser ? "active" : "pending", timestamp, timestamp);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
        throw new AuthError("该邮箱已注册，请直接登录", 409, "EMAIL_EXISTS");
      }
      throw error;
    }
    const row = database.prepare("SELECT * FROM users WHERE id = ?").get(userId) as unknown as UserRow;
    const session = firstUser ? createSession(database, userId) : null;
    return { user: publicUser(row), token: session?.token ?? null, requiresApproval: !firstUser };
  } finally {
    database.close();
  }
}

export async function loginUser(input: { email?: unknown; password?: unknown }): Promise<AuthResult> {
  const { email, password } = validateCredentials(input.email, input.password);
  const database = openIdentityDatabase();
  try {
    const row = database.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
    if (!dummyHash) dummyHash = hashPassword(randomBytes(24).toString("base64url"));
    const valid = await verifyPassword(password, row?.password_hash ?? await dummyHash);
    if (!row || !valid) throw new AuthError("邮箱或密码不正确", 401, "INVALID_CREDENTIALS");
    if (row.status === "pending") throw new AuthError("账号正在等待管理员审核", 403, "APPROVAL_REQUIRED");
    if (row.status !== "active") throw new AuthError("账号已被禁用，请联系管理员", 403, "ACCOUNT_DISABLED");
    const timestamp = now();
    database.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, row.id);
    const session = createSession(database, row.id);
    return { user: publicUser({ ...row, last_login_at: timestamp }), token: session.token, requiresApproval: false };
  } finally {
    database.close();
  }
}

export function resolveSession(token: string | undefined, touch = false): ResolvedSession | null {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const database = openIdentityDatabase();
  try {
    const row = database.prepare(`
      SELECT u.*, s.expires_at, s.last_seen_at
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `).get(hashToken(token)) as (UserRow & { expires_at: string; last_seen_at: string }) | undefined;
    if (!row) return null;
    const timestamp = Date.now();
    if (Date.parse(row.expires_at) <= timestamp || row.status !== "active") {
      database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
      return null;
    }
    let expiresAt = row.expires_at;
    let refreshed = false;
    if (touch && Date.parse(row.expires_at) - timestamp < (SESSION_DAYS / 2) * DAY_MS) {
      expiresAt = new Date(timestamp + SESSION_DAYS * DAY_MS).toISOString();
      refreshed = true;
    }
    if (touch && (refreshed || timestamp - Date.parse(row.last_seen_at) > 15 * 60 * 1000)) {
      database.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?")
        .run(new Date(timestamp).toISOString(), expiresAt, hashToken(token));
    }
    return { user: publicUser(row), expiresAt, refreshed };
  } finally {
    database.close();
  }
}

export function logoutUser(token: string | undefined) {
  if (!token) return;
  const database = openIdentityDatabase();
  try {
    database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  } finally {
    database.close();
  }
}

export function toViewer(user: AccountUser | null): Viewer | null {
  return user ? { id: user.id, role: user.role } : null;
}

export function listUsers(actor: Viewer): AccountUser[] {
  if (actor.role !== "admin") throw new AuthError("需要管理员权限", 403, "ADMIN_REQUIRED");
  const database = openIdentityDatabase();
  try {
    const rows = database.prepare("SELECT * FROM users ORDER BY created_at ASC").all() as unknown as UserRow[];
    return rows.map(publicUser);
  } finally {
    database.close();
  }
}

export function setUserStatus(actor: Viewer, userId: string, status: UserStatus): AccountUser {
  if (actor.role !== "admin") throw new AuthError("需要管理员权限", 403, "ADMIN_REQUIRED");
  if (!["pending", "active", "disabled"].includes(status)) throw new AuthError("无效账号状态");
  if (actor.id === userId && status !== "active") throw new AuthError("不能禁用当前管理员账号", 409, "SELF_DISABLE");
  const database = openIdentityDatabase();
  try {
    database.exec("BEGIN IMMEDIATE");
    const row = database.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
    if (!row) {
      database.exec("ROLLBACK");
      throw new AuthError("用户不存在", 404, "USER_NOT_FOUND");
    }
    if (row.role === "admin" && row.status === "active" && status !== "active") {
      const admins = database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'").get() as { count: number };
      if (Number(admins.count) <= 1) {
        database.exec("ROLLBACK");
        throw new AuthError("必须保留至少一名可用管理员", 409, "LAST_ADMIN");
      }
    }
    database.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), userId);
    if (status !== "active") database.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    database.exec("COMMIT");
    return publicUser({ ...row, status });
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }
}
