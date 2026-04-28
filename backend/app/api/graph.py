"""Public graph API — data views, CRUD, SSE stream, AI suggestions."""

import asyncio
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from neo4j import AsyncGraphDatabase
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Document, User
from app.services.event_bus import graph_event_bus
from app.services.ai_client import suggest_relations

router = APIRouter(prefix="/graph", tags=["graph"])

_driver_instance = None


def _driver():
    global _driver_instance
    if _driver_instance is None:
        _driver_instance = AsyncGraphDatabase.driver(settings.NEO4J_URI, auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD))
    return _driver_instance


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
    "Experiment": 28,
    "Equipment": 26,
    "Theory": 26,
    "Consumable": 22,
    "Tool": 24,
    "Concept": 20,
}


def _node_type(labels: list[str]) -> str:
    for l in labels:
        if l in VALID_LABELS:
            return l
    return "Concept"


def _normalize_rel_type(rel_type: str) -> str:
    normalized = rel_type.upper().replace(" ", "_")
    if normalized not in VALID_REL_TYPES:
        raise HTTPException(status_code=400, detail="不支持的关系类型")
    return normalized


async def _visible_document_ids(db: AsyncSession, current_user: User, years: list[int] | None = None) -> list[str]:
    stmt = select(Document.id).where((Document.uploaded_by == current_user.id) | (Document.privacy == "public"))
    if years:
        stmt = stmt.where(Document.experiment_year.in_(years))
    rows = (await db.execute(stmt)).scalars().all()
    return [str(doc_id) for doc_id in rows]


async def _visible_node_ids(db: AsyncSession, current_user: User) -> set[str]:
    visible_doc_ids = await _visible_document_ids(db, current_user)
    driver = _driver()
    node_ids: set[str] = set()
    async with driver.session() as session:
        if visible_doc_ids:
            query = """
            MATCH (n)
            WHERE n.document_id IS NULL OR n.document_id IN $doc_ids
            RETURN n.id AS id
            """
            records = await session.run(query, doc_ids=visible_doc_ids)
        else:
            query = """
            MATCH (n)
            WHERE n.document_id IS NULL
            RETURN n.id AS id
            """
            records = await session.run(query)
        async for record in records:
            if record["id"]:
                node_ids.add(record["id"])
    return node_ids


