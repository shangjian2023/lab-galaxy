"""Client for calling the AI service."""

import json
import logging

import httpx

from app.core.config import settings

AI_SERVICE_URL = getattr(settings, "AI_SERVICE_URL", "http://localhost:8001/api/v1")
logger = logging.getLogger(__name__)


class AIServiceError(Exception):
    pass


async def trigger_processing(
    document_id: str, filename: str, file_data: bytes, skip_graph: bool = False
) -> dict:
    """Send file to the AI service for processing."""
    params = {"document_id": document_id, "filename": filename}
    if skip_graph:
        params["skip_graph"] = "true"
    async with httpx.AsyncClient(timeout=300) as client:
        try:
            resp = await client.post(
                f"{AI_SERVICE_URL}/process-sync",
                params=params,
                content=file_data,
                headers={"Content-Type": "application/octet-stream"},
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.TimeoutException as e:
            logger.error(f"AI service timeout for doc {document_id}: {e}")
            raise AIServiceError(f"AI service timeout: {e}")
        except httpx.HTTPStatusError as e:
            logger.error(f"AI service error for doc {document_id}: {e.response.status_code} {e.response.text}")
            raise AIServiceError(f"AI service returned {e.response.status_code}: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"AI service connection error for doc {document_id}: {e}")
            raise AIServiceError(f"Cannot reach AI service: {e}")


async def write_to_graph(document_id: str, entities: list[dict], relations: list[dict]) -> dict:
    """Write pre-extracted entities and relations to Neo4j and FAISS via AI service."""
    async with httpx.AsyncClient(timeout=120) as client:
        try:
            resp = await client.post(
                f"{AI_SERVICE_URL}/write-graph",
                json={"document_id": document_id, "entities": entities, "relations": relations},
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as e:
            logger.error(f"Write-graph failed for doc {document_id}: {e}")
            raise AIServiceError(f"Write-graph failed: {e}")


async def trigger_insight_discovery() -> dict:
    """Call the AI service to discover insights from the knowledge graph."""
    async with httpx.AsyncClient(timeout=60) as client:
        try:
            resp = await client.get(f"{AI_SERVICE_URL}/insights/discover")
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as e:
            logger.error(f"Insight discovery failed: {e}")
            return {"insights": [], "total": 0}


async def query_natural_language(question: str) -> dict:
    """Send a natural language query to the AI service RAG pipeline."""
    async with httpx.AsyncClient(timeout=120) as client:
        try:
            resp = await client.post(f"{AI_SERVICE_URL}/query", json={"question": question})
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as e:
            logger.error(f"NLQ failed: {e}")
            return {
                "answer": "AI 服务暂时不可用，请稍后重试。",
                "highlighted_nodes": [],
                "source_documents": [],
                "suggestions": [],
                "related_queries": [],
                "entities": [],
            }


async def suggest_relations(node_id: str) -> dict:
    """Get AI-suggested relationships for a node."""
    async with httpx.AsyncClient(timeout=60) as client:
        try:
            resp = await client.post(f"{AI_SERVICE_URL}/suggest-relations", json={"node_id": node_id})
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as e:
            logger.error(f"Suggest relations failed: {e}")
            return {"suggestions": []}
