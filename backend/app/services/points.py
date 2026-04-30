"""Shared points and level utilities."""

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
    # Forum
    "forum_post": 3,
    "forum_reply": 1,
    "forum_featured": 20,
    "forum_best_answer": 15,
    "forum_valid_objection": 50,
    "forum_vote_established": 5,
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
