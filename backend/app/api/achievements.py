"""User achievements CRUD routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import User, UserAchievement
from pydantic import BaseModel

router = APIRouter(prefix="/users/me/achievements", tags=["achievements"])


class AchievementCreate(BaseModel):
    name: str
    description: str | None = None
    achievement_type: str  # 论文|专利|获奖|项目成果|成就


class AchievementUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    achievement_type: str | None = None


class AchievementResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    achievement_type: str
    created_at: str

    model_config = {"from_attributes": True}


VALID_TYPES = {"论文", "专利", "获奖", "项目成果", "成就"}


@router.get("")
async def list_achievements(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserAchievement)
        .where(UserAchievement.user_id == current_user.id)
        .order_by(UserAchievement.achieved_at.desc())
    )
    items = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "name": a.name,
            "description": a.description,
            "achievement_type": a.achievement_type,
            "created_at": a.achieved_at.isoformat() if a.achieved_at else None,
        }
        for a in items
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_achievement(
    body: AchievementCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.achievement_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"类型必须是: {', '.join(VALID_TYPES)}")
    ach = UserAchievement(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        achievement_type=body.achievement_type,
    )
    db.add(ach)
    await db.commit()
    await db.refresh(ach)
    return {
        "id": str(ach.id),
        "name": ach.name,
        "description": ach.description,
        "achievement_type": ach.achievement_type,
        "created_at": ach.achieved_at.isoformat() if ach.achieved_at else None,
    }


@router.put("/{ach_id}")
async def update_achievement(
    ach_id: str,
    body: AchievementUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ach = await _get_own_achievement(ach_id, current_user.id, db)
    if body.name is not None:
        ach.name = body.name
    if body.description is not None:
        ach.description = body.description
    if body.achievement_type is not None:
        if body.achievement_type not in VALID_TYPES:
            raise HTTPException(status_code=400, detail=f"类型必须是: {', '.join(VALID_TYPES)}")
        ach.achievement_type = body.achievement_type
    await db.commit()
    await db.refresh(ach)
    return {
        "id": str(ach.id),
        "name": ach.name,
        "description": ach.description,
        "achievement_type": ach.achievement_type,
        "created_at": ach.achieved_at.isoformat() if ach.achieved_at else None,
    }


@router.delete("/{ach_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_achievement(
    ach_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ach = await _get_own_achievement(ach_id, current_user.id, db)
    await db.delete(ach)
    await db.commit()


async def _get_own_achievement(ach_id: str, user_id, db: AsyncSession):
    from uuid import UUID
    result = await db.execute(
        select(UserAchievement).where(
            UserAchievement.id == UUID(ach_id),
            UserAchievement.user_id == user_id,
        )
    )
    ach = result.scalar_one_or_none()
    if not ach:
        raise HTTPException(status_code=404, detail="成果不存在或无权操作")
    return ach
