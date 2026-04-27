"""Public graph API — data views, CRUD, SSE stream, AI suggestions."""

import asyncio
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from neo4j import AsyncGraphDatabase
from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import get_current_user
from app.models.models import User
from app.services.event_bus import graph_event_bus
from app.services.ai_client import suggest_relations

router = APIRouter(prefix="/graph", tags=["graph"])


def _driver():
    return AsyncGraphDatabase.driver(settings.NEO4J_URI, auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD))


VALID_LABELS = {"Experiment", "Equipment", "Theory", "Consumable", "Tool", "Concept"}
VALID_REL_TYPES = {"USES", "BASED_ON", "SIMILAR_TO", "REQUIRES", "RELATED_TO"}

NODE_COLORS = {
    "Experiment": "#3b82f6",
    "Equipment": "#ef4444",
    "Theory": "#8b5cf6",
    "Consumable": "#f59e0b",
    "Tool": "#10b981",
    "Concept": "#6b7280",
}

NODE_BASE_SIZES = {
    "Experiment": 40,
    "Equipment": 30,
    "Theory": 30,
    "Consumable": 24,
    "Tool": 26,
    "Concept": 22,
}


def _node_type(labels: list[str]) -> str:
    for l in labels:
        if l in VALID_LABELS:
            return l
    return "Concept"


# ========== Data Views ==========

@router.get("/data")
async def get_graph_data(
    node_type: str | None = Query(None),
    keyword: str | None = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    from_date: str | None = Query(None, description="ISO date, e.g. 2024-01-01"),
    to_date: str | None = Query(None, description="ISO date, e.g. 2024-12-31"),
    current_user: User = Depends(get_current_user),
):
    """Return graph data in Cytoscape JSON format with optional temporal filter."""
    driver = _driver()
    elements: dict = {"nodes": [], "edges": []}

    async with driver.session() as session:
        node_query = "MATCH (n)"
        conditions = []
        params: dict = {"limit": limit}

        if node_type and node_type in VALID_LABELS:
            node_query = f"MATCH (n:{node_type})"
        if keyword:
            conditions.append("n.name CONTAINS $keyword")
            params["keyword"] = keyword
        if from_date:
            conditions.append("(n.created_at IS NULL OR n.created_at >= $from_date)")
            params["from_date"] = from_date
        if to_date:
            conditions.append("(n.created_at IS NULL OR n.created_at <= $to_date)")
            params["to_date"] = to_date

        if conditions:
            node_query += " WHERE " + " AND ".join(conditions)

        node_query += " RETURN n.id AS id, labels(n) AS labels, n.name AS name, n.summary AS summary, n.document_id AS doc_id, n.created_at AS created_at LIMIT $limit"

        records = await session.run(node_query, **params)
        node_ids = set()
        nodes_raw: list[dict] = []
        async for r in records:
            ntype = _node_type(r["labels"])
            node_ids.add(r["id"])
            nodes_raw.append({
                "id": r["id"],
                "label": r["name"] or r["id"][:8],
                "name": r["name"] or "",
                "type": ntype,
                "summary": r["summary"] or "",
                "document_id": r.get("doc_id"),
                "color": NODE_COLORS.get(ntype, "#6b7280"),
                "created_at": r.get("created_at"),
            })

        degree_map: dict[str, int] = {}
        if node_ids:
            edge_query = """
            MATCH (a)-[r]->(b)
            WHERE a.id IN $ids AND b.id IN $ids
            RETURN a.id AS source, b.id AS target, type(r) AS type, r.confidence AS confidence
            """
            edge_records = await session.run(edge_query, ids=list(node_ids))
            async for r in edge_records:
                src, tgt = r["source"], r["target"]
                degree_map[src] = degree_map.get(src, 0) + 1
                degree_map[tgt] = degree_map.get(tgt, 0) + 1
                elements["edges"].append({
                    "data": {
                        "id": f"{src}-{tgt}-{r['type']}",
                        "source": src,
                        "target": tgt,
                        "type": r["type"],
                        "confidence": r["confidence"] or 0.5,
                    },
                })

        for n in nodes_raw:
            base = NODE_BASE_SIZES.get(n["type"], 22)
            degree = degree_map.get(n["id"], 0)
            n["size"] = min(base + degree * 4, 80)
            elements["nodes"].append({"data": n})

    await driver.close()
    return elements


@router.get("/timeline")
async def get_timeline_data(
    current_user: User = Depends(get_current_user),
):
    driver = _driver()
    result: list[dict] = []

    async with driver.session() as session:
        query = """
        MATCH (n)-[:DESCRIBES|:INVOLVES]->(d)
        WHERE d.experiment_year IS NOT NULL
        RETURN d.experiment_year AS year, n.id AS id, labels(n) AS labels,
               n.name AS name, n.summary AS summary
        ORDER BY d.experiment_year
        """
        records = await session.run(query)
        async for r in records:
            ntype = _node_type(r["labels"])
            result.append({
                "year": r["year"],
                "node": {
                    "id": r["id"],
                    "name": r["name"] or "",
                    "type": ntype,
                    "summary": r["summary"] or "",
                    "color": NODE_COLORS.get(ntype, "#6b7280"),
                },
            })

        if not result:
            fallback = """
            MATCH (n)
            RETURN n.id AS id, labels(n) AS labels, n.name AS name, n.summary AS summary
            LIMIT 100
            """
            recs = await session.run(fallback)
            async for r in recs:
                ntype = _node_type(r["labels"])
                result.append({
                    "year": None,
                    "node": {
                        "id": r["id"],
                        "name": r["name"] or "",
                        "type": ntype,
                        "summary": r["summary"] or "",
                        "color": NODE_COLORS.get(ntype, "#6b7280"),
                    },
                })

    await driver.close()
    return result


