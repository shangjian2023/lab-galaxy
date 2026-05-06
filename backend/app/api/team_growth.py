"""Team growth timeline and AI growth analysis APIs."""

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Document, Team, TeamMember, User, UserAchievement
from app.services.usage import check_growth_analysis_quota, increment_growth_analysis

router = APIRouter(prefix="/teams", tags=["team-growth"])


def _is_team_member(team_id: str, user_id: uuid.UUID):
    """Return a select clause for team membership check."""
    return select(TeamMember).where(
        TeamMember.team_id == team_id,
        TeamMember.user_id == user_id,
    )


@router.get("/{team_id}/growth")
async def get_team_growth(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get team growth timeline: documents + achievements aggregated over time."""
    membership = (await db.execute(_is_team_member(team_id, current_user.id))).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="你不是该团队成员")

    # Get team member IDs
    members = (await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id)
    )).scalars().all()
    member_ids = [m.user_id for m in members]

    # Get member info
    users = (await db.execute(
        select(User).where(User.id.in_(member_ids))
    )).scalars().all()
    user_map = {str(u.id): u for u in users}

    # Get documents uploaded by team members
    docs = (await db.execute(
        select(Document).where(
            Document.uploaded_by.in_(member_ids),
            Document.status == "completed",
        ).order_by(Document.created_at.asc())
    )).scalars().all()

    # Get achievements for team members
    achievements = (await db.execute(
        select(UserAchievement).where(
            UserAchievement.user_id.in_(member_ids)
        ).order_by(UserAchievement.achieved_at.asc())
    )).scalars().all()

    # Build timeline
    timeline = []

    for doc in docs:
        uid = str(doc.uploaded_by)
        user = user_map.get(uid)
        er = None
        if doc.extraction_result:
            try:
                er = json.loads(doc.extraction_result) if isinstance(doc.extraction_result, str) else doc.extraction_result
            except (json.JSONDecodeError, TypeError):
                er = None
        entity_count = len(er.get("entities", [])) if er else 0
        relation_count = len(er.get("relations", [])) if er else 0
        timeline.append({
            "date": doc.created_at.isoformat() if doc.created_at else None,
            "type": "document",
            "user_id": uid,
            "user_nickname": user.nickname if user else uid,
            "title": doc.title,
            "details": f"提取了 {entity_count} 个实体、{relation_count} 个关系",
        })

    for ach in achievements:
        uid = str(ach.user_id)
        user = user_map.get(uid)
        timeline.append({
            "date": ach.achieved_at.isoformat() if ach.achieved_at else None,
            "type": "achievement",
            "user_id": uid,
            "user_nickname": user.nickname if user else uid,
            "title": ach.name,
            "details": ach.description or "",
            "achievement_type": ach.achievement_type,
        })

    timeline.sort(key=lambda x: x["date"] or "", reverse=True)

    # Build summary
    all_entities = set()
    for doc in docs:
        er = None
        if doc.extraction_result:
            try:
                er = json.loads(doc.extraction_result) if isinstance(doc.extraction_result, str) else doc.extraction_result
            except (json.JSONDecodeError, TypeError):
                er = None
        if er:
            for e in er.get("entities", []):
                if isinstance(e, dict):
                    all_entities.add(e.get("name", ""))

    member_summaries = []
    for uid, user in user_map.items():
        user_docs = [d for d in docs if str(d.uploaded_by) == uid]
        user_achs = [a for a in achievements if str(a.user_id) == uid]
        member_summaries.append({
            "user_id": uid,
            "nickname": user.nickname if user else uid,
            "document_count": len(user_docs),
            "achievement_count": len(user_achs),
        })

    return {
        "timeline": timeline,
        "summary": {
            "total_documents": len(docs),
            "total_achievements": len(achievements),
            "unique_entities": len(all_entities),
            "members": member_summaries,
        },
    }


@router.post("/{team_id}/ai-growth-analysis")
async def ai_growth_analysis(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Request AI analysis of team growth data."""
    membership = (await db.execute(_is_team_member(team_id, current_user.id))).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="你不是该团队成员")

    # Check quota
    quota = await check_growth_analysis_quota(db, current_user)
    if not quota["allowed"]:
        raise HTTPException(
            status_code=429,
            detail=f"本月 AI 成长分析次数已用完（{quota['limit']}/{quota['limit']}），下月重置",
        )

    # Get team data (reuse growth endpoint logic)
    members = (await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id)
    )).scalars().all()
    member_ids = [m.user_id for m in members]

    users = (await db.execute(
        select(User).where(User.id.in_(member_ids))
    )).scalars().all()
    user_map = {str(u.id): u for u in users}

    docs = (await db.execute(
        select(Document).where(
            Document.uploaded_by.in_(member_ids),
            Document.status == "completed",
        )
    )).scalars().all()

    achievements = (await db.execute(
        select(UserAchievement).where(UserAchievement.user_id.in_(member_ids))
    )).scalars().all()

    # Build data for AI
    entity_summary = {}
    for doc in docs:
        er = None
        if doc.extraction_result:
            try:
                er = json.loads(doc.extraction_result) if isinstance(doc.extraction_result, str) else doc.extraction_result
            except (json.JSONDecodeError, TypeError):
                er = None
        if er:
            for e in er.get("entities", []):
                if isinstance(e, dict):
                    etype = e.get("type", "Unknown")
                    entity_summary.setdefault(etype, []).append(e.get("name", ""))

    achievement_list = [
        {
            "name": a.name,
            "type": a.achievement_type,
            "description": a.description or "",
            "member": (user_map.get(str(a.user_id)) and (user_map[str(a.user_id)].nickname or str(a.user_id))) if a.user_id in user_map else "未知",
        }
        for a in achievements
    ]

    member_info = []
    for uid, user in user_map.items():
        user_docs = [d for d in docs if str(d.uploaded_by) == uid]
        member_info.append({
            "nickname": user.nickname if user else uid,
            "level": user.level if user else 1,
            "document_count": len(user_docs),
        })

    from app.services.ai_client import analyze_growth

    result = await analyze_growth({
        "team_name": (await db.execute(select(Team.name).where(Team.id == team_id))).scalar_one() or "未知团队",
        "total_documents": len(docs),
        "total_achievements": len(achievements),
        "entity_summary": entity_summary,
        "achievements": achievement_list,
        "members": member_info,
    })

    # Increment usage
    await increment_growth_analysis(db, current_user.id)
    await db.commit()

    return {
        **result,
        "quota": {
            "remaining": quota["remaining"] - 1,
            "limit": quota["limit"],
        },
    }
