"""Template marketplace & growth system API."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models.models import PointsLog, Template, TemplateComment, TemplateLike, User

router = APIRouter(prefix="/templates", tags=["templates"])

# ========== Level System ==========

LEVEL_CONFIG = [
    {"level": 1, "title": "见习学者", "icon": "·", "points": 0, "frame": "none"},
    {"level": 2, "title": "助理学者", "icon": "★", "points": 600, "frame": "copper"},
    {"level": 3, "title": "正式学者", "icon": "★★", "points": 1800, "frame": "silver"},
    {"level": 4, "title": "高级学者", "icon": "★★★", "points": 3600, "frame": "gold"},
    {"level": 5, "title": "资深学者", "icon": "◆", "points": 6000, "frame": "diamond"},
    {"level": 6, "title": "首席学者", "icon": "◆◆", "points": 10800, "frame": "rainbow"},
    {"level": 7, "title": "荣誉学者", "icon": "⚜", "points": 18000, "frame": "dark_gold"},
    {"level": 8, "title": "院士", "icon": "👑", "points": 30000, "frame": "crown"},
    {"level": 9, "title": "传奇院士", "icon": "🌌", "points": 50000, "frame": "galaxy"},
]

POINTS_RULES = {
    "upload_doc": 50,
    "ai_parse_complete": 30,
    "publish_template": 100,
    "template_adopted": 200,
    "comment_liked": 20,
    "insight_accepted": 40,
    "graph_contribution": 60,
    "login_streak_7": 70,
    "admin_featured": 80,
}


def calc_level(points: int) -> dict:
    """Calculate level from total points."""
    current = LEVEL_CONFIG[0]
    for cfg in LEVEL_CONFIG:
        if points >= cfg["points"]:
            current = cfg
        else:
            break
    idx = current["level"]
    next_cfg = LEVEL_CONFIG[idx] if idx < len(LEVEL_CONFIG) else None
    return {
        "level": current["level"],
        "title": current["title"],
        "icon": current["icon"],
        "frame": current["frame"],
        "points": points,
        "next_level_points": next_cfg["points"] if next_cfg else None,
        "progress": (
            (points - current["points"]) / (next_cfg["points"] - current["points"])
            if next_cfg and next_cfg["points"] > current["points"]
            else 1.0
        ),
    }


# ========== Schemas ==========

class TemplateCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = None
    content: str
    tags: list[str] | None = None
    category: str | None = None


class TemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    content: str | None = None
    tags: list[str] | None = None
    category: str | None = None


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=1000)


# ========== Marketplace ==========

@router.get("/market")
async def marketplace(
    keyword: str | None = Query(None),
    category: str | None = Query(None),
    sort: str = Query("popular", regex="^(popular|newest|downloads)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Browse published templates."""
    base = select(Template).where(Template.status == "published")
    if keyword:
        base = base.where(Template.name.ilike(f"%{keyword}%"))
    if category:
        base = base.where(Template.category == category)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0

    order = {"popular": Template.likes.desc(), "newest": Template.created_at.desc(), "downloads": Template.downloads.desc()}
    rows = (await db.execute(base.order_by(order.get(sort, Template.likes.desc())).offset((page - 1) * page_size).limit(page_size))).scalars().all()

    # Check user likes
    tpl_ids = [t.id for t in rows]
    liked = set()
    if tpl_ids:
        likes = (await db.execute(select(TemplateLike.template_id).where(TemplateLike.user_id == current_user.id, TemplateLike.template_id.in_(tpl_ids)))).scalars().all()
        liked = set(str(l) for l in likes)

    items = []
    for t in rows:
        items.append({
            "id": str(t.id), "name": t.name, "description": t.description,
            "tags": t.tags, "category": t.category, "is_official": t.is_official,
            "likes": t.likes, "downloads": t.downloads, "adoptions": t.adoptions,
            "is_liked": str(t.id) in liked,
            "created_by": str(t.created_by), "created_at": t.created_at.isoformat(),
        })

    return {"total": total, "items": items}


@router.get("/{tpl_id}")
async def get_template(tpl_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tpl = (await db.execute(select(Template).where(Template.id == tpl_id))).scalar_one_or_none()
    if not tpl:
        raise HTTPException(404, "模板不存在")
    if tpl.status != "published" and tpl.created_by != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "无权查看此模板")

    # Get comments
    comments = (await db.execute(
        select(TemplateComment).where(TemplateComment.template_id == tpl_id).order_by(TemplateComment.created_at.desc()).limit(20)
    )).scalars().all()

    liked = (await db.execute(
        select(TemplateLike).where(TemplateLike.user_id == current_user.id, TemplateLike.template_id == tpl_id)
    )).scalar_one_or_none()

    return {
        "id": str(tpl.id), "name": tpl.name, "description": tpl.description,
        "content": tpl.content, "tags": tpl.tags, "category": tpl.category,
        "status": tpl.status, "is_official": tpl.is_official,
        "likes": tpl.likes, "downloads": tpl.downloads, "adoptions": tpl.adoptions,
        "is_liked": liked is not None,
        "created_by": str(tpl.created_by), "created_at": tpl.created_at.isoformat(),
        "comments": [{"id": str(c.id), "user_id": str(c.user_id), "content": c.content, "created_at": c.created_at.isoformat()} for c in comments],
    }


# ========== CRUD ==========

