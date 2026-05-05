"""WebSocket endpoint for real-time team chat."""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session
from app.core.security import decode_access_token
from app.models.models import Team, TeamMember, TeamMessage, User
from app.services.chat_bus import chat_bus

logger = logging.getLogger(__name__)

router = APIRouter()


async def _authenticate_ws(token: str, team_id: str, db: AsyncSession):
    """Validate JWT + team membership. Returns (user, team) or raises."""
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise ValueError("无效的认证凭据")

    user = (await db.execute(select(User).where(User.id == user_id, User.is_active == True))).scalar_one_or_none()
    if not user:
        raise ValueError("用户不存在或已禁用")

    team = (await db.execute(select(Team).where(Team.id == uuid.UUID(team_id)))).scalar_one_or_none()
    if not team:
        raise ValueError("团队不存在")

    membership = (await db.execute(
        select(TeamMember).where(TeamMember.team_id == team.id, TeamMember.user_id == user.id)
    )).scalar_one_or_none()
    if not membership:
        raise ValueError("不是该团队成员")

    return user, team


@router.websocket("/ws/team/{team_id}")
async def ws_team_chat(websocket: WebSocket, team_id: str, token: str = Query(...)):
    """WebSocket endpoint for team chat.

    Connect: ws://host/api/v1/ws/team/{team_id}?token={jwt}
    Messages (client→server): {"content": "hello"}
    Messages (server→client): {"type":"message"|"system", "id", "team_id", "user_id", "nickname", "avatar", "content", "created_at}
    """
    # Authenticate before accepting
    async with async_session() as db:
        try:
            user, team = await _authenticate_ws(token, team_id, db)
        except ValueError as e:
            await websocket.accept()
            await websocket.send_json({"type": "error", "detail": str(e)})
            await websocket.close(code=4001)
            return

    await websocket.accept()

    # Send join system message
    join_msg = {
        "type": "system",
        "id": str(uuid.uuid4()),
        "team_id": team_id,
        "user_id": str(user.id),
        "nickname": user.nickname or user.username,
        "avatar": user.avatar,
        "content": f"{user.nickname or user.username} 加入了聊天",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await chat_bus.publish(team_id, join_msg)

    # Task 1: forward Redis messages to this WebSocket
    async def _forward_redis():
        async for raw in chat_bus.subscribe(team_id):
            try:
                await websocket.send_text(raw)
            except Exception:
                break

    forward_task = asyncio.create_task(_forward_redis())

    try:
        while True:
            data = await websocket.receive_text()
            try:
                body = json.loads(data)
            except json.JSONDecodeError:
                body = {"content": data}

            content = (body.get("content") or "").strip()
            if not content:
                continue

            # Persist message
            msg_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            async with async_session() as db:
                msg = TeamMessage(
                    id=uuid.UUID(msg_id),
                    team_id=uuid.UUID(team_id),
                    user_id=user.id,
                    message_type="text",
                    content=content,
                    created_at=now,
                )
                db.add(msg)
                await db.commit()

            msg_payload = {
                "type": "message",
                "id": msg_id,
                "team_id": team_id,
                "user_id": str(user.id),
                "nickname": user.nickname or user.username,
                "avatar": user.avatar,
                "content": content,
                "created_at": now.isoformat(),
            }
            await chat_bus.publish(team_id, msg_payload)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"WS error for user {user.id} in team {team_id}: {e}")
    finally:
        forward_task.cancel()
        try:
            await forward_task
        except asyncio.CancelledError:
            pass

        # Leave system message
        leave_msg = {
            "type": "system",
            "id": str(uuid.uuid4()),
            "team_id": team_id,
            "user_id": str(user.id),
            "nickname": user.nickname or user.username,
            "avatar": user.avatar,
            "content": f"{user.nickname or user.username} 离开了聊天",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await chat_bus.publish(team_id, leave_msg)
