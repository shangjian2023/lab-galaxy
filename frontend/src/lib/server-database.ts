import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const readyDatabases = new Set<string>();

export function resolveDatabasePath(): string {
  if (process.env.CORPUS_DB_PATH) return path.resolve(process.env.CORPUS_DB_PATH);
  const candidates = [
    path.resolve(process.cwd(), "data", "lab-galaxy.db"),
    path.resolve(process.cwd(), "..", "data", "lab-galaxy.db"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function ensureIdentitySchema(database: DatabaseSync) {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'disabled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
      created_at TEXT NOT NULL,
      PRIMARY KEY (team_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
  `);

  const documents = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'documents'").get();
  if (documents) {
    const columns = new Set(
      (database.prepare("PRAGMA table_info(documents)").all() as Array<{ name: string }>).map((column) => column.name),
    );
    if (!columns.has("owner_id")) database.exec("ALTER TABLE documents ADD COLUMN owner_id TEXT REFERENCES users(id)");
    if (!columns.has("visibility")) database.exec("ALTER TABLE documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'");
    if (!columns.has("team_id")) database.exec("ALTER TABLE documents ADD COLUMN team_id TEXT REFERENCES teams(id)");
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
      CREATE INDEX IF NOT EXISTS idx_documents_visibility ON documents(visibility);
      CREATE INDEX IF NOT EXISTS idx_documents_team ON documents(team_id);
    `);
  }
}

function ensureIngestionSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      ingestion_run_id TEXT,
      title TEXT NOT NULL,
      source_url TEXT NOT NULL UNIQUE,
      source_page TEXT,
      institution TEXT,
      format TEXT NOT NULL CHECK (format IN ('pdf', 'docx')),
      license_note TEXT,
      local_path TEXT,
      sha256 TEXT,
      byte_size INTEGER,
      status TEXT NOT NULL CHECK (status IN ('downloaded', 'parsed', 'failed')),
      parser TEXT,
      page_count INTEGER,
      text_length INTEGER,
      error_message TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      owner_id TEXT REFERENCES users(id),
      visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('private', 'team', 'public')),
      team_id TEXT REFERENCES teams(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_pages (
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      page_number INTEGER,
      text TEXT NOT NULL,
      text_length INTEGER NOT NULL,
      PRIMARY KEY (document_id, page_number)
    );

    CREATE TABLE IF NOT EXISTS document_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      UNIQUE (document_id, ordinal)
    );

    CREATE TABLE IF NOT EXISTS document_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      page_start INTEGER,
      page_end INTEGER,
      text TEXT NOT NULL,
      char_count INTEGER NOT NULL,
      token_estimate INTEGER NOT NULL,
      UNIQUE (document_id, chunk_index)
    );

    CREATE TABLE IF NOT EXISTS upload_tasks (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      original_filename TEXT NOT NULL,
      format TEXT NOT NULL CHECK (format IN ('pdf', 'docx')),
      visibility TEXT NOT NULL CHECK (visibility IN ('private', 'team', 'public')),
      team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
      source_url TEXT NOT NULL,
      license_note TEXT,
      local_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'incomplete')),
      progress INTEGER NOT NULL CHECK (progress >= 0 AND progress <= 100),
      attempts INTEGER NOT NULL CHECK (attempts >= 0),
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      UNIQUE (owner_id, sha256)
    );

    CREATE INDEX IF NOT EXISTS idx_upload_tasks_owner_created
      ON upload_tasks(owner_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_upload_tasks_status
      ON upload_tasks(status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_chunks_document
      ON document_chunks(document_id, chunk_index);
    CREATE INDEX IF NOT EXISTS idx_sections_document
      ON document_sections(document_id, ordinal);
  `);
}

function ensureReady(filename: string) {
  if (readyDatabases.has(filename)) return;
  const database = new DatabaseSync(filename);
  try {
    ensureIdentitySchema(database);
    ensureIngestionSchema(database);
    readyDatabases.add(filename);
  } finally {
    database.close();
  }
}

export function openIdentityDatabase(): DatabaseSync {
  const filename = resolveDatabasePath();
  mkdirSync(path.dirname(filename), { recursive: true });
  ensureReady(filename);
  const database = new DatabaseSync(filename);
  database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return database;
}

export function openReadonlyDatabase(): DatabaseSync {
  const filename = resolveDatabasePath();
  if (!existsSync(filename)) throw new Error(`研究语料数据库不存在：${filename}`);
  ensureReady(filename);
  const database = new DatabaseSync(filename, { readOnly: true });
  database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return database;
}
