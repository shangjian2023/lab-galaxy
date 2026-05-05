"""Neo4j graph CRUD for admin editing."""

from neo4j import AsyncGraphDatabase

from app.core.config import settings

VALID_LABELS = {"Experiment", "Equipment", "Theory", "Consumable", "Tool", "Concept"}
VALID_REL_TYPES = {"USES", "BASED_ON", "SIMILAR_TO", "REQUIRES", "RELATED_TO"}

_driver_instance = None


def _get_driver():
    global _driver_instance
    if _driver_instance is None:
        _driver_instance = AsyncGraphDatabase.driver(settings.NEO4J_URI, auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD))
    return _driver_instance


def _normalize_rel_type(rel_type: str) -> str:
    normalized = rel_type.upper().replace(" ", "_")
    if normalized not in VALID_REL_TYPES:
        raise ValueError("不支持的关系类型")
    return normalized


async def list_nodes(label: str | None = None, skip: int = 0, limit: int = 100) -> list[dict]:
    driver = _get_driver()
    results = []
    async with driver.session() as session:
        if label and label in VALID_LABELS:
            q = f"MATCH (n:{label}) RETURN n.id AS id, labels(n) AS labels, n.name AS name, n.summary AS summary, n.document_id AS document_id ORDER BY n.name SKIP $skip LIMIT $limit"
        else:
            q = "MATCH (n) RETURN n.id AS id, labels(n) AS labels, n.name AS name, n.summary AS summary, n.document_id AS document_id ORDER BY n.name SKIP $skip LIMIT $limit"
        records = await session.run(q, skip=skip, limit=limit)
        async for r in records:
            lbls = [l for l in r["labels"] if l in VALID_LABELS]
            results.append({
                "id": r["id"],
                "type": lbls[0] if lbls else "Concept",
                "name": r["name"] or "",
                "summary": r["summary"] or "",
                "document_id": r.get("document_id"),
            })
    return results


async def get_node(node_id: str) -> dict | None:
    driver = _get_driver()
    result = None
    async with driver.session() as session:
        records = await session.run(
            "MATCH (n {id: $id}) RETURN n.id AS id, labels(n) AS labels, n.name AS name, n.summary AS summary, n.document_id AS document_id",
            id=node_id,
        )
        async for r in records:
            lbls = [l for l in r["labels"] if l in VALID_LABELS]
            result = {
                "id": r["id"],
                "type": lbls[0] if lbls else "Concept",
                "name": r["name"] or "",
                "summary": r["summary"] or "",
                "document_id": r.get("document_id"),
            }
    return result


async def create_node(data: dict) -> dict:
    import uuid

    driver = _get_driver()
    node_id = data.get("id") or str(uuid.uuid4())
    label = data.get("type", "Concept")
    if label not in VALID_LABELS:
        label = "Concept"

    async with driver.session() as session:
        q = f"""
        MERGE (n:{label} {{name: $name}})
        ON CREATE SET n.id = $id
        SET n.summary = $summary, n.document_id = $doc_id
        RETURN n.id AS id, labels(n) AS labels, n.name AS name, n.summary AS summary, n.document_id AS document_id
        """
        records = await session.run(
            q,
            id=node_id,
            name=data.get("name", ""),
            summary=data.get("summary", ""),
            doc_id=data.get("document_id"),
        )
        result = None
        async for r in records:
            lbls = [l for l in r["labels"] if l in VALID_LABELS]
            result = {
                "id": r["id"],
                "type": lbls[0] if lbls else label,
                "name": r["name"] or "",
                "summary": r["summary"] or "",
                "document_id": r.get("document_id"),
            }
    return result or {
        "id": node_id,
        "type": label,
        "name": data.get("name", ""),
        "summary": data.get("summary", ""),
        "document_id": data.get("document_id"),
    }


async def update_node(node_id: str, data: dict) -> bool:
    driver = _get_driver()
    async with driver.session() as session:
        sets = []
        params = {"id": node_id}
        if "name" in data:
            sets.append("n.name = $name")
            params["name"] = data["name"]
        if "summary" in data:
            sets.append("n.summary = $summary")
            params["summary"] = data["summary"]
        if sets:
            q = f"MATCH (n {{id: $id}}) SET {', '.join(sets)}"
            await session.run(q, **params)

        if data.get("type") and data["type"] in VALID_LABELS:
            new_label = data["type"]
            records = await session.run(
                f"MATCH (n {{id: $id}}) RETURN labels(n) AS labels",
                id=node_id,
            )
            async for r in records:
                for lbl in r["labels"]:
                    if lbl in VALID_LABELS:
                        await session.run(
                            f"MATCH (n {{id: $id}}) REMOVE n:{lbl} SET n:{new_label}",
                            id=node_id,
                        )
                        break
    return True


async def delete_node(node_id: str) -> bool:
    driver = _get_driver()
    async with driver.session() as session:
        await session.run("MATCH (n {id: $id}) DETACH DELETE n", id=node_id)
    return True


