"""Team management APIs."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Team, TeamMember, User

router = APIRouter(prefix="/teams", tags=["teams"])


class TeamCreate(BaseModel):
    name: str
    description: str = ""


class TeamInfo(BaseModel):
    id: str
    name: str
    description: str | None
    owner_id: str
    owner_nickname: str
    member_count: int
    created_at: str


class TeamDetail(TeamInfo):
    members: list[dict]


class InviteRequest(BaseModel):
    username: str


@router.post("/create", response_model=TeamInfo)
async def create_team(
    body: TeamCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    team = Team(name=body.name, description=body.description, owner_id=current_user.id)
    db.add(team)
    await db.flush()

    member = TeamMember(team_id=team.id, user_id=current_user.id, role="owner")
    db.add(member)
    await db.commit()
    await db.refresh(team)

    count = (await db.execute(select(TeamMember).where(TeamMember.team_id == team.id))).scalars().all()
    return TeamInfo(
        id=str(team.id),
        name=team.name,
        description=team.description,
        owner_id=str(team.owner_id),
        owner_nickname=current_user.nickname or current_user.username,
        member_count=len(count),
        created_at=str(team.created_at),
    )


@router.get("/my", response_model=list[TeamInfo])
async def my_teams(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Team, TeamMember.role)
        .join(TeamMember, Team.id == TeamMember.team_id)
        .where(TeamMember.user_id == current_user.id)
        .order_by(Team.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    result = []
    for team, role in rows:
        mc = (await db.execute(select(TeamMember).where(TeamMember.team_id == team.id))).scalars().all()
        owner = (await db.execute(select(User).where(User.id == team.owner_id))).scalar_one()
        result.append(TeamInfo(
            id=str(team.id),
            name=team.name,
            description=team.description,
            owner_id=str(team.owner_id),
            owner_nickname=owner.nickname or owner.username,
            member_count=len(mc),
            created_at=str(team.created_at),
        ))
    return result


@router.get("/{team_id}", response_model=TeamDetail)
async def get_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    team = (await db.execute(select(Team).where(Team.id == UUID(team_id)))).scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")

    membership = (await db.execute(
        select(TeamMember).where(TeamMember.team_id == team.id, TeamMember.user_id == current_user.id)
    )).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="不是该团队成员")

    members = (await db.execute(
        select(TeamMember, User).join(User, TeamMember.user_id == User.id).where(TeamMember.team_id == team.id)
    )).all()

    owner = (await db.execute(select(User).where(User.id == team.owner_id))).scalar_one()

    return TeamDetail(
        id=str(team.id),
        name=team.name,
        description=team.description,
        owner_id=str(team.owner_id),
        owner_nickname=owner.nickname or owner.username,
        member_count=len(members),
        created_at=str(team.created_at),
        members=[
            {
                "user_id": str(u.id),
                "username": u.username,
                "nickname": u.nickname or u.username,
                "avatar": u.avatar,
                "role": m.role,
                "joined_at": str(m.joined_at),
            }
            for m, u in members
        ],
    )


@router.post("/{team_id}/invite")
async def invite_member(
    team_id: str,
    body: InviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    team = (await db.execute(select(Team).where(Team.id == UUID(team_id)))).scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")

    is_owner = (await db.execute(
        select(TeamMember).where(TeamMember.team_id == team.id, TeamMember.user_id == current_user.id)
    )).scalar_one_or_none()
    if not is_owner or is_owner.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="只有团队管理员可以邀请成员")

    user = (await db.execute(select(User).where(User.username == body.username))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    existing = (await db.execute(
        select(TeamMember).where(TeamMember.team_id == team.id, TeamMember.user_id == user.id)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="该用户已在团队中")

    member = TeamMember(team_id=team.id, user_id=user.id, role="member")
    db.add(member)
    await db.commit()

    return {"status": "ok", "message": f"已邀请 {user.nickname or user.username} 加入团队"}


@router.post("/{team_id}/leave")
async def leave_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    team = (await db.execute(select(Team).where(Team.id == UUID(team_id)))).scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")

    membership = (await db.execute(
        select(TeamMember).where(TeamMember.team_id == team.id, TeamMember.user_id == current_user.id)
    )).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="不是该团队成员")

    if membership.role == "owner":
        raise HTTPException(status_code=400, detail="团队创建者不能退出团队，请先删除团队")

    await db.delete(membership)
    await db.commit()
    return {"status": "ok", "message": "已退出团队"}


@router.delete("/{team_id}")
async def delete_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    team = (await db.execute(select(Team).where(Team.id == UUID(team_id)))).scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")

    if team.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="只有团队创建者可以删除团队")

    await db.delete(team)
    await db.commit()
    return {"status": "ok", "message": "团队已删除"}


@router.get("/search/users", response_model=list[dict])
async def search_users(
    keyword: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(User).where(
        (User.username.ilike(f"%{keyword}%")) | (User.nickname.ilike(f"%{keyword}%"))
    ).limit(20)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": str(u.id),
            "username": u.username,
            "nickname": u.nickname or u.username,
            "avatar": u.avatar,
        }
        for u in rows
    ]
