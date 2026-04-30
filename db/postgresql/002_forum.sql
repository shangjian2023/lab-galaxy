-- 知识发酵池论坛系统 — 数据库迁移

-- ── Board & Post Type Enums ──
DO $$ BEGIN
    CREATE TYPE board_slug AS ENUM (
        'methodology',      -- 方法论堂
        'graph_hall',       -- 图谱议事厅
        'emergency_room',   -- 实验急诊室
        'aha_square',       -- Aha! 广场
        'cross_discipline', -- 学科撞车现场
        'announcements'     -- 公告堂
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE post_type AS ENUM (
        'regular', 'insight', 'prediction', 'challenge', 'exchange-diary', 'cold-knowledge'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE thread_status AS ENUM (
        'open', 'resolved', 'locked', 'featured'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── forum_threads ──
CREATE TABLE IF NOT EXISTS forum_threads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board           board_slug NOT NULL,
    sub_board       VARCHAR(50),
    post_type       post_type NOT NULL DEFAULT 'regular',
    title           VARCHAR(200) NOT NULL,
    content         TEXT NOT NULL,
    tags            VARCHAR(50)[],
    graph_node_ids  VARCHAR(255)[],
    status          thread_status NOT NULL DEFAULT 'open',
    is_featured     BOOLEAN DEFAULT FALSE,
    reply_count     INTEGER DEFAULT 0,
    like_count      INTEGER DEFAULT 0,
    view_count      INTEGER DEFAULT 0,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── forum_replies ──
CREATE TABLE IF NOT EXISTS forum_replies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id       UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES forum_replies(id),
    content         TEXT NOT NULL,
    graph_node_ids  VARCHAR(255)[],
    is_best_answer  BOOLEAN DEFAULT FALSE,
    like_count      INTEGER DEFAULT 0,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── thread_likes ──
CREATE TABLE IF NOT EXISTS thread_likes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id),
    thread_id   UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, thread_id)
);

-- ── reply_likes ──
CREATE TABLE IF NOT EXISTS reply_likes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id),
    reply_id    UUID NOT NULL REFERENCES forum_replies(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, reply_id)
);

-- ── thread_bookmarks ──
CREATE TABLE IF NOT EXISTS thread_bookmarks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id),
    thread_id   UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, thread_id)
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_forum_threads_board ON forum_threads(board);
CREATE INDEX IF NOT EXISTS idx_forum_threads_status ON forum_threads(status);
CREATE INDEX IF NOT EXISTS idx_forum_threads_created_at ON forum_threads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_threads_featured ON forum_threads(is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_forum_threads_created_by ON forum_threads(created_by);
CREATE INDEX IF NOT EXISTS idx_forum_replies_thread_id ON forum_replies(thread_id);
CREATE INDEX IF NOT EXISTS idx_forum_replies_parent_id ON forum_replies(parent_id);
CREATE INDEX IF NOT EXISTS idx_forum_replies_created_by ON forum_replies(created_by);
CREATE INDEX IF NOT EXISTS idx_thread_likes_thread ON thread_likes(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_likes_user ON thread_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_reply_likes_reply ON reply_likes(reply_id);
CREATE INDEX IF NOT EXISTS idx_reply_likes_user ON reply_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_thread_bookmarks_user ON thread_bookmarks(user_id);
