import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import router as api_router
from app.core.config import settings

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


@app.on_event("startup")
async def _apply_schema_updates():
    """Apply incremental schema updates that Alembic would normally handle."""
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


@app.get("/health")
async def health_check():
    return {"status": "ok"}
