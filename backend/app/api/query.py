"""Natural language query endpoint."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import User
from app.services.ai_client import query_natural_language
from app.services.usage import check_query_quota, increment_query

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
    result = await query_natural_language(body.question, body.history)
    if not quota["unlimited"]:
        await increment_query(db, current_user.id)
        await db.commit()
    return result
