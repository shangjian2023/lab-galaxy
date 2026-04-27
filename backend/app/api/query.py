"""Natural language query endpoint."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.models.models import User
from app.services.ai_client import query_natural_language

router = APIRouter(prefix="/query", tags=["query"])


class QueryRequest(BaseModel):
    question: str


@router.post("")
async def ask_question(
    body: QueryRequest,
    current_user: User = Depends(get_current_user),
):
    """Natural language query over the knowledge graph."""
    return await query_natural_language(body.question)