@router.get("/matrix")
async def get_matrix_data(
    current_user: User = Depends(get_current_user),
):
    driver = _driver()
    result: list[dict] = []

    async with driver.session() as session:
        query = """
        MATCH (a)-[r]->(b)
        WHERE a.id IS NOT NULL AND b.id IS NOT NULL
        RETURN labels(a) AS src_labels, labels(b) AS tgt_labels, type(r) AS rel_type, count(*) AS count
        """
        records = await session.run(query)
        async for r in records:
            src_type = _node_type(r["src_labels"])
            tgt_type = _node_type(r["tgt_labels"])
            result.append({
                "row_type": src_type,
                "col_type": tgt_type,
                "relation": r["rel_type"],
                "count": r["count"],
            })

    await driver.close()
    return result


# ========== Public CRUD ==========

class NodeCreate(BaseModel):
    type: str
    name: str
    summary: str = ""


class RelationCreate(BaseModel):
    source_id: str
    target_id: str
    type: str
    confidence: float = 0.8


class NodeUpdate(BaseModel):
    name: str | None = None
    summary: str | None = None


@router.post("/nodes")
async def create_node(
    body: NodeCreate,
    current_user: User = Depends(get_current_user),
):
    if body.type not in VALID_LABELS:
        body.type = "Concept"
    node_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    driver = _driver()
    async with driver.session() as session:
        query = f"""
        CREATE (n:{body.type} {{id: $id, name: $name, summary: $summary, created_by: $user_id, created_at: $now}})
        RETURN n.id AS id, n.name AS name, labels(n) AS labels, n.summary AS summary
        """
        records = await session.run(query, id=node_id, name=body.name, summary=body.summary, user_id=str(current_user.id), now=now)
        result = None
        async for r in records:
            ntype = _node_type(r["labels"])
            result = {"id": r["id"], "name": r["name"], "type": ntype, "summary": r["summary"]}
    await driver.close()

    graph_event_bus.publish("node_created", result or {"id": node_id})
    return result


@router.post("/relations")
async def create_relation(
    body: RelationCreate,
    current_user: User = Depends(get_current_user),
):
    rel_type = body.type.upper().replace(" ", "_")
    if rel_type not in VALID_REL_TYPES:
        rel_type = "RELATED_TO"

    driver = _driver()
    async with driver.session() as session:
        query = f"""
        MATCH (a {{id: $source_id}}), (b {{id: $target_id}})
        MERGE (a)-[r:{rel_type}]->(b)
        SET r.confidence = $confidence, r.created_by = $user_id
        RETURN a.id AS source, b.id AS target, type(r) AS type, r.confidence AS confidence
        """
        records = await session.run(query, source_id=body.source_id, target_id=body.target_id, confidence=body.confidence, user_id=str(current_user.id))
        result = None
        async for r in records:
            result = {"source_id": r["source"], "target_id": r["target"], "type": r["type"], "confidence": r["confidence"]}
    await driver.close()

    graph_event_bus.publish("relation_created", result or {})
    return result


@router.patch("/nodes/{node_id}")
async def update_node(
    node_id: str,
    body: NodeUpdate,
    current_user: User = Depends(get_current_user),
):
    driver = _driver()
    async with driver.session() as session:
        sets = []
        params: dict = {"id": node_id, "user_id": str(current_user.id)}
        if body.name is not None:
            sets.append("n.name = $name")
            params["name"] = body.name
        if body.summary is not None:
            sets.append("n.summary = $summary")
            params["summary"] = body.summary
        if not sets:
            return {"status": "no changes"}
        sets.append("n.updated_by = $user_id")
        query = f"MATCH (n {{id: $id}}) SET {', '.join(sets)} RETURN n.id AS id, n.name AS name, labels(n) AS labels, n.summary AS summary"
        records = await session.run(query, **params)
        result = None
        async for r in records:
            ntype = _node_type(r["labels"])
            result = {"id": r["id"], "name": r["name"], "type": ntype, "summary": r["summary"]}
    await driver.close()

    graph_event_bus.publish("node_updated", result or {"id": node_id})
    return result


@router.delete("/nodes/{node_id}")
async def delete_node(
    node_id: str,
    current_user: User = Depends(get_current_user),
):
    driver = _driver()
    async with driver.session() as session:
        await session.run("MATCH (n {id: $id}) DETACH DELETE n", id=node_id)
    await driver.close()

    graph_event_bus.publish("node_deleted", {"id": node_id})
    return {"status": "deleted"}


# ========== SSE Stream ==========

@router.get("/stream")
async def graph_stream(
    current_user: User = Depends(get_current_user),
):
    """SSE endpoint for real-time graph change notifications."""
    q = graph_event_bus.subscribe()

    async def event_generator():
        try:
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=30)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    yield f": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            graph_event_bus.unsubscribe(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ========== AI Suggestions ==========

@router.post("/suggest-relations")
async def suggest_node_relations(
    body: dict,
    current_user: User = Depends(get_current_user),
):
    """Get AI-suggested relationships for a node."""
    node_id = body.get("node_id", "")
    if not node_id:
        return {"suggestions": []}
    return await suggest_relations(node_id)
