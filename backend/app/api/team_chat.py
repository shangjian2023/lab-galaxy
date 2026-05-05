"""REST endpoints for team chat message history."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Team, TeamMember, TeamMessage, User

router = APIRouter(prefix="/teams", tags=["team-chat"])


async def _verify_membership(team_id: str, user: User, db: AsyncSession) -> Team:
    team = (await db.execute(select(Team).where(Team.id == UUID(team_id)))).scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    membership = (await db.execute(
        select(TeamMember).where(TeamMember.team_id == team.id, TeamMember.user_id == user.id)
    )).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="不是该团队成员")
    return team


@router.get("/{team_id}/messages")
async def get_messages(
    team_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _verify_membership(team_id, current_user, db)

    # Total count
    total = (await db.execute(
        select(func.count()).select_from(TeamMessage).where(TeamMessage.team_id == UUID(team_id))
    )).scalar_one()

    # Messages (newest first for pagination, reversed for display)
    offset = (page - 1) * page_size
    rows = (await db.execute(
        select(TeamMessage, User)
        .join(User, TeamMessage.user_id == User.id)
        .where(TeamMessage.team_id == UUID(team_id))
        .order_by(TeamMessage.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )).all()

    items = [
        {
            "id": str(msg.id),
            "team_id": str(msg.team_id),
            "user_id": str(msg.user_id),
            "nickname": user.nickname or user.username,
            "avatar": user.avatar,
            "message_type": msg.message_type,
            "content": msg.content,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
        }
        for msg, user in reversed(rows)
    ]

    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.get("/{team_id}/messages/recent")
async def get_recent_messages(
    team_id: str,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _verify_membership(team_id, current_user, db)

    rows = (await db.execute(
        select(TeamMessage, User)
        .join(User, TeamMessage.user_id == User.id)
        .where(TeamMessage.team_id == UUID(team_id))
        .order_by(TeamMessage.created_at.desc())
        .limit(limit)
    )).all()

    items = [
        {
            "id": str(msg.id),
            "team_id": str(msg.team_id),
            "user_id": str(msg.user_id),
            "nickname": user.nickname or user.username,
            "avatar": user.avatar,
            "message_type": msg.message_type,
            "content": msg.content,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
        }
        for msg, user in reversed(rows)
    ]

    return {"items": items}
