"""Search endpoints — semantic vector search and graph similarity."""

from fastapi import APIRouter

from app.schemas.requests import SearchRequest
from app.services.vector import search as vector_search
from app.services.graph import find_similar_experiments

router = APIRouter()


@router.post("/search")
async def semantic_search(body: SearchRequest):
    """Semantic search across indexed entities."""
    results = await vector_search(body.query, body.top_k)
    return {"results": [{"id": rid, "score": score} for rid, score in results]}


@router.get("/similar/{experiment_name}")
async def similar_experiments(experiment_name: str, top_k: int = 5):
    """Find similar experiments in the knowledge graph."""
    results = await find_similar_experiments(experiment_name, top_k)
    return {"results": results}
