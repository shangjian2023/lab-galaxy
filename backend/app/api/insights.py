"""Insight discovery — detect hidden connections across experiments."""

from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.models import User
from app.services.ai_client import trigger_insight_discovery

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/discover")
async def discover_insights(
    current_user: User = Depends(get_current_user),
):
    """Scan the knowledge graph for hidden connections. Delegates to AI service."""
    return await trigger_insight_discovery()