@router.get("/data")
async def get_graph_data(
    node_type: str | None = Query(None),
    keyword: str | None = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    from_date: str | None = Query(None, description="ISO date, e.g. 2024-01-01"),
    to_date: str | None = Query(None, description="ISO date, e.g. 2024-12-31"),
    years: str | None = Query(None, description="Comma-separated years, e.g. 2024,2025"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    driver = _driver()
    elements: dict = {"nodes": [], "edges": []}
    parsed_years: list[int] | None = None
    if years:
        try:
            parsed_years = [int(y.strip()) for y in years.split(",") if y.strip()]
        except ValueError:
            parsed_years = None
    visible_doc_ids = await _visible_document_ids(db, current_user, years=parsed_years)

    async with driver.session() as session:
        node_query = "MATCH (n)"
        conditions = []
        params: dict = {"limit": limit, "doc_ids": visible_doc_ids}

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
        if visible_doc_ids:
            conditions.append("(n.document_id IS NULL OR n.document_id IN $doc_ids)")
        else:
            conditions.append("n.document_id IS NULL")

        if conditions:
            node_query += " WHERE " + " AND ".join(conditions)

        node_query += " RETURN n.id AS id, labels(n) AS labels, n.name AS name, n.summary AS summary, n.document_id AS doc_id, n.created_at AS created_at ORDER BY n.name LIMIT $limit"

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
            n["size"] = min(base + degree * 3, 55)
            elements["nodes"].append({"data": n})

    return elements


@router.get("/years")
async def get_available_years(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return distinct experiment years that have documents with graph data."""
    stmt = (
        select(Document.experiment_year)
        .where(
            ((Document.uploaded_by == current_user.id) | (Document.privacy == "public"))
            & Document.experiment_year.isnot(None)
            & (Document.status == "completed")
        )
        .distinct()
        .order_by(Document.experiment_year.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return {"years": [r for r in rows if r is not None]}


@router.get("/timeline")
async def get_timeline_data(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    driver = _driver()
    result: list[dict] = []
    visible_doc_ids = await _visible_document_ids(db, current_user)

    async with driver.session() as session:
        if visible_doc_ids:
            query = """
            MATCH (n)
            WHERE n.name IS NOT NULL AND (n.document_id IS NULL OR n.document_id IN $doc_ids)
            RETURN n.id AS id, labels(n) AS labels, n.name AS name, n.summary AS summary
            ORDER BY n.name
            """
            records = await session.run(query, doc_ids=visible_doc_ids)
        else:
            query = """
            MATCH (n)
            WHERE n.name IS NOT NULL AND n.document_id IS NULL
            RETURN n.id AS id, labels(n) AS labels, n.name AS name, n.summary AS summary
            ORDER BY n.name
            """
            records = await session.run(query)
        async for r in records:
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

    return result


@router.get("/matrix")
async def get_matrix_data(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    driver = _driver()
    result: list[dict] = []
    visible_doc_ids = await _visible_document_ids(db, current_user)

    async with driver.session() as session:
        if visible_doc_ids:
            query = """
            MATCH (a)-[r]->(b)
            WHERE a.id IS NOT NULL AND b.id IS NOT NULL
              AND (a.document_id IS NULL OR a.document_id IN $doc_ids)
              AND (b.document_id IS NULL OR b.document_id IN $doc_ids)
            RETURN labels(a) AS src_labels, labels(b) AS tgt_labels, type(r) AS rel_type, count(*) AS count
            """
            records = await session.run(query, doc_ids=visible_doc_ids)
        else:
            query = """
            MATCH (a)-[r]->(b)
            WHERE a.id IS NOT NULL AND b.id IS NOT NULL
              AND a.document_id IS NULL AND b.document_id IS NULL
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

    return result


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
        MERGE (n:{body.type} {{name: $name}})
        ON CREATE SET n.id = $id, n.created_by = $user_id, n.created_at = $now
        SET n.summary = $summary
        RETURN n.id AS id, n.name AS name, labels(n) AS labels, n.summary AS summary, n.document_id AS document_id
        """
        records = await session.run(query, id=node_id, name=body.name, summary=body.summary, user_id=str(current_user.id), now=now)
        result = None
        async for r in records:
            ntype = _node_type(r["labels"])
            result = {"id": r["id"], "name": r["name"], "type": ntype, "summary": r["summary"], "document_id": r.get("document_id")}

    graph_event_bus.publish("node_created", result or {"id": node_id})
    return result


@router.post("/relations")
async def create_relation(
    body: RelationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rel_type = _normalize_rel_type(body.type)
    visible_node_ids = await _visible_node_ids(db, current_user)
    if body.source_id not in visible_node_ids or body.target_id not in visible_node_ids:
        raise HTTPException(status_code=403, detail="不能修改不可见节点之间的关系")

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

    if not result:
        raise HTTPException(status_code=404, detail="关系两端的节点不存在")

    graph_event_bus.publish("relation_created", result)
    return result


@router.patch("/nodes/{node_id}")
async def update_node(
    node_id: str,
    body: NodeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    visible_node_ids = await _visible_node_ids(db, current_user)
    if node_id not in visible_node_ids:
        raise HTTPException(status_code=403, detail="无权修改此节点")

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
            raise HTTPException(status_code=400, detail="没有可更新的字段")
        sets.append("n.updated_by = $user_id")
        query = f"MATCH (n {{id: $id}}) SET {', '.join(sets)} RETURN n.id AS id, n.name AS name, labels(n) AS labels, n.summary AS summary"
        records = await session.run(query, **params)
        result = None
        async for r in records:
            ntype = _node_type(r["labels"])
            result = {"id": r["id"], "name": r["name"], "type": ntype, "summary": r["summary"]}

    if not result:
        raise HTTPException(status_code=404, detail="节点不存在")

    graph_event_bus.publish("node_updated", result)
    return result


@router.delete("/nodes/{node_id}")
async def delete_node(
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    visible_node_ids = await _visible_node_ids(db, current_user)
    if node_id not in visible_node_ids:
        raise HTTPException(status_code=403, detail="无权删除此节点")

    driver = _driver()
    async with driver.session() as session:
        count_records = await session.run("MATCH (n {id: $id}) RETURN count(n) AS cnt", id=node_id)
        count = 0
        async for record in count_records:
            count = record["cnt"]
            break
        if count == 0:
            raise HTTPException(status_code=404, detail="节点不存在")
        await session.run("MATCH (n {id: $id}) DETACH DELETE n", id=node_id)

    graph_event_bus.publish("node_deleted", {"id": node_id})
    return {"status": "deleted"}


@router.get("/stream")
async def graph_stream(
    current_user: User = Depends(get_current_user),
):
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


@router.post("/suggest-relations")
async def suggest_node_relations(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    node_id = body.get("node_id", "")
    if not node_id:
        return {"suggestions": []}
    visible_node_ids = await _visible_node_ids(db, current_user)
    if node_id not in visible_node_ids:
        raise HTTPException(status_code=403, detail="无权访问此节点")
    return await suggest_relations(node_id)
