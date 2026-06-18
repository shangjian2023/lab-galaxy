"""Shared points and level utilities."""

LEVEL_CONFIG = [
    {"level": 1, "title": "见习学者", "icon": "·", "points": 0, "frame": "none"},
    {"level": 2, "title": "助理学者", "icon": "★", "points": 80, "frame": "copper"},
    {"level": 3, "title": "正式学者", "icon": "★★", "points": 250, "frame": "silver"},
    {"level": 4, "title": "高级学者", "icon": "★★★", "points": 600, "frame": "gold"},
    {"level": 5, "title": "资深学者", "icon": "◆", "points": 1200, "frame": "diamond"},
    {"level": 6, "title": "首席学者", "icon": "◆◆", "points": 2200, "frame": "rainbow"},
    {"level": 7, "title": "荣誉学者", "icon": "⚜", "points": 3800, "frame": "dark_gold"},
    {"level": 8, "title": "院士", "icon": "👑", "points": 6000, "frame": "crown"},
    {"level": 9, "title": "传奇院士", "icon": "🌌", "points": 9000, "frame": "galaxy"},
]

POINTS_RULES = {
    # —— 内容贡献（平台核心循环）——
    "upload_doc": 50,            # 上传实验资料
    "ai_parse_complete": 30,     # AI 解析完成
    "publish_template": 100,     # 发布模板
    "template_adopted": 200,     # 模板被收藏
    "comment_liked": 20,         # 回复被点赞
    # —— 活跃 / 参与 ——
    "login_daily": 5,            # 每日登录（每日1次）
    "ai_query": 5,               # AI 问答（每日上限10次）
    # —— 论坛 / 团队（社区激励）——
    "forum_post": 10,
    "forum_reply": 4,
    "forum_featured": 25,
    "forum_best_answer": 20,
    "forum_vote_established": 5, # 团队投票参与率达多数
    "thread_create": 20,         # 发布系统公告
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


def award_points(user, db, change: int, reason: str) -> int:
    """Award points to a user, update level if needed, and log the change.
    Returns the new level."""
    from app.models.models import PointsLog

    user.points += change
    db.add(PointsLog(user_id=user.id, change=change, reason=reason))
    new_level = calc_level(user.points)["level"]
    if new_level > user.level:
        user.level = new_level
    return new_level


async def count_today(db, user_id, reason: str) -> int:
    """Count a user's points-log entries with `reason` since midnight UTC today.

    Used for daily caps on farmable actions (ai_query ≤ 10/day, login_daily ≤ 1/day)
    so a script can't grind infinite points. Reads PointsLog — no schema change.
    """
    from datetime import UTC, datetime, time as dtime

    from sqlalchemy import func, select

    from app.models.models import PointsLog

    start = datetime.combine(datetime.now(UTC).date(), dtime.min).replace(tzinfo=UTC)
    return (await db.execute(
        select(func.count()).select_from(PointsLog).where(
            PointsLog.user_id == user_id,
            PointsLog.reason == reason,
            PointsLog.created_at >= start,
        )
    )).scalar() or 0