async def list_relations(node_id: str | None = None, skip: int = 0, limit: int = 100) -> list[dict]:
    driver = _get_driver()
    results = []
    async with driver.session() as session:
        if node_id:
            q = """
            MATCH (a {id: $id})-[r]->(b)
            RETURN a.id AS source_id, b.id AS target_id, type(r) AS type, r.confidence AS confidence, r.document_id AS document_id
            SKIP $skip LIMIT $limit
            """
            records = await session.run(q, id=node_id, skip=skip, limit=limit)
        else:
            q = """
            MATCH (a)-[r]->(b)
            WHERE a.id IS NOT NULL AND b.id IS NOT NULL
            RETURN a.id AS source_id, b.id AS target_id, type(r) AS type, r.confidence AS confidence, r.document_id AS document_id
            SKIP $skip LIMIT $limit
            """
            records = await session.run(q, skip=skip, limit=limit)
        async for r in records:
            results.append({
                "source_id": r["source_id"],
                "target_id": r["target_id"],
                "type": r["type"],
                "confidence": r["confidence"] or 0.5,
                "document_id": r.get("document_id"),
            })
    return results


async def create_relation(data: dict) -> dict:
    driver = _get_driver()
    rel_type = _normalize_rel_type(data.get("type", "RELATED_TO"))
    async with driver.session() as session:
        q = f"""
        MATCH (a {{id: $src}}), (b {{id: $tgt}})
        MERGE (a)-[r:{rel_type}]->(b)
        SET r.confidence = $conf, r.document_id = $doc_id
        RETURN a.id AS source_id, b.id AS target_id, type(r) AS type, r.confidence AS confidence, r.document_id AS document_id
        """
        records = await session.run(
            q,
            src=data["source_id"],
            tgt=data["target_id"],
            conf=data.get("confidence", 0.5),
            doc_id=data.get("document_id"),
        )
        result = None
        async for r in records:
            result = {
                "source_id": r["source_id"],
                "target_id": r["target_id"],
                "type": r["type"],
                "confidence": r["confidence"] or 0.5,
                "document_id": r.get("document_id"),
            }
    if not result:
        raise LookupError("关系两端的节点不存在")
    return result


async def update_relation(source_id: str, target_id: str, rel_type: str, data: dict) -> dict | None:
    driver = _get_driver()
    current_type = _normalize_rel_type(rel_type)
    new_type = _normalize_rel_type(data["type"]) if data.get("type") else current_type

    async with driver.session() as session:
        current_query = f"""
        MATCH (a {{id: $src}})-[r:{current_type}]->(b {{id: $tgt}})
        RETURN r.confidence AS confidence, r.document_id AS document_id
        LIMIT 1
        """
        current_records = await session.run(current_query, src=source_id, tgt=target_id)
        current_relation = None
        async for record in current_records:
            current_relation = {
                "confidence": record["confidence"] or 0.5,
                "document_id": record.get("document_id"),
            }
            break

        if not current_relation:
            return None

        confidence = data.get("confidence", current_relation["confidence"])
        document_id = current_relation["document_id"]

        if new_type != current_type:
            delete_query = f"MATCH (a {{id: $src}})-[r:{current_type}]->(b {{id: $tgt}}) DELETE r"
            await session.run(delete_query, src=source_id, tgt=target_id)
            create_query = f"""
            MATCH (a {{id: $src}}), (b {{id: $tgt}})
            MERGE (a)-[r:{new_type}]->(b)
            SET r.confidence = $conf, r.document_id = $doc_id
            RETURN a.id AS source_id, b.id AS target_id, type(r) AS type, r.confidence AS confidence, r.document_id AS document_id
            """
            records = await session.run(create_query, src=source_id, tgt=target_id, conf=confidence, doc_id=document_id)
        else:
            update_query = f"""
            MATCH (a {{id: $src}})-[r:{current_type}]->(b {{id: $tgt}})
            SET r.confidence = $conf
            RETURN a.id AS source_id, b.id AS target_id, type(r) AS type, r.confidence AS confidence, r.document_id AS document_id
            """
            records = await session.run(update_query, src=source_id, tgt=target_id, conf=confidence)

        result = None
        async for r in records:
            result = {
                "source_id": r["source_id"],
                "target_id": r["target_id"],
                "type": r["type"],
                "confidence": r["confidence"] or 0.5,
                "document_id": r.get("document_id"),
            }
    return result


async def delete_relation(source_id: str, target_id: str, rel_type: str) -> bool:
    driver = _get_driver()
    normalized_type = _normalize_rel_type(rel_type)
    async with driver.session() as session:
        count_query = f"MATCH (a {{id: $src}})-[r:{normalized_type}]->(b {{id: $tgt}}) RETURN count(r) AS cnt"
        count_records = await session.run(count_query, src=source_id, tgt=target_id)
        count = 0
        async for record in count_records:
            count = record["cnt"]
            break
        if count == 0:
            return False
        delete_query = f"MATCH (a {{id: $src}})-[r:{normalized_type}]->(b {{id: $tgt}}) DELETE r"
        await session.run(delete_query, src=source_id, tgt=target_id)
    return True
