"""知识发酵池论坛系统 API."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models.models import (
    ForumReply, ForumThread, PointsLog, ReplyLike, ThreadBookmark, ThreadLike, User,
)
from app.services.points import POINTS_RULES, calc_level, award_points, adjust_credit

router = APIRouter(prefix="/forum", tags=["forum"])

# ── Board Config ──

BOARDS = [
    {"slug": "methodology", "name": "方法论堂", "icon": "🔬", "description": "正式的学术讨论，注重引用与论证", "color": "#3b82f6"},
    {"slug": "graph_hall", "name": "图谱议事厅", "icon": "🗺️", "description": "对图谱内容进行评议、纠错、补充", "color": "#8b5cf6"},
    {"slug": "emergency_room", "name": "实验急诊室", "icon": "🏥", "description": "实验出问题了，快速求助", "color": "#ef4444"},
    {"slug": "aha_square", "name": "Aha! 广场", "icon": "💡", "description": "分享AI发现的有趣关联，晒aha moment", "color": "#f59e0b"},
    {"slug": "cross_discipline", "name": "学科撞车现场", "icon": "💥", "description": "刻意制造跨学科碰撞", "color": "#10b981"},
    {"slug": "announcements", "name": "公告堂", "icon": "📢", "description": "平台公告、活动、反馈与建议", "color": "#6b7280"},
]

VALID_BOARDS = {b["slug"] for b in BOARDS}
VALID_STATUS = {"open", "resolved", "locked", "featured"}
VALID_POST_TYPES = {"regular", "insight", "prediction", "challenge", "exchange-diary", "cold-knowledge"}

# ── Schemas ──

class ThreadCreate(BaseModel):
    board: str
    sub_board: str | None = None
    post_type: str = "regular"
    title: str = Field(min_length=2, max_length=200)
    content: str = Field(min_length=1)
    tags: list[str] | None = None
    graph_node_ids: list[str] | None = None


class ThreadUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    tags: list[str] | None = None


class ReplyCreate(BaseModel):
    content: str = Field(min_length=1)
    parent_id: uuid.UUID | None = None
    graph_node_ids: list[str] | None = None


# ── Helpers ──

def _thread_dict(t: ForumThread, user_id: uuid.UUID | None = None, is_liked: bool = False, is_bookmarked: bool = False) -> dict:
    return {
        "id": str(t.id),
        "board": t.board,
        "sub_board": t.sub_board,
        "post_type": t.post_type,
        "title": t.title,
        "content": t.content,
        "tags": t.tags,
        "graph_node_ids": t.graph_node_ids,
        "status": t.status,
        "is_featured": t.is_featured,
        "is_announcement": t.is_announcement,
        "reply_count": t.reply_count,
        "like_count": t.like_count,
        "view_count": t.view_count,
        "created_by": str(t.created_by),
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
        "is_liked": is_liked,
        "is_bookmarked": is_bookmarked,
    }


def _reply_dict(r: ForumReply, is_liked: bool = False) -> dict:
    return {
        "id": str(r.id),
        "thread_id": str(r.thread_id),
        "parent_id": str(r.parent_id) if r.parent_id else None,
        "content": r.content,
        "graph_node_ids": r.graph_node_ids,
        "is_best_answer": r.is_best_answer,
        "like_count": r.like_count,
        "created_by": str(r.created_by),
        "created_at": r.created_at.isoformat(),
        "updated_at": r.updated_at.isoformat(),
        "is_liked": is_liked,
    }


async def _enrich_with_users(db: AsyncSession, items: list[dict], author_key: str = "created_by"):
    """Enrich a list of dicts with author nickname, avatar, level."""
    author_ids = set()
    for item in items:
        try:
            author_ids.add(uuid.UUID(item[author_key]))
        except (ValueError, KeyError):
            pass
    if not author_ids:
        for item in items:
            item["author_nickname"] = ""
            item["author_avatar"] = None
            item["author_level"] = 1
        return
    rows = (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all()
    user_map = {str(u.id): u for u in rows}
    for item in items:
        uid = item.get(author_key, "")
        u = user_map.get(uid)
        item["author_nickname"] = (u.nickname or u.username) if u else ""
        item["author_avatar"] = u.avatar if u else None
        item["author_level"] = u.level if u else 1


# ── Board List ──

@router.get("/boards")
async def list_boards(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all forum boards with thread counts."""
    result = []
    for b in BOARDS:
        cnt = (await db.execute(
            select(func.count()).select_from(ForumThread).where(ForumThread.board == b["slug"])
        )).scalar() or 0
        result.append({**b, "thread_count": cnt})
    return {"boards": result}


