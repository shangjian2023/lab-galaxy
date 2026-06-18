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
from app.models.models import Document, User, TeamMember
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

# A node is visible to a set of documents if it belongs to ANY of them. Nodes
# carry both a scalar `document_id` (first owning doc, for backward compat) and a
# list `document_ids` (all docs that share this entity, since MERGE is by name).
# This fragment is the canonical "node belongs to a visible doc" predicate.
# Usage: substitute "{n}" with the node variable and provide $doc_ids param.
_DOC_VISIBLE = (
    "{n}.document_id IS NULL "
    "OR {n}.document_id IN $doc_ids "
    "OR ANY(x IN coalesce({n}.document_ids, []) WHERE x IN $doc_ids)"
)

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


async def _visible_document_ids(
    db: AsyncSession,
    current_user: User,
    years: list[int] | None = None,
    scope: str | None = None,
    team_id: str | None = None,
) -> list[str]:
    """Return document IDs visible to the user based on scope."""
    from app.models.models import TeamMember

    if scope == "public":
        stmt = select(Document.id).where(
            Document.privacy == "public",
            Document.status == "completed",
        )
    elif scope == "private":
        stmt = select(Document.id).where(
            Document.uploaded_by == current_user.id,
            Document.status != "pending_review",
        )
    elif scope == "team":
        # Verify membership
        if team_id:
            is_member = await _check_team_membership(db, current_user, team_id)
            if not is_member:
                return []
            user_team_ids = [team_id]
            team_user_rows = (await db.execute(
                select(TeamMember.user_id).where(TeamMember.team_id == team_id)
            )).scalars().all()
        else:
            user_team_rows = (await db.execute(
                select(TeamMember.team_id).where(TeamMember.user_id == current_user.id)
            )).scalars().all()
            user_team_ids = [str(t) for t in user_team_rows]
            team_user_rows = (await db.execute(
                select(TeamMember.user_id).where(TeamMember.team_id.in_(user_team_ids))
            )).scalars().all()

        team_user_ids = [str(u) for u in team_user_rows]

        # Build query: docs uploaded by team members where either:
        # - current user is the uploader (always sees own docs)
        # - doc's visible_teams includes one of user's teams
        # - doc is public+completed
        stmt = select(Document.id).where(Document.uploaded_by.in_(team_user_ids))

        rows = (await db.execute(stmt)).scalars().all()
        all_doc_ids = [str(d) for d in rows]

        if not all_doc_ids:
            return []

        # Filter in Python for visibility check (also apply year filter here,
        # since this branch returns early and skips the shared years handling below)
        docs = (await db.execute(
            select(Document).where(Document.id.in_(all_doc_ids))
        )).scalars().all()

        year_set = set(years) if years else None
        visible = []
        for doc in docs:
            if year_set is not None and doc.experiment_year not in year_set:
                continue
            if doc.uploaded_by == current_user.id:
                visible.append(str(doc.id))
            elif doc.privacy == "public" and doc.status == "completed":
                visible.append(str(doc.id))
            elif doc.visible_teams:
                doc_teams = [t for t in doc.visible_teams if t]
                if any(t in user_team_ids for t in doc_teams):
                    visible.append(str(doc.id))
        return visible
    else:
        # Default: own completed docs + public completed docs
        stmt = select(Document.id).where(
            (Document.uploaded_by == current_user.id) |
            ((Document.privacy == "public") & (Document.status == "completed"))
        )
        stmt = stmt.where(Document.status != "pending_review")

    if years:
        stmt = stmt.where(Document.experiment_year.in_(years))

    rows = (await db.execute(stmt)).scalars().all()
    return [str(doc_id) for doc_id in rows]



async def _check_team_membership(db: AsyncSession, current_user: User, team_id: str) -> bool:
    """Verify that the current user is a member of the given team."""
    from app.models.models import TeamMember
    result = await db.execute(
        select(TeamMember.id).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == current_user.id,
        )
    )
    return result.scalar_one_or_none() is not None


