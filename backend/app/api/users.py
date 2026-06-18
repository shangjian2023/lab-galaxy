"""User authentication & profile routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models.models import User, Document, Template, PointsLog
from app.schemas.user import (
    TokenResponse,
    UserLogin,
    UserProfile,
    UserRegister,
    UserUpdate,
)
from app.services.usage import get_quota_info

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: UserRegister, db: AsyncSession = Depends(get_db)):
    if (await db.execute(select(User).where(User.username == body.username))).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名已存在")
    if (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    from sqlalchemy import func as sql_func
    max_id = (await db.execute(select(sql_func.max(User.display_id)))).scalar()
    display_id = (max_id + 1) if max_id else 100001

    # Check if registration requires approval
    from app.models.models import AIConfig
    cfg = (await db.execute(select(AIConfig).where(AIConfig.key == "registration_require_approval"))).scalar_one_or_none()
    needs_approval = cfg and cfg.value.lower() == "true" if cfg else True

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        is_active=not needs_approval,
        display_id=display_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号待审批或已被禁用，请联系管理员")

    # Daily login reward (once per day)
    from app.services.points import award_points, POINTS_RULES, count_today
    if await count_today(db, user.id, "每日登录") < 1:
        award_points(user, db, POINTS_RULES["login_daily"], "每日登录")
        await db.commit()

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserProfile)
async def get_profile(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserProfile)
async def update_profile(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.nickname is not None:
        current_user.nickname = body.nickname
    if body.avatar is not None:
        current_user.avatar = body.avatar
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/me/dashboard")
async def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = current_user.id

    doc_count = (await db.execute(
        select(func.count()).where(Document.uploaded_by == uid)
    )).scalar() or 0

    tpl_count = (await db.execute(
        select(func.count()).where(Template.created_by == uid)
    )).scalar() or 0

    recent_docs = (await db.execute(
        select(Document).where(Document.uploaded_by == uid).order_by(Document.created_at.desc()).limit(5)
    )).scalars().all()

    recent_points = (await db.execute(
        select(PointsLog).where(PointsLog.user_id == uid).order_by(PointsLog.created_at.desc()).limit(5)
    )).scalars().all()

    quota = await get_quota_info(db, current_user)

    return {
        "user": {
            "id": str(current_user.id),
            "username": current_user.username,
            "nickname": current_user.nickname,
            "avatar": current_user.avatar,
            "level": current_user.level,
            "points": current_user.points,
        },
        "stats": {
            "document_count": doc_count,
            "template_count": tpl_count,
            "points": current_user.points,
            "level": current_user.level,
        },
        "quota": quota,
        "recent_documents": [
            {
                "id": str(d.id),
                "title": d.title,
                "status": d.status,
                "created_at": d.created_at.isoformat(),
            }
            for d in recent_docs
        ],
        "recent_points": [
            {
                "change": p.change,
                "reason": p.reason,
                "created_at": p.created_at.isoformat(),
            }
            for p in recent_points
        ],
    }
