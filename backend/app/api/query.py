"""Natural language query endpoint."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import User
from app.services.ai_client import query_natural_language, query_natural_language_stream, reload_user_ai_config
from app.services.usage import check_query_quota, increment_query
from app.services.points import award_points, POINTS_RULES, count_today

router = APIRouter(prefix="/query", tags=["query"])


class MessageHistory(BaseModel):
    role: str  # "user" | "assistant"
    content: str

    def model_post_init(self, __context):
        if self.role not in ("user", "assistant"):
            raise ValueError(f"role must be 'user' or 'assistant', got '{self.role}'")


class QueryRequest(BaseModel):
    question: str
    history: list[MessageHistory] = []


@router.post("")
async def ask_question(
    body: QueryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Natural language query over the knowledge graph."""
    quota = await check_query_quota(db, current_user)
    if not quota["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"今日查询次数已用完（{quota['limit']}/{quota['limit']}），请明天再试",
        )
    # Apply user's personal AI config if set (falls back to global if not)
    await reload_user_ai_config(db, current_user.id)
    result = await query_natural_language(body.question, body.history)
    if not quota["unlimited"]:
        await increment_query(db, current_user.id)
    # Daily-capped reward for using the AI Q&A (core feature), max 10/day
    if await count_today(db, current_user.id, "AI 问答") < 10:
        award_points(current_user, db, POINTS_RULES["ai_query"], "AI 问答")
    await db.commit()
    return result


@router.post("/stream")
async def ask_question_stream(
    body: QueryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Streaming natural language query — proxies SSE from the AI service.

    Enforces the same daily quota as the non-streaming endpoint; the count is
    incremented up front so abusers can't bypass limits via streaming.
    """
    quota = await check_query_quota(db, current_user)
    if not quota["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"今日查询次数已用完（{quota['limit']}/{quota['limit']}），请明天再试",
        )
    if not quota["unlimited"]:
        await increment_query(db, current_user.id)
    if await count_today(db, current_user.id, "AI 问答") < 10:
        award_points(current_user, db, POINTS_RULES["ai_query"], "AI 问答")
    await db.commit()

    # Apply user's personal AI config if set
    await reload_user_ai_config(db, current_user.id)

    history = [h.model_dump() for h in body.history]

    async def event_gen():
        async for chunk in query_natural_language_stream(body.question, history):
            yield chunk

    return StreamingResponse(event_gen(), media_type="text/event-stream")