async def _visible_node_ids(db: AsyncSession, current_user: User) -> set[str]:
    visible_doc_ids = await _visible_document_ids(db, current_user)
    driver = _driver()
    node_ids: set[str] = set()
    async with driver.session() as session:
        if visible_doc_ids:
            query = "MATCH (n) WHERE " + _DOC_VISIBLE.format(n="n") + " RETURN n.id AS id"
            records = await session.run(query, doc_ids=visible_doc_ids)
        else:
            query = """
            MATCH (n)
            WHERE n.document_id IS NULL AND (n.document_ids IS NULL OR size(n.document_ids) = 0)
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
    scope: str | None = Query(None, description="Document scope: public, private, team"),
    team_id: str | None = Query(None, description="Specific team ID for team scope"),
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
    visible_doc_ids = await _visible_document_ids(db, current_user, years=parsed_years, scope=scope, team_id=team_id)

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
            # Append end-of-day if only date is provided
            to_date_param = to_date if "T" in to_date else f"{to_date}T23:59:59"
            conditions.append("(n.created_at IS NULL OR n.created_at <= $to_date)")
            params["to_date"] = to_date_param
        if visible_doc_ids:
            conditions.append("(" + _DOC_VISIBLE.format(n="n") + ")")
        else:
            conditions.append("n.document_id IS NULL AND (n.document_ids IS NULL OR size(n.document_ids) = 0)")

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
    scope: str | None = Query(None, description="Document scope: public, private, team"),
    team_id: str | None = Query(None, description="Specific team ID for team scope"),
):
    """Return distinct experiment years that have documents with graph data.

    Reuses _visible_document_ids so the year list is always consistent with the
    actual nodes shown in /data (previously this used a different visibility rule
    for 'private' scope, which caused year filters to omit years whose nodes were
    visible in the graph).
    """
    visible_doc_ids = await _visible_document_ids(db, current_user, scope=scope, team_id=team_id)
    if not visible_doc_ids:
        return {"years": []}

    stmt = (
        select(Document.experiment_year)
        .where(
            Document.id.in_(visible_doc_ids),
            Document.experiment_year.isnot(None),
            Document.status == "completed",
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
    scope: str | None = Query(None, description="Document scope: public, private, team"),
    team_id: str | None = Query(None, description="Specific team ID for team scope"),
):
    driver = _driver()
    result: list[dict] = []
    visible_doc_ids = await _visible_document_ids(db, current_user, scope=scope, team_id=team_id)

    async with driver.session() as session:
        if visible_doc_ids:
            query = """
            MATCH (n)
            WHERE n.name IS NOT NULL AND (""" + _DOC_VISIBLE.format(n="n") + """)
            RETURN n.id AS id, labels(n) AS labels, n.name AS name, n.summary AS summary
            ORDER BY n.name
            """
            records = await session.run(query, doc_ids=visible_doc_ids)
        else:
            query = """
            MATCH (n)
            WHERE n.name IS NOT NULL AND n.document_id IS NULL AND (n.document_ids IS NULL OR size(n.document_ids) = 0)
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
    scope: str | None = Query(None, description="Document scope: public, private, team"),
    team_id: str | None = Query(None, description="Specific team ID for team scope"),
):
    driver = _driver()
    result: list[dict] = []
    visible_doc_ids = await _visible_document_ids(db, current_user, scope=scope, team_id=team_id)

    async with driver.session() as session:
        if visible_doc_ids:
            query = (
                "MATCH (a)-[r]->(b) "
                "WHERE a.id IS NOT NULL AND b.id IS NOT NULL "
                "AND (" + _DOC_VISIBLE.format(n="a") + ") "
                "AND (" + _DOC_VISIBLE.format(n="b") + ") "
                "RETURN labels(a) AS src_labels, labels(b) AS tgt_labels, type(r) AS rel_type, count(*) AS count"
            )
            records = await session.run(query, doc_ids=visible_doc_ids)
        else:
            query = """
            MATCH (a)-[r]->(b)
            WHERE a.id IS NOT NULL AND b.id IS NOT NULL
              AND a.document_id IS NULL AND (a.document_ids IS NULL OR size(a.document_ids) = 0)
              AND b.document_id IS NULL AND (b.document_ids IS NULL OR size(b.document_ids) = 0)
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
    # Any logged-in user can request relation suggestions for a shared node.
    # The suggestions only contain relation *types/candidates already visible*
    # to the user (see suggest_relations filtering).
    return await suggest_relations(node_id)


@router.post("/cleanup/orphans")
async def cleanup_orphaned_nodes(
    current_user: User = Depends(get_current_user),
):
    """Remove isolated nodes with no relations. Admin/owner only."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")

    driver = _driver()
    async with driver.session() as session:
        exp_result = await session.run("""
            MATCH (n:Experiment) WHERE NOT (n)--()
            WITH n LIMIT 500 DELETE n RETURN count(n) AS cnt
        """)
        removed_experiments = 0
        async for record in exp_result:
            removed_experiments = record["cnt"]

        iso_result = await session.run("""
            MATCH (n) WHERE NOT (n)--()
            WITH n LIMIT 500 DELETE n RETURN count(n) AS cnt
        """)
        removed_isolated = 0
        async for record in iso_result:
            removed_isolated = record["cnt"]

    return {
        "removed_experiments": removed_experiments,
        "removed_isolated": removed_isolated,
        "total": removed_experiments + removed_isolated,
    }


