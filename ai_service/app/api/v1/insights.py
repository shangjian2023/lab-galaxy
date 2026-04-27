"""Insight discovery endpoint."""

from fastapi import APIRouter

from app.services.insights import discover_insights

router = APIRouter()


@router.get("/discover")
async def discover():
    """Scan the knowledge graph for hidden connections across experiments."""
    return await discover_insights()
