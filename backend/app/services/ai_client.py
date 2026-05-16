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
    async with httpx.AsyncClient(timeout=900) as client:
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


async def query_natural_language(question: str, history: list[dict] | None = None) -> dict:
    """Send a natural language query to the AI service RAG pipeline."""
    async with httpx.AsyncClient(timeout=180) as client:
        try:
            payload: dict = {"question": question}
            if history:
                # Convert Pydantic models to plain dicts for JSON serialization
                payload["history"] = [
                    h.model_dump() if hasattr(h, "model_dump") else h
                    for h in history
                ]
            resp = await client.post(f"{AI_SERVICE_URL}/query", json=payload)
            if resp.status_code == 500:
                # AI service returned an error — log full details
                logger.error(f"AI service query failed: {resp.status_code} body={resp.text[:500]}")
                return {
                    "answer": f"AI 处理出错：{resp.text[:200]}",
                    "highlighted_nodes": [],
                    "source_documents": [],
                    "suggestions": ["请简化问题后重试", "检查是否上传了相关实验文档"],
                    "related_queries": [],
                    "entities": [],
                }
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"NLQ HTTP error: status={e.response.status_code} body={e.response.text[:500]} url={e.request.url}")
            return {
                "answer": f"AI 服务返回 {e.response.status_code}，请稍后重试。",
                "highlighted_nodes": [],
                "source_documents": [],
                "suggestions": ["请简化问题后重试", "检查是否上传了相关实验文档"],
                "related_queries": [],
                "entities": [],
            }
        except httpx.ConnectError as e:
            logger.error(f"NLQ connection error: {e}")
            return {
                "answer": "无法连接到 AI 服务，请检查服务状态。",
                "highlighted_nodes": [],
                "source_documents": [],
                "suggestions": ["请稍后重试", "联系管理员检查 ai-service 状态"],
                "related_queries": [],
                "entities": [],
            }
        except httpx.TimeoutException as e:
            logger.error(f"NLQ timeout: {e}")
            return {
                "answer": "AI 处理超时，问题可能过于复杂。请稍后重试或简化问题。",
                "highlighted_nodes": [],
                "source_documents": [],
                "suggestions": ["尝试简化问题", "将问题拆分成多个小问题"],
                "related_queries": [],
                "entities": [],
            }
        except httpx.RequestError as e:
            logger.error(f"NLQ request error: {e}")
            return {
                "answer": "AI 服务请求失败，请稍后重试。",
                "highlighted_nodes": [],
                "source_documents": [],
                "suggestions": ["请稍后重试", "联系管理员"],
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


async def reload_ai_config(configs: dict) -> dict:
    """Notify AI service to reload config."""
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.post(f"{AI_SERVICE_URL}/config/reload", json={"configs": configs})
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as e:
            logger.error(f"AI config reload failed: {e}")
            raise AIServiceError(f"Config reload failed: {e}")


async def analyze_growth(data: dict) -> dict:
    """Call AI service for growth analysis."""
    async with httpx.AsyncClient(timeout=120) as client:
        try:
            resp = await client.post(f"{AI_SERVICE_URL}/growth-analysis", json=data)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as e:
            logger.error(f"Growth analysis failed: {e}")
            return {"summary": "分析暂时不可用", "strengths": [], "weaknesses": [], "suggestions": [], "score": 50}
