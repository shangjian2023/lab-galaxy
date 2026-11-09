PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    status          TEXT NOT NULL CHECK (status IN ('pending', 'active', 'disabled')),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    last_login_at   TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash      TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TEXT NOT NULL,
    last_seen_at    TEXT NOT NULL,
    expires_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    owner_id        TEXT NOT NULL REFERENCES users(id),
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
    team_id         TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    created_at      TEXT NOT NULL,
    PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id              TEXT PRIMARY KEY,
    source_manifest TEXT NOT NULL,
    target_count    INTEGER NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('running', 'completed', 'incomplete', 'failed')),
    started_at      TEXT NOT NULL,
    finished_at     TEXT,
    error_message   TEXT
);

CREATE TABLE IF NOT EXISTS documents (
    id              TEXT PRIMARY KEY,
    ingestion_run_id TEXT REFERENCES ingestion_runs(id),
    title           TEXT NOT NULL,
    source_url      TEXT NOT NULL UNIQUE,
    source_page     TEXT,
    institution     TEXT,
    format          TEXT NOT NULL CHECK (format IN ('pdf', 'docx')),
    license_note    TEXT,
    local_path      TEXT,
    sha256          TEXT,
    byte_size       INTEGER,
    status          TEXT NOT NULL CHECK (status IN ('downloaded', 'parsed', 'failed')),
    parser          TEXT,
    page_count      INTEGER,
    text_length     INTEGER,
    error_message   TEXT,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    owner_id        TEXT REFERENCES users(id),
    visibility      TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('private', 'team', 'public')),
    team_id         TEXT REFERENCES teams(id),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_pages (
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number     INTEGER,
    text            TEXT NOT NULL,
    text_length     INTEGER NOT NULL,
    PRIMARY KEY (document_id, page_number)
);

CREATE TABLE IF NOT EXISTS document_sections (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    ordinal         INTEGER NOT NULL,
    title           TEXT NOT NULL,
    text            TEXT NOT NULL,
    UNIQUE (document_id, ordinal)
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id              TEXT PRIMARY KEY,
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    page_start      INTEGER,
    page_end        INTEGER,
    text            TEXT NOT NULL,
    char_count      INTEGER NOT NULL,
    token_estimate  INTEGER NOT NULL,
    UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_institution ON documents(institution);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_visibility ON documents(visibility);
CREATE INDEX IF NOT EXISTS idx_documents_team ON documents(team_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_sections_document ON document_sections(document_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
