"""Daily usage tracking and rate limiting."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from app.models.models import DailyUsage, User

BASE_QUOTA = 15


async def _get_or_create_usage(db: AsyncSession, user_id: uuid.UUID) -> DailyUsage:
    today = datetime.now(UTC).date()
    result = await db.execute(
        select(DailyUsage).where(
            DailyUsage.user_id == user_id,
            DailyUsage.date == today,
        )
    )
    usage = result.scalar_one_or_none()
    if usage is None:
        usage = DailyUsage(user_id=user_id, date=today)
        db.add(usage)
        await db.flush()
    return usage


def _compute_limit(user: User) -> int:
    return BASE_QUOTA + user.level


def _quota_info(allowed: bool, remaining: int, limit: int, unlimited: bool) -> dict:
    return {
        "allowed": allowed,
        "remaining": remaining,
        "limit": limit,
        "unlimited": unlimited,
    }


async def check_query_quota(db: AsyncSession, user: User) -> dict:
    """Check if user can make a query. Returns quota dict."""
    if user.role == "admin":
        return _quota_info(True, -1, -1, True)
    usage = await _get_or_create_usage(db, user.id)
    limit = _compute_limit(user)
    remaining = max(0, limit - usage.query_count)
    return _quota_info(remaining > 0, remaining, limit, False)


async def check_upload_quota(db: AsyncSession, user: User) -> dict:
    """Check if user can upload a document. Returns quota dict."""
    if user.role == "admin":
        return _quota_info(True, -1, -1, True)
    usage = await _get_or_create_usage(db, user.id)
    limit = _compute_limit(user)
    remaining = max(0, limit - usage.upload_count)
    return _quota_info(remaining > 0, remaining, limit, False)


async def increment_query(db: AsyncSession, user_id: uuid.UUID) -> None:
    usage = await _get_or_create_usage(db, user_id)
    usage.query_count += 1
    await db.flush()


async def increment_upload(db: AsyncSession, user_id: uuid.UUID) -> None:
    usage = await _get_or_create_usage(db, user_id)
    usage.upload_count += 1
    await db.flush()


async def get_quota_info(db: AsyncSession, user: User) -> dict:
    """Get full quota info for both queries and uploads (for profile/dashboard)."""
    if user.role == "admin":
        return {
            "query": _quota_info(True, -1, -1, True),
            "upload": _quota_info(True, -1, -1, True),
        }
    usage = await _get_or_create_usage(db, user.id)
    limit = _compute_limit(user)
    return {
        "query": _quota_info(
            usage.query_count < limit,
            max(0, limit - usage.query_count),
            limit,
            False,
        ),
        "upload": _quota_info(
            usage.upload_count < limit,
            max(0, limit - usage.upload_count),
            limit,
            False,
        ),
    }