# ── Thread List ──

@router.get("/threads")
async def list_threads(
    board: str | None = Query(None),
    post_type: str | None = Query(None),
    sort: str = Query("hot", pattern="^(newest|popular|latest_reply|hot)$"),
    keyword: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List threads with pagination and filtering."""
    base = select(ForumThread)
    if board:
        if board not in VALID_BOARDS:
            raise HTTPException(400, f"无效的板块: {board}")
        base = base.where(ForumThread.board == board)
    if post_type:
        base = base.where(ForumThread.post_type == post_type)
    if keyword:
        base = base.where(ForumThread.title.ilike(f"%{keyword}%"))

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0

    if sort == "hot":
        # Quality score with recency decay (~30-day half-life) and random jitter.
        # Recency decay prevents old posts from permanently dominating;
        # jitter gives equal-quality posts different orderings each load.
        quality = (
            ForumThread.like_count * 5
            + ForumThread.reply_count * 2
            + ForumThread.view_count * 0.1
            + 1  # base so even zero-engagement new posts appear
        )
        age_hours = func.extract("epoch", func.now() - ForumThread.created_at) / 3600.0
        recency = func.exp(-age_hours / 720.0)  # ~30-day half-life
        hot_score = quality * recency + func.random() * 3
        order = hot_score.desc()
    else:
        order_map = {
            "newest": ForumThread.created_at.desc(),
            "popular": ForumThread.like_count.desc(),
            "latest_reply": ForumThread.updated_at.desc(),
        }
        order = order_map.get(sort, ForumThread.created_at.desc())
    rows = (await db.execute(
        base.order_by(order).offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    # Check likes/bookmarks
    thread_ids = [t.id for t in rows]
    liked = set()
    bookmarked = set()
    if thread_ids:
        likes = (await db.execute(
            select(ThreadLike.thread_id).where(ThreadLike.user_id == current_user.id, ThreadLike.thread_id.in_(thread_ids))
        )).scalars().all()
        liked = set(str(l) for l in likes)
        bms = (await db.execute(
            select(ThreadBookmark.thread_id).where(ThreadBookmark.user_id == current_user.id, ThreadBookmark.thread_id.in_(thread_ids))
        )).scalars().all()
        bookmarked = set(str(b) for b in bms)

    items = []
    for t in rows:
        items.append(_thread_dict(t, current_user.id, str(t.id) in liked, str(t.id) in bookmarked))

    await _enrich_with_users(db, items)

    return {"total": total, "page": page, "page_size": page_size, "items": items}


# ── Thread Detail ──

@router.get("/threads/{thread_id}")
async def get_thread(
    thread_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get thread detail with replies."""
    t = (await db.execute(select(ForumThread).where(ForumThread.id == thread_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "帖子不存在")

    # Increment view count
    t.view_count += 1
    await db.commit()

    # Check like/bookmark status
    is_liked = (await db.execute(
        select(ThreadLike).where(ThreadLike.user_id == current_user.id, ThreadLike.thread_id == thread_id)
    )).scalar_one_or_none() is not None
    is_bookmarked = (await db.execute(
        select(ThreadBookmark).where(ThreadBookmark.user_id == current_user.id, ThreadBookmark.thread_id == thread_id)
    )).scalar_one_or_none() is not None

    thread_data = _thread_dict(t, current_user.id, is_liked, is_bookmarked)
    await _enrich_with_users(db, [thread_data])

    # Get replies (limit 100, flat order by created_at)
    replies = (await db.execute(
        select(ForumReply).where(ForumReply.thread_id == thread_id)
        .order_by(ForumReply.created_at.asc()).limit(100)
    )).scalars().all()

    reply_ids = [r.id for r in replies]
    liked_replies = set()
    if reply_ids:
        rl = (await db.execute(
            select(ReplyLike.reply_id).where(ReplyLike.user_id == current_user.id, ReplyLike.reply_id.in_(reply_ids))
        )).scalars().all()
        liked_replies = set(str(r) for r in rl)

    reply_items = [_reply_dict(r, str(r.id) in liked_replies) for r in replies]
    await _enrich_with_users(db, reply_items)

    return {"thread": thread_data, "replies": reply_items}


# ── Create Thread ──

@router.post("/threads")
async def create_thread(
    body: ThreadCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new thread."""
    if body.board not in VALID_BOARDS:
        raise HTTPException(400, f"无效的板块: {body.board}")
    if body.post_type not in VALID_POST_TYPES:
        raise HTTPException(400, f"无效的帖子类型: {body.post_type}")

    t = ForumThread(
        board=body.board,
        sub_board=body.sub_board,
        post_type=body.post_type,
        title=body.title,
        content=body.content,
        tags=body.tags,
        graph_node_ids=body.graph_node_ids,
        created_by=current_user.id,
    )
    db.add(t)

    # Award points
    new_level = award_points(current_user, db, POINTS_RULES["forum_post"], "发布帖子")

    await db.commit()
    await db.refresh(t)

    return {
        "id": str(t.id),
        "points_earned": POINTS_RULES["forum_post"],
        "new_level": new_level,
    }


# ── Update Thread ──

@router.patch("/threads/{thread_id}")
async def update_thread(
    thread_id: uuid.UUID,
    body: ThreadUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit a thread (owner or admin)."""
    t = (await db.execute(select(ForumThread).where(ForumThread.id == thread_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "帖子不存在")
    if t.created_by != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "无权编辑此帖子")

    for k, v in body.model_dump(exclude_none=True).items():
        setattr(t, k, v)
    t.updated_at = datetime.utcnow()
    await db.commit()
    return {"status": "ok"}


# ── Delete Thread ──

@router.delete("/threads/{thread_id}", status_code=204)
async def delete_thread(
    thread_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a thread (owner or admin)."""
    t = (await db.execute(select(ForumThread).where(ForumThread.id == thread_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "帖子不存在")
    if t.created_by != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "无权删除此帖子")
    await db.delete(t)
    await db.commit()


# ── Thread Like ──

@router.post("/threads/{thread_id}/like")
async def toggle_thread_like(
    thread_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle like on a thread."""
    t = (await db.execute(select(ForumThread).where(ForumThread.id == thread_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "帖子不存在")

    existing = (await db.execute(
        select(ThreadLike).where(ThreadLike.user_id == current_user.id, ThreadLike.thread_id == thread_id)
    )).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        t.like_count = max(0, t.like_count - 1)
        await db.commit()
        return {"is_liked": False, "like_count": t.like_count}
    else:
        db.add(ThreadLike(user_id=current_user.id, thread_id=thread_id))
        t.like_count += 1
        await db.commit()
        return {"is_liked": True, "like_count": t.like_count}


# ── Thread Bookmark ──

@router.post("/threads/{thread_id}/bookmark")
async def toggle_thread_bookmark(
    thread_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle bookmark on a thread."""
    t = (await db.execute(select(ForumThread).where(ForumThread.id == thread_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "帖子不存在")

    existing = (await db.execute(
        select(ThreadBookmark).where(ThreadBookmark.user_id == current_user.id, ThreadBookmark.thread_id == thread_id)
    )).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()
        return {"is_bookmarked": False}
    else:
        db.add(ThreadBookmark(user_id=current_user.id, thread_id=thread_id))
        await db.commit()
        return {"is_bookmarked": True}


# ── Add Reply ──

@router.post("/threads/{thread_id}/reply")
async def add_reply(
    thread_id: uuid.UUID,
    body: ReplyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a reply to a thread."""
    t = (await db.execute(select(ForumThread).where(ForumThread.id == thread_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "帖子不存在")
    if t.status == "locked":
        raise HTTPException(400, "帖子已锁定，无法回复")

    # Check parent reply exists if specified
    if body.parent_id:
        parent = (await db.execute(
            select(ForumReply).where(ForumReply.id == body.parent_id, ForumReply.thread_id == thread_id)
        )).scalar_one_or_none()
        if not parent:
            raise HTTPException(404, "回复的父回复不存在")

    r = ForumReply(
        thread_id=thread_id,
        parent_id=body.parent_id,
        content=body.content,
        graph_node_ids=body.graph_node_ids,
        created_by=current_user.id,
    )
    db.add(r)

    # Increment thread reply count
    t.reply_count += 1
    t.updated_at = datetime.utcnow()

    # Award points
    new_level = award_points(current_user, db, POINTS_RULES["forum_reply"], "回复帖子")

    await db.commit()
    await db.refresh(r)

    return {
        "id": str(r.id),
        "content": r.content,
        "created_at": r.created_at.isoformat(),
        "points_earned": POINTS_RULES["forum_reply"],
        "new_level": new_level,
    }


# ── Reply Like ──

@router.post("/replies/{reply_id}/like")
async def toggle_reply_like(
    reply_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle like on a reply."""
    r = (await db.execute(select(ForumReply).where(ForumReply.id == reply_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "回复不存在")

    existing = (await db.execute(
        select(ReplyLike).where(ReplyLike.user_id == current_user.id, ReplyLike.reply_id == reply_id)
    )).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        r.like_count = max(0, r.like_count - 1)
        await db.commit()
        return {"is_liked": False, "like_count": r.like_count}
    else:
        db.add(ReplyLike(user_id=current_user.id, reply_id=reply_id))
        r.like_count += 1
        # Reward the reply author when their reply gets liked (skip self-like)
        if r.created_by != current_user.id:
            author = (await db.execute(select(User).where(User.id == r.created_by))).scalar_one_or_none()
            if author:
                award_points(author, db, POINTS_RULES["comment_liked"], "回复被点赞")
        await db.commit()
        return {"is_liked": True, "like_count": r.like_count}


# ── Change Thread Status ──

@router.patch("/threads/{thread_id}/status")
async def change_thread_status(
    thread_id: uuid.UUID,
    status: str = Query(..., pattern="^(open|resolved|locked|featured)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change thread status. Featured requires admin."""
    t = (await db.execute(select(ForumThread).where(ForumThread.id == thread_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "帖子不存在")

    if status == "featured" and current_user.role != "admin":
        raise HTTPException(403, "仅管理员可设为精华")

    if t.created_by != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "无权修改此帖子状态")

    was_featured = t.is_featured
    t.status = status
    if status == "featured":
        t.is_featured = True

    # Award points for newly featured
    if status == "featured" and not was_featured:
        author = (await db.execute(select(User).where(User.id == t.created_by))).scalar_one_or_none()
        if author:
            award_points(author, db, POINTS_RULES["forum_featured"], "帖子被设为精华")
            adjust_credit(author, 3)

    await db.commit()
    return {"status": t.status, "is_featured": t.is_featured}


# ── Mark Best Answer ──

@router.post("/threads/{thread_id}/best-answer/{reply_id}")
async def mark_best_answer(
    thread_id: uuid.UUID,
    reply_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a reply as best answer. Only thread owner or admin."""
    t = (await db.execute(select(ForumThread).where(ForumThread.id == thread_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "帖子不存在")
    if t.created_by != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "无权标记最佳答案")

    r = (await db.execute(
        select(ForumReply).where(ForumReply.id == reply_id, ForumReply.thread_id == thread_id)
    )).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "回复不存在或不属于此帖子")

    # Unset previous best answer
    prev = (await db.execute(
        select(ForumReply).where(ForumReply.thread_id == thread_id, ForumReply.is_best_answer == True)
    )).scalars().all()
    for p in prev:
        p.is_best_answer = False

    r.is_best_answer = True
    t.status = "resolved"

    # Award points to answerer
    answerer = (await db.execute(select(User).where(User.id == r.created_by))).scalar_one_or_none()
    if answerer and answerer.id != t.created_by:
        award_points(answerer, db, POINTS_RULES["forum_best_answer"], "回答被采纳为最佳答案")
        adjust_credit(answerer, 3)

    await db.commit()
    return {"status": "ok", "thread_status": t.status}


# ── My Threads ──

@router.get("/me/threads")
async def my_threads(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's own threads."""
    total = (await db.execute(
        select(func.count()).select_from(ForumThread).where(ForumThread.created_by == current_user.id)
    )).scalar() or 0

    rows = (await db.execute(
        select(ForumThread).where(ForumThread.created_by == current_user.id)
        .order_by(ForumThread.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    items = [_thread_dict(t, current_user.id) for t in rows]
    await _enrich_with_users(db, items)

    return {"total": total, "page": page, "page_size": page_size, "items": items}


# ── My Bookmarks ──

@router.get("/me/bookmarks")
async def my_bookmarks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's bookmarked threads."""
    total = (await db.execute(
        select(func.count()).select_from(ThreadBookmark).where(ThreadBookmark.user_id == current_user.id)
    )).scalar() or 0

    bms = (await db.execute(
        select(ThreadBookmark.thread_id).where(ThreadBookmark.user_id == current_user.id)
        .order_by(ThreadBookmark.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    if not bms:
        return {"total": 0, "page": page, "page_size": page_size, "items": []}

    rows = (await db.execute(select(ForumThread).where(ForumThread.id.in_(bms)))).scalars().all()
    items = [_thread_dict(t, current_user.id, is_bookmarked=True) for t in rows]
    await _enrich_with_users(db, items)

    return {"total": total, "page": page, "page_size": page_size, "items": items}


# ── Admin: Create Announcement ──

@router.post("/announcements", status_code=201)
async def create_announcement(
    body: ThreadCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin-only: create an announcement (visible at top of all boards)."""
    if current_user.role != "admin":
        raise HTTPException(403, "仅管理员可发布公告")

    thread = ForumThread(
        board="announcements",
        sub_board=None,
        post_type="regular",
        title=body.title,
        content=body.content,
        tags=body.tags,
        created_by=current_user.id,
        is_announcement=True,
    )
    db.add(thread)
    await db.commit()
    await db.refresh(thread)

    award_points(current_user, db, POINTS_RULES["thread_create"], "发布系统公告")
    return _thread_dict(thread, current_user.id)


# ── Admin: Toggle Featured ──

@router.patch("/admin/threads/{thread_id}/featured")
async def admin_toggle_featured(
    thread_id: uuid.UUID,
    is_featured: bool = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin-only: toggle thread featured status."""
    if current_user.role != "admin":
        raise HTTPException(403, "仅管理员可操作")

    t = (await db.execute(select(ForumThread).where(ForumThread.id == thread_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "帖子不存在")

    was_featured = t.is_featured
    t.is_featured = is_featured
    if is_featured and not was_featured:
        author = (await db.execute(select(User).where(User.id == t.created_by))).scalar_one_or_none()
        if author:
            award_points(author, db, POINTS_RULES["forum_featured"], "帖子被设为精华")
            adjust_credit(author, 3)

    await db.commit()
    return {"is_featured": t.is_featured}


@router.get("/featured-feed")
async def featured_feed(db: AsyncSession = Depends(get_db)):
    """Multi-factor featured feed for the homepage carousel.

    score = quality × recency_decay × fairness_boost × newness_boost × jitter
      - quality: likes/replies/views + featured/announcement bonus
      - recency: exp(-age/14d) → old posts naturally rotate out (no domination)
      - fairness: under-exposed posts (low featured_count) get boosted
      - newness: fresh posts (<48h) get extra traffic support
      - jitter: small random so equal scores reshuffle each load
    Deduped per author (1 each). ~20% of slots are in-stock equipment.
    Increments featured_count on selected threads (persists fairness state).
    """
    import math
    import random
    from datetime import timedelta

    from app.models.models import EquipmentCatalogItem

    now = datetime.now(timezone.utc)
    # No hard cutoff — recency decay (exp(-age/14d)) naturally deprioritizes
    # old threads while still allowing them to appear if nothing newer exists.
    threads = (await db.execute(
        select(ForumThread).order_by(ForumThread.created_at.desc()).limit(200)
    )).scalars().all()

    scored = []
    author_count: dict[str, int] = {}
    MAX_PER_AUTHOR = 3
    for t in threads:
        uid = str(t.created_by)
        if author_count.get(uid, 0) >= MAX_PER_AUTHOR:
            continue
        age_days = max(0.0, (now - t.created_at).total_seconds() / 86400) if t.created_at else 30.0
        quality = (
            (t.like_count or 0) * 2
            + (t.reply_count or 0) * 1.5
            + (t.view_count or 0) * 0.1
            + (12 if t.is_featured else 0)
            + (8 if t.is_announcement else 0)
        )
        recency = math.exp(-age_days / 14.0)
        fairness = 1.0 + max(0, 5 - (t.featured_count or 0)) * 0.3
        newness = 1.6 if age_days * 24 < 48 else 1.0
        jitter = random.uniform(0.85, 1.15)
        score = (quality + 1) * recency * fairness * newness * jitter
        scored.append((score, t))
        author_count[uid] = author_count.get(uid, 0) + 1

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:8]

    author_ids = {t.created_by for _, t in top}
    author_map = {}
    if author_ids:
        users = (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all()
        author_map = {u.id: (u.nickname or u.username) for u in users}

    items = []
    for _, t in top:
        t.featured_count = (t.featured_count or 0) + 1
        badge = "📢 公告" if t.is_announcement else ("✨ 精华" if t.is_featured else "💬 讨论")
        items.append({
            "type": "thread",
            "id": str(t.id),
            "title": t.title,
            "badge": badge,
            "subtitle": author_map.get(t.created_by, ""),
            "content": (t.content or "")[:120],
            "href": f"/forum/thread/{t.id}",
            "image_url": None,
        })

    # Equipment mix: ~2 in-stock items rotated in
    equip = (await db.execute(
        select(EquipmentCatalogItem)
        .where(EquipmentCatalogItem.is_active == True, EquipmentCatalogItem.stock > 0)
        .order_by(EquipmentCatalogItem.sort_order).limit(6)
    )).scalars().all()
    if equip:
        for e in random.sample(list(equip), min(1, len(equip))):
            items.append({
                "type": "equipment",
                "id": str(e.id),
                "title": e.name,
                "badge": f"{e.icon or '🔧'} 可借用",
                "subtitle": f"余量 {e.stock} {e.unit}",
                "href": "/equipment",
                "image_url": e.image_url,
            })

    random.shuffle(items)
    await db.commit()  # persist featured_count increments
    return {"items": items}
