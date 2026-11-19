// 为本机管理员铸造演示录制用会话(等价于登录产物,不触碰密码)。
// 用法:node scripts/demo/forge-admin-session.mjs
// 产出:data/demo-session.token(裸 token,git 忽略;供录制脚本设 cookie 用)
import { randomBytes, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const dbPath = resolve(process.cwd(), "..", "data", "lab-galaxy.db");
const tokenPath = resolve(process.cwd(), "..", "data", "demo-session.token");
const SESSION_DAYS = 7; // 演示录制够用,短期失效降低遗留风险

const db = new DatabaseSync(dbPath);
try {
  const admin = db
    .prepare("SELECT id, display_name, role, status FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at ASC LIMIT 1")
    .get();
  if (!admin) throw new Error("库中没有 active 管理员账户");

  const token = randomBytes(32).toString("base64url"); // 43 字符,符合 resolveSession 校验
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("token 格式异常");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const ts = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();

  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).run(tokenHash, admin.id, ts, ts, expiresAt);
  writeFileSync(tokenPath, token, { encoding: "utf8", mode: 0o600 });

  // 回读验证(不打印 token 本体)
  const check = db
    .prepare("SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ? AND expires_at > ?")
    .get(tokenHash, ts);
  if (Number(check.n) !== 1) throw new Error("会话写入后回读失败");
  console.log(`OK 已为「${admin.display_name}」铸造会话,${SESSION_DAYS} 天后过期;token 写入 ${tokenPath}`);
} finally {
  db.close();
}
