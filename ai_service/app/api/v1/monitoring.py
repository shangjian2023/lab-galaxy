"""Monitoring endpoints — stats, health, registry info."""

import os
import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.monitoring.stats import stats_collector
from app.registries.parsers import parser_registry
from app.registries.extractors import extractor_registry
from app.registries.llm_providers import llm_provider_registry

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/stats/pipeline")
async def pipeline_stats():
    """Aggregated pipeline execution statistics."""
    return stats_collector.get_summary()


@router.get("/stats/accuracy")
async def accuracy_stats():
    """Entity/relation extraction accuracy metrics."""
    return stats_collector.get_accuracy()


@router.get("/stats/registry")
async def registry_stats():
    """List all registered components."""
    return {
        "parsers": parser_registry.list_keys(),
        "extractors": extractor_registry.list_keys(),
        "llm_providers": llm_provider_registry.list_keys(),
        "active_llm_provider": settings.LLM_PROVIDER,
        "active_llm_model": settings.ANTHROPIC_MODEL if settings.LLM_PROVIDER == "anthropic" else settings.OPENAI_MODEL,
        "embedding_model": settings.EMBEDDING_MODEL,
    }


@router.get("/health/detailed")
async def health_detailed():
    """Detailed health check including service dependencies."""
    checks = {}

    # Neo4j
    try:
        from app.core.connections import get_neo4j_driver
        driver = get_neo4j_driver()
        async with driver.session() as session:
            await session.run("RETURN 1")
        checks["neo4j"] = "ok"
    except Exception as e:
        checks["neo4j"] = f"error: {e}"

    # FAISS index
    faiss_exists = os.path.exists(settings.FAISS_INDEX_PATH)
    faiss_size = os.path.getsize(settings.FAISS_INDEX_PATH) if faiss_exists else 0
    checks["faiss"] = {
        "index_exists": faiss_exists,
        "index_size_bytes": faiss_size,
        "index_path": settings.FAISS_INDEX_PATH,
    }

    # LLM provider
    checks["llm_provider"] = settings.LLM_PROVIDER
    checks["llm_model"] = settings.ANTHROPIC_MODEL if settings.LLM_PROVIDER == "anthropic" else settings.OPENAI_MODEL

    all_ok = checks.get("neo4j") == "ok"
    status_code = 200 if all_ok else 503
    return JSONResponse(status_code=status_code, content={"status": "ok" if all_ok else "degraded", "checks": checks})
