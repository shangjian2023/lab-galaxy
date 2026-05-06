import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import router as api_router
from app.core.config import settings
from app.api.equipment import router as equipment_router

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.PROJECT_NAME, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")
app.include_router(equipment_router, prefix="/api/v1/equipment")

from app.api.ws_chat import router as ws_router
app.include_router(ws_router, prefix="/api/v1")


@app.on_event("startup")
async def _startup_chat_bus():
    from app.services.chat_bus import chat_bus
    await chat_bus.connect()


@app.on_event("shutdown")
async def _shutdown_chat_bus():
    from app.services.chat_bus import chat_bus
    await chat_bus.close()


@app.on_event("shutdown")
async def _shutdown_neo4j():
    from app.api.graph import _driver_instance
    if _driver_instance:
        await _driver_instance.close()


@app.on_event("startup")
async def _apply_schema_updates():
    """Apply incremental schema updates (daily_usage, forum, teams, etc.)."""
    from app.core.database import engine
    from sqlalchemy import text

    async with engine.begin() as conn:
        # Add duplicate_info column if missing
        try:
            await conn.execute(text(
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS duplicate_info TEXT"
            ))
        except Exception as e:
            logger.debug(f"Column duplicate_info may already exist: {e}")

        # Add awaiting_confirmation to doc_status enum if missing
        try:
            await conn.execute(text(
                "ALTER TYPE doc_status ADD VALUE IF NOT EXISTS 'awaiting_confirmation'"
            ))
        except Exception as e:
            logger.debug(f"Enum value awaiting_confirmation may already exist: {e}")

        # Apply forum schema
        try:
            # Create enums (IF NOT EXISTS via DO blocks)
            await conn.execute(text("""
                DO $$ BEGIN
                    CREATE TYPE board_slug AS ENUM (
                        'methodology', 'graph_hall', 'emergency_room',
                        'aha_square', 'cross_discipline', 'announcements'
                    );
                EXCEPTION WHEN duplicate_object THEN null; END $$;
            """))
            await conn.execute(text("""
                DO $$ BEGIN
                    CREATE TYPE post_type AS ENUM (
                        'regular', 'insight', 'prediction', 'challenge',
                        'exchange-diary', 'cold-knowledge'
                    );
                EXCEPTION WHEN duplicate_object THEN null; END $$;
            """))
            await conn.execute(text("""
                DO $$ BEGIN
                    CREATE TYPE thread_status AS ENUM (
                        'open', 'resolved', 'locked', 'featured'
                    );
                EXCEPTION WHEN duplicate_object THEN null; END $$;
            """))

            # Create tables
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS forum_threads (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    board VARCHAR(50) NOT NULL,
                    sub_board VARCHAR(50),
                    post_type VARCHAR(20) NOT NULL DEFAULT 'regular',
                    title VARCHAR(200) NOT NULL,
                    content TEXT NOT NULL,
                    tags VARCHAR(50)[],
                    graph_node_ids VARCHAR(255)[],
                    status VARCHAR(20) NOT NULL DEFAULT 'open',
                    is_featured BOOLEAN DEFAULT FALSE,
                    reply_count INTEGER DEFAULT 0,
                    like_count INTEGER DEFAULT 0,
                    view_count INTEGER DEFAULT 0,
                    created_by UUID NOT NULL REFERENCES users(id),
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS forum_replies (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
                    parent_id UUID REFERENCES forum_replies(id),
                    content TEXT NOT NULL,
                    graph_node_ids VARCHAR(255)[],
                    is_best_answer BOOLEAN DEFAULT FALSE,
                    like_count INTEGER DEFAULT 0,
                    created_by UUID NOT NULL REFERENCES users(id),
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS thread_likes (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID NOT NULL REFERENCES users(id),
                    thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE (user_id, thread_id)
                )
            """))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS reply_likes (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID NOT NULL REFERENCES users(id),
                    reply_id UUID NOT NULL REFERENCES forum_replies(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE (user_id, reply_id)
                )
            """))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS thread_bookmarks (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID NOT NULL REFERENCES users(id),
                    thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE (user_id, thread_id)
                )
            """))

            # Create indexes
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_forum_threads_board ON forum_threads(board)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_forum_threads_status ON forum_threads(status)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_forum_threads_created_at ON forum_threads(created_at DESC)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_forum_threads_featured ON forum_threads(is_featured) WHERE is_featured = TRUE"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_forum_threads_created_by ON forum_threads(created_by)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_forum_replies_thread_id ON forum_replies(thread_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_forum_replies_parent_id ON forum_replies(parent_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_forum_replies_created_by ON forum_replies(created_by)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_thread_likes_thread ON thread_likes(thread_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_thread_likes_user ON thread_likes(user_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_reply_likes_reply ON reply_likes(reply_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_reply_likes_user ON reply_likes(user_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_thread_bookmarks_user ON thread_bookmarks(user_id)"))

            logger.info("Forum schema migration completed.")
        except Exception as e:
            logger.debug(f"Forum migration may have partial issues: {e}")

        # Team schema
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS teams (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    name VARCHAR(100) NOT NULL,
                    description TEXT,
                    owner_id UUID NOT NULL REFERENCES users(id),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS team_members (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL REFERENCES users(id),
                    role VARCHAR(20) NOT NULL DEFAULT 'member',
                    joined_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE (team_id, user_id)
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_teams_owner ON teams(owner_id)"))

            logger.info("Team schema migration completed.")
        except Exception as e:
            logger.debug(f"Team migration may have partial issues: {e}")

        # Team messages
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS team_messages (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL REFERENCES users(id),
                    message_type VARCHAR(20) NOT NULL DEFAULT 'text',
                    content TEXT NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_team_messages_team ON team_messages(team_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_team_messages_created_at ON team_messages(created_at DESC)"))
            logger.info("Team messages schema migration completed.")
        except Exception as e:
            logger.debug(f"Team messages migration may have partial issues: {e}")

        # Daily usage (rate limiting)
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS daily_usage (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    date DATE NOT NULL DEFAULT CURRENT_DATE,
                    query_count INTEGER NOT NULL DEFAULT 0,
                    upload_count INTEGER NOT NULL DEFAULT 0,
                    UNIQUE (user_id, date)
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, date)"))
            logger.info("Daily usage schema migration completed.")
        except Exception as e:
            logger.debug(f"Daily usage migration may have partial issues: {e}")

        # AI Config
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_config (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(50) UNIQUE NOT NULL,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_by UUID REFERENCES users(id)
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ai_config_key ON ai_config(key)"))
            logger.info("AI config schema migration completed.")
        except Exception as e:
            logger.debug(f"AI config migration may have partial issues: {e}")

        # User achievements
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS user_achievements (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID NOT NULL REFERENCES users(id),
                    document_id UUID REFERENCES documents(id),
                    name VARCHAR(200) NOT NULL,
                    description TEXT,
                    achievement_type VARCHAR(50) NOT NULL,
                    achieved_at TIMESTAMPTZ DEFAULT NOW(),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id)"))
            logger.info("User achievements schema migration completed.")
        except Exception as e:
            logger.debug(f"User achievements migration may have partial issues: {e}")

        # Monthly usage
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS monthly_usage (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID NOT NULL REFERENCES users(id),
                    year_month VARCHAR(7) NOT NULL,
                    growth_analysis_count INTEGER NOT NULL DEFAULT 0,
                    UNIQUE (user_id, year_month)
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_monthly_usage_user ON monthly_usage(user_id, year_month)"))
            logger.info("Monthly usage schema migration completed.")
        except Exception as e:
            logger.debug(f"Monthly usage migration may have partial issues: {e}")

        # Equipment requests
        try:
            await conn.execute(text("""
                DO $$ BEGIN
                    CREATE TYPE equip_req_status AS ENUM ('pending', 'approved', 'rejected');
                EXCEPTION WHEN duplicate_object THEN null; END $$;
            """))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS equipment_requests (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID NOT NULL REFERENCES users(id),
                    request_type VARCHAR(30) NOT NULL,
                    title VARCHAR(200) NOT NULL,
                    description TEXT,
                    quantity INTEGER NOT NULL DEFAULT 1,
                    status VARCHAR(20) NOT NULL DEFAULT 'pending',
                    admin_reply TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equip_req_user ON equipment_requests(user_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equip_req_status ON equipment_requests(status)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_equip_req_created ON equipment_requests(created_at DESC)"))
            logger.info("Equipment requests schema migration completed.")
        except Exception as e:
            logger.debug(f"Equipment requests migration may have partial issues: {e}")

        # Equipment catalog table + seed data
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS equipment_catalog (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    name VARCHAR(100) NOT NULL,
                    icon VARCHAR(10) NOT NULL DEFAULT '🔧',
                    description TEXT,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    is_active BOOLEAN NOT NULL DEFAULT true,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            # Seed default items if table is empty
            from app.api.equipment import _SEED_CATALOG
            result = await conn.execute(text("SELECT COUNT(*) FROM equipment_catalog"))
            count = result.scalar() or 0
            if count == 0:
                for name, icon, desc, order in _SEED_CATALOG:
                    await conn.execute(text(
                        "INSERT INTO equipment_catalog (name, icon, description, sort_order) VALUES (:name, :icon, :desc, :order)"
                    ), {"name": name, "icon": icon, "desc": desc, "order": order})
                logger.info("Equipment catalog seeded with 20 items.")
        except Exception as e:
            logger.debug(f"Equipment catalog migration may have partial issues: {e}")

        # Add display_id to users
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_id INTEGER UNIQUE"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_users_display_id ON users(display_id)"
            ))
            await conn.execute(text("""
                WITH numbered AS (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
                    FROM users
                    WHERE display_id IS NULL
                )
                UPDATE users
                SET display_id = 100000 + numbered.rn
                FROM numbered
                WHERE users.id = numbered.id
                  AND users.display_id IS NULL
            """))
            logger.info("User display_id column + backfill completed.")
        except Exception as e:
            logger.debug(f"Display_id migration may have partial issues: {e}")


@app.get("/")
async def root():
    return {"message": "LabGalaxy API", "version": "0.1.0", "docs": "/docs"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}
