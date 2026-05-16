"""Natural language query and AI suggestion endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.query import natural_language_query, suggest_relations

router = APIRouter()

MAX_QUESTION_LEN = 500


class MessageHistory(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class QueryRequest(BaseModel):
    question: str = Field(..., max_length=MAX_QUESTION_LEN)
    history: list[MessageHistory] = []


class SuggestRequest(BaseModel):
    node_id: str = Field(..., max_length=128)


@router.post("/query")
async def query(body: QueryRequest):
    """Natural language query over the knowledge graph (RAG pipeline)."""
    try:
        return await natural_language_query(body.question, body.history)
    except Exception as e:
        import logging, traceback
        logger = logging.getLogger(__name__)
        tb = traceback.format_exc()
        logger.error(f"Query error: {e}\n{tb}")
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)[:500], "detail": "查询处理失败，请稍后重试"})


@router.post("/suggest-relations")
async def suggest(body: SuggestRequest):
    """AI-suggested relationships for a given node."""
    return await suggest_relations(body.node_id)
