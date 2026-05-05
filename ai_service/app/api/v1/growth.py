"""AI growth analysis endpoint."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.growth_analyzer import analyze_team_growth

router = APIRouter()


class GrowthAnalysisRequest(BaseModel):
    team_name: str
    total_documents: int
    total_achievements: int
    entity_summary: dict[str, list[str]]
    achievements: list[dict]
    members: list[dict]


@router.post("/growth-analysis")
async def growth_analysis(body: GrowthAnalysisRequest):
    """Analyze team growth data and return AI-generated insights."""
    result = await analyze_team_growth(body.model_dump())
    return result
