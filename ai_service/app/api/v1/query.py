"""Natural language query and AI suggestion endpoints."""

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.query import natural_language_query, natural_language_query_stream, suggest_relations

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


@router.post("/query/stream")
async def query_stream(body: QueryRequest):
    """Streaming natural language query — Server-Sent Events.

    Emits one JSON event per line:
      data: {"type":"meta","highlighted_nodes":[...],"source_documents":[...],"entities":[...]}
      data: {"type":"delta","text":"...answer token..."}
      data: {"type":"done"}
      data: {"type":"error","message":"..."}
    Meta is available before the answer starts streaming so the UI can
    highlight nodes immediately.
    """
    history = [m.model_dump() for m in body.history]

    async def event_gen():
        try:
            async for ev in natural_language_query_stream(body.question, history):
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)[:200]}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@router.post("/suggest-relations")
async def suggest(body: SuggestRequest):
    """AI-suggested relationships for a given node."""
    return await suggest_relations(body.node_id)
