"""Team polls / voting.

Single-choice polls scoped to a team. Members create polls, cast one vote each
(change allowed), and see live results. The poll creator earns
`forum_vote_established` points once participation reaches a majority of members.
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import TeamMember, TeamPoll, TeamPollVote, User
from app.services.points import POINTS_RULES, award_points

router = APIRouter(prefix="/teams", tags=["team-polls"])


async def _require_member(team_id: UUID, user_id: UUID, db: AsyncSession) -> TeamMember:
    m = (await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
    )).scalar_one_or_none()
    if not m:
        raise HTTPException(403, "你不是该团队成员")
    return m


class PollCreate(BaseModel):
    question: str = Field(..., min_length=1, max_length=200)
    options: list[str] = Field(..., min_length=2, max_length=6)
    closes_at: datetime | None = None


class VoteBody(BaseModel):
    option_index: int


def _serialize(poll: TeamPoll, counts: dict, my_vote: int | None) -> dict:
    return {
        "id": str(poll.id),
        "question": poll.question,
        "options": poll.options,
        "status": poll.status,
        "created_by": str(poll.created_by),
        "closes_at": poll.closes_at.isoformat() if poll.closes_at else None,
        "created_at": poll.created_at.isoformat() if poll.created_at else None,
        "counts": {str(k): v for k, v in counts.items()},  # {option_index: votes}
        "my_vote": my_vote,
    }


@router.post("/{team_id}/polls", status_code=201)
async def create_poll(
    team_id: UUID,
    body: PollCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(team_id, current_user.id, db)
    opts = [o.strip() for o in body.options if o.strip()]
    if len(opts) < 2:
        raise HTTPException(400, "至少需要2个有效选项")
    poll = TeamPoll(
        team_id=team_id,
        question=body.question.strip(),
        options=opts,
        created_by=current_user.id,
        closes_at=body.closes_at,
    )
    db.add(poll)
    await db.commit()
    await db.refresh(poll)
    return _serialize(poll, {}, None)


@router.get("/{team_id}/polls")
async def list_polls(
    team_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(team_id, current_user.id, db)
    polls = (await db.execute(
        select(TeamPoll).where(TeamPoll.team_id == team_id).order_by(TeamPoll.created_at.desc())
    )).scalars().all()

    poll_ids = [p.id for p in polls]
    counts: dict[UUID, dict[int, int]] = {}
    my_map: dict[UUID, int] = {}
    if poll_ids:
        rows = (await db.execute(
            select(TeamPollVote.poll_id, TeamPollVote.option_index, func.count())
            .where(TeamPollVote.poll_id.in_(poll_ids))
            .group_by(TeamPollVote.poll_id, TeamPollVote.option_index)
        )).all()
        for poll_id, opt, c in rows:
            counts.setdefault(poll_id, {})[opt] = c
        my_votes = (await db.execute(
            select(TeamPollVote).where(
                TeamPollVote.poll_id.in_(poll_ids), TeamPollVote.user_id == current_user.id
            )
        )).scalars().all()
        my_map = {v.poll_id: v.option_index for v in my_votes}
    return [_serialize(p, counts.get(p.id, {}), my_map.get(p.id)) for p in polls]


@router.post("/{team_id}/polls/{poll_id}/vote")
async def cast_vote(
    team_id: UUID,
    poll_id: UUID,
    body: VoteBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(team_id, current_user.id, db)
    poll = (await db.execute(
        select(TeamPoll).where(TeamPoll.id == poll_id, TeamPoll.team_id == team_id)
    )).scalar_one_or_none()
    if not poll:
        raise HTTPException(404, "投票不存在")
    if poll.status == "closed" or (poll.closes_at and poll.closes_at < datetime.now(UTC)):
        raise HTTPException(400, "投票已结束")
    if body.option_index < 0 or body.option_index >= len(poll.options):
        raise HTTPException(400, "无效选项")

    existing = (await db.execute(
        select(TeamPollVote).where(
            TeamPollVote.poll_id == poll_id, TeamPollVote.user_id == current_user.id
        )
    )).scalar_one_or_none()
    if existing:
        existing.option_index = body.option_index  # changing your vote is allowed
    else:
        db.add(TeamPollVote(poll_id=poll_id, user_id=current_user.id, option_index=body.option_index))
    await db.flush()

    # Award the creator once participation reaches a majority of team members.
    if not poll.creator_awarded:
        member_count = (await db.execute(
            select(func.count()).select_from(TeamMember).where(TeamMember.team_id == team_id)
        )).scalar() or 0
        voter_count = (await db.execute(
            select(func.count()).select_from(TeamPollVote).where(TeamPollVote.poll_id == poll_id)
        )).scalar() or 0
        if member_count > 0 and voter_count * 2 >= member_count:  # >= 50% participation
            creator = (await db.execute(select(User).where(User.id == poll.created_by))).scalar_one_or_none()
            if creator:
                award_points(creator, db, POINTS_RULES["forum_vote_established"], f"团队投票参与达多数：{poll.question[:30]}")
            poll.creator_awarded = True
    await db.commit()
    return {"ok": True}


@router.post("/{team_id}/polls/{poll_id}/close")
async def close_poll(
    team_id: UUID,
    poll_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = await _require_member(team_id, current_user.id, db)
    poll = (await db.execute(
        select(TeamPoll).where(TeamPoll.id == poll_id, TeamPoll.team_id == team_id)
    )).scalar_one_or_none()
    if not poll:
        raise HTTPException(404, "投票不存在")
    if member.role not in ("owner", "admin") and poll.created_by != current_user.id:
        raise HTTPException(403, "仅创建者或管理员可结束投票")
    poll.status = "closed"
    await db.commit()
    return {"status": "closed"}
