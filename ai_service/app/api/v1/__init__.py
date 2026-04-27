"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1.processing import router as processing_router
from app.api.v1.search import router as search_router
from app.api.v1.insights import router as insights_router
from app.api.v1.monitoring import router as monitoring_router
from app.api.v1.query import router as query_router

router = APIRouter()
router.include_router(processing_router, tags=["processing"])
router.include_router(search_router, tags=["search"])
router.include_router(insights_router, prefix="/insights", tags=["insights"])
router.include_router(monitoring_router, prefix="/monitoring", tags=["monitoring"])
router.include_router(query_router, tags=["query"])