@router.get("/tree")
async def get_relation_tree(
    root_id: str = Query(...),
    target_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a relation tree rooted at a specific node, optionally filtered by target type.

    Direction: a node @-mentioned in a post/chat is viewable by any logged-in user,
    along with its direct neighbours and their source documents — same permissions
    as the user's own nodes. So neither the root nor its neighbours are filtered by
    the viewer's document visibility here; only the bulk /graph/data endpoint
    enforces that.
    """
    driver = _driver()
    async with driver.session() as session:
        # Get root node (with document_id)
        root_result = await session.run(
            "MATCH (n {id: $id}) RETURN n.id AS id, n.name AS name, labels(n) AS labels, "
            "n.summary AS summary, n.document_id AS document_id",
            id=root_id,
        )
        root_record = await root_result.single()
        if not root_record:
            raise HTTPException(status_code=404, detail="节点不存在")

        root_type = _node_type(root_record["labels"])
        root = {
            "id": root_record["id"],
            "name": root_record["name"] or "",
            "type": root_type,
            "summary": root_record["summary"] or "",
            "document_id": root_record.get("document_id"),
            "children": [],
        }

        # Get related nodes — include document_id, no visibility filter (shared context)
        if target_type and target_type in VALID_LABELS:
            rel_query = """
                MATCH (n {id: $id})-[r]-(m:{target_type})
                WHERE m.id <> $id
                RETURN m.id AS id, m.name AS name, labels(m) AS labels, m.summary AS summary,
                       m.document_id AS document_id, type(r) AS rel_type
                LIMIT 50
            """.replace("{target_type}", target_type)
        else:
            rel_query = """
                MATCH (n {id: $id})-[r]-(m)
                WHERE m.id <> $id
                RETURN m.id AS id, m.name AS name, labels(m) AS labels, m.summary AS summary,
                       m.document_id AS document_id, type(r) AS rel_type
                LIMIT 50
            """

        rel_result = await session.run(rel_query, id=root_id)
        children = []
        async for record in rel_result:
            child_type = _node_type(record["labels"])
            children.append({
                "id": record["id"],
                "name": record["name"] or "",
                "type": child_type,
                "summary": record["summary"] or "",
                "document_id": record.get("document_id"),
                "rel_type": record["rel_type"] or "RELATED_TO",
                "children": [],
            })

        root["children"] = children

    return {"root": root}


@router.get("/search")
async def search_graph_nodes(
    q: str = Query(..., min_length=1),
    node_type: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    scope: str | None = Query(None, description="Document scope: public, private, team"),
    team_id: str | None = Query(None, description="Specific team ID for team scope"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search graph nodes by name keyword, filtered by visibility scope."""
    driver = _driver()
    visible_doc_ids = await _visible_document_ids(db, current_user, scope=scope, team_id=team_id)
    async with driver.session() as session:
        if node_type and node_type in VALID_LABELS:
            cypher = (
                "MATCH (n:{label}) WHERE n.name CONTAINS $q AND (".format(label=node_type)
                + _DOC_VISIBLE.format(n="n")
                + ") RETURN n.id AS id, n.name AS name, labels(n) AS labels, n.summary AS summary, n.document_id AS document_id LIMIT $limit"
            )
        else:
            cypher = (
                "MATCH (n) WHERE n.name CONTAINS $q AND ("
                + _DOC_VISIBLE.format(n="n")
                + ") RETURN n.id AS id, n.name AS name, labels(n) AS labels, n.summary AS summary, n.document_id AS document_id LIMIT $limit"
            )

        doc_ids_param = visible_doc_ids if visible_doc_ids else ["__none__"]
        result = await session.run(cypher, q=q, limit=limit, doc_ids=doc_ids_param)
        nodes = []
        async for record in result:
            ntype = _node_type(record["labels"])
            nodes.append({
                "id": record["id"],
                "name": record["name"] or "",
                "type": ntype,
                "summary": record["summary"] or "",
                "document_id": record["document_id"],
            })

    return {"nodes": nodes}


@router.get("/node/{node_id}/context")
async def get_node_context(
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check if user can access a node and return its visibility context.

    Returns: {accessible: bool, scope: str, node: {...}}
    - scope is 'personal' if node belongs to a personal doc
    - scope is 'team' if node is visible via team sharing
    - scope is 'public' if node is from a public doc
    """
    driver = _driver()
    async with driver.session() as session:
        result = await session.run(
            "MATCH (n {id: $id}) RETURN n.id AS id, n.name AS name, labels(n) AS labels, "
            "n.summary AS summary, n.document_id AS document_id, n.created_by AS created_by",
            id=node_id,
        )
        record = await result.single()
        if not record:
            raise HTTPException(status_code=404, detail="节点不存在")

        ntype = _node_type(record["labels"])
        node_data = {
            "id": record["id"],
            "name": record["name"] or "",
            "type": ntype,
            "summary": record["summary"] or "",
            "document_id": record.get("document_id"),
            "created_by": record.get("created_by"),
        }

    doc_id = record.get("document_id")
    created_by = record.get("created_by")

    # Direction: any logged-in user can VIEW a node that has been @-mentioned /
    # shared (e.g. in forum posts or team chat). So `accessible` is True as long
    # as the node exists. The bulk graph data endpoint (/graph/data) still
    # enforces strict per-document visibility — here we only decide which scope
    # the node *belongs to*, so the frontend can jump to the most useful view.
    accessible = True
    scope = "none"  # 'none' = node visible but not in any of the user's graph scopes

    if doc_id:
        doc = (await db.execute(
            select(Document).where(Document.id == doc_id)
        )).scalar_one_or_none()
        if doc:
            if doc.privacy == "public" and doc.status == "completed":
                scope = "public"
            elif doc.uploaded_by == current_user.id and doc.status != "pending_review":
                scope = "personal"
            elif doc.visible_teams:
                user_teams = (await db.execute(
                    select(TeamMember.team_id).where(TeamMember.user_id == current_user.id)
                )).scalars().all()
                user_team_strs = [str(t) for t in user_teams]
                doc_teams = [t for t in doc.visible_teams if t]
                if any(t in user_team_strs for t in doc_teams):
                    scope = "team"
    elif created_by == str(current_user.id):
        # Document-less node created by current user
        scope = "personal"

    return {"accessible": accessible, "scope": scope, "node": node_data}