@router.post("/")
async def create_template(body: TemplateCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tpl = Template(name=body.name, description=body.description, content=body.content, tags=body.tags, category=body.category, created_by=current_user.id)
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    return {"id": str(tpl.id), "status": tpl.status}


@router.patch("/{tpl_id}")
async def update_template(tpl_id: uuid.UUID, body: TemplateUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tpl = (await db.execute(select(Template).where(Template.id == tpl_id))).scalar_one_or_none()
    if not tpl or (tpl.created_by != current_user.id and current_user.role != "admin"):
        raise HTTPException(404, "模板不存在或无权编辑")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(tpl, k, v)
    tpl.updated_at = datetime.utcnow()
    await db.commit()
    return {"status": "ok"}


@router.delete("/{tpl_id}", status_code=204)
async def delete_template(tpl_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tpl = (await db.execute(select(Template).where(Template.id == tpl_id))).scalar_one_or_none()
    if not tpl or (tpl.created_by != current_user.id and current_user.role != "admin"):
        raise HTTPException(404)
    await db.delete(tpl)
    await db.commit()


# ========== Publish / Review ==========

@router.post("/{tpl_id}/publish")
async def publish_template(tpl_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tpl = (await db.execute(select(Template).where(Template.id == tpl_id))).scalar_one_or_none()
    if not tpl or tpl.created_by != current_user.id:
        raise HTTPException(404)
    tpl.status = "pending_review"
    await db.commit()
    return {"status": "pending_review"}


@router.post("/{tpl_id}/review")
async def review_template(tpl_id: uuid.UUID, action: str = Query(..., regex="^(approve|reject)$"), db: AsyncSession = Depends(get_db), _admin: User = Depends(require_admin)):
    tpl = (await db.execute(select(Template).where(Template.id == tpl_id))).scalar_one_or_none()
    if not tpl:
        raise HTTPException(404)
    tpl.status = "published" if action == "approve" else "rejected"
    await db.commit()
    return {"status": tpl.status}


# ========== Like / Adopt / Comment ==========

@router.post("/{tpl_id}/like")
async def toggle_like(tpl_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tpl = (await db.execute(select(Template).where(Template.id == tpl_id))).scalar_one_or_none()
    if not tpl or tpl.status != "published":
        raise HTTPException(404)
    existing = (await db.execute(select(TemplateLike).where(TemplateLike.user_id == current_user.id, TemplateLike.template_id == tpl_id))).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        tpl.likes = max(0, tpl.likes - 1)
        await db.commit()
        return {"is_liked": False, "likes": tpl.likes}
    else:
        db.add(TemplateLike(user_id=current_user.id, template_id=tpl_id))
        tpl.likes += 1
        await db.commit()
        return {"is_liked": True, "likes": tpl.likes}


@router.post("/{tpl_id}/adopt")
async def adopt_template(tpl_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tpl = (await db.execute(select(Template).where(Template.id == tpl_id))).scalar_one_or_none()
    if not tpl or tpl.status != "published":
        raise HTTPException(404)
    tpl.adoptions += 1
    tpl.downloads += 1
    # Award points to template creator
    creator = (await db.execute(select(User).where(User.id == tpl.created_by))).scalar_one_or_none()
    if creator:
        creator.points += POINTS_RULES["template_adopted"]
        db.add(PointsLog(user_id=creator.id, change=POINTS_RULES["template_adopted"], reason=f"模板「{tpl.name}」被采纳"))
        new_level = calc_level(creator.points)["level"]
        if new_level > creator.level:
            creator.level = new_level
    # Award points to adopter
    current_user.points += 20
    db.add(PointsLog(user_id=current_user.id, change=20, reason=f"采纳模板「{tpl.name}」"))
    await db.commit()
    return {"status": "adopted", "adoptions": tpl.adoptions}


@router.post("/{tpl_id}/comments")
async def add_comment(tpl_id: uuid.UUID, body: CommentCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tpl = (await db.execute(select(Template).where(Template.id == tpl_id))).scalar_one_or_none()
    if not tpl:
        raise HTTPException(404)
    c = TemplateComment(template_id=tpl_id, user_id=current_user.id, content=body.content)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return {"id": str(c.id), "content": c.content, "created_at": c.created_at.isoformat()}


# ========== Growth System ==========

@router.get("/growth/me")
async def my_growth(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Return current user's growth info: level, points, history."""
    level_info = calc_level(current_user.points)
    recent_points = (await db.execute(
        select(PointsLog).where(PointsLog.user_id == current_user.id).order_by(PointsLog.created_at.desc()).limit(20)
    )).scalars().all()
    return {
        "user_id": str(current_user.id),
        "nickname": current_user.nickname or current_user.username,
        "avatar": current_user.avatar,
        "points": current_user.points,
        "level": level_info,
        "points_rules": POINTS_RULES,
        "level_config": LEVEL_CONFIG,
        "recent_points": [
            {"change": p.change, "reason": p.reason, "created_at": p.created_at.isoformat()}
            for p in recent_points
        ],
    }


# ========== Admin: Award Points ==========

@router.post("/growth/{user_id}/award")
async def award_points(
    user_id: uuid.UUID,
    reason_key: str = Query(..., description="Points rule key or custom"),
    custom_points: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "用户不存在")
    pts = custom_points or POINTS_RULES.get(reason_key, 0)
    if pts == 0:
        raise HTTPException(400, "未知的积分规则")
    user.points += pts
    new_level = calc_level(user.points)["level"]
    if new_level > user.level:
        user.level = new_level
    db.add(PointsLog(user_id=user.id, change=pts, reason=reason_key))
    await db.commit()
    return {"points": user.points, "level": user.level}
