"""Natural language query and AI suggestion endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.query import natural_language_query, suggest_relations

router = APIRouter()


class QueryRequest(BaseModel):
    question: str


class SuggestRequest(BaseModel):
    node_id: str


@router.post("/query")
async def query(body: QueryRequest):
    """Natural language query over the knowledge graph (RAG pipeline)."""
    return await natural_language_query(body.question)


@router.post("/suggest-relations")
async def suggest(body: SuggestRequest):
    """AI-suggested relationships for a given node."""
    return await suggest_relations(body.node_id)
