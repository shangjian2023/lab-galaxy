"""Neo4j graph CRUD for admin editing."""

from neo4j import AsyncGraphDatabase

from app.core.config import settings

VALID_LABELS = {"Experiment", "Equipment", "Theory", "Consumable", "Tool", "Concept"}
VALID_REL_TYPES = {"USES", "BASED_ON", "SIMILAR_TO", "REQUIRES", "RELATED_TO"}


def _driver():
    return AsyncGraphDatabase.driver(settings.NEO4J_URI, auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD))


async def list_nodes(label: str | None = None, skip: int = 0, limit: int = 100) -> list[dict]:
    driver = _driver()
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
    await driver.close()
    return results


async def get_node(node_id: str) -> dict | None:
    driver = _driver()
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
    await driver.close()
    return result


async def create_node(data: dict) -> dict:
    import uuid
    driver = _driver()
    node_id = data.get("id") or str(uuid.uuid4())
    label = data.get("type", "Concept")
    if label not in VALID_LABELS:
        label = "Concept"

    async with driver.session() as session:
        q = f"""
        CREATE (n:{label} {{id: $id, name: $name, summary: $summary}})
        SET n.document_id = $doc_id
        RETURN n.id AS id
        """
        await session.run(q, id=node_id, name=data.get("name", ""), summary=data.get("summary", ""), doc_id=data.get("document_id"))
    await driver.close()
    return {"id": node_id, "type": label, "name": data.get("name", ""), "summary": data.get("summary", "")}


async def update_node(node_id: str, data: dict) -> bool:
    driver = _driver()
    async with driver.session() as session:
        # Update properties
        sets = []
        params = {"id": node_id}
        if "name" in data:
            sets.append("n.name = $name")
            params["name"] = data["name"]
        if "summary" in data:
            sets.append("n.summary = $summary")
            params["summary"] = data["summary"]
        if not sets:
            await driver.close()
            return True

        q = f"MATCH (n {{id: $id}}) SET {', '.join(sets)}"
        await session.run(q, **params)

        # If type changed, remove old label and add new
        if data.get("type") and data["type"] in VALID_LABELS:
            new_label = data["type"]
            # Remove all valid labels then add the new one
            for old_label in VALID_LABELS:
                await session.run(f"MATCH (n {{id: $id}}) REMOVE n:{old_label}", id=node_id)
            await session.run(f"MATCH (n {{id: $id}}) SET n:{new_label}", id=node_id)
    await driver.close()
    return True


async def delete_node(node_id: str) -> bool:
    driver = _driver()
    async with driver.session() as session:
        await session.run("MATCH (n {id: $id}) DETACH DELETE n", id=node_id)
    await driver.close()
    return True


async def list_relations(node_id: str | None = None, skip: int = 0, limit: int = 100) -> list[dict]:
    driver = _driver()
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
    await driver.close()
    return results


async def create_relation(data: dict) -> dict:
    driver = _driver()
    rel_type = data.get("type", "RELATED_TO").upper().replace(" ", "_")
    async with driver.session() as session:
        q = f"""
        MATCH (a {{id: $src}}), (b {{id: $tgt}})
        MERGE (a)-[r:{rel_type}]->(b)
        SET r.confidence = $conf, r.document_id = $doc_id
        """
        await session.run(
            q,
            src=data["source_id"],
            tgt=data["target_id"],
            conf=data.get("confidence", 0.5),
            doc_id=data.get("document_id"),
        )
    await driver.close()
    return {"source_id": data["source_id"], "target_id": data["target_id"], "type": rel_type, "confidence": data.get("confidence", 0.5)}


async def update_relation(source_id: str, target_id: str, rel_type: str, data: dict) -> bool:
    driver = _driver()
    async with driver.session() as session:
        sets = []
        params = {"src": source_id, "tgt": target_id}
        if "confidence" in data:
            sets.append("r.confidence = $conf")
            params["conf"] = data["confidence"]
        if sets:
            q = f"MATCH (a {{id: $src}})-[r:{rel_type}]->(b {{id: $tgt}}) SET {', '.join(sets)}"
            await session.run(q, **params)
    await driver.close()
    return True


async def delete_relation(source_id: str, target_id: str, rel_type: str) -> bool:
    driver = _driver()
    async with driver.session() as session:
        q = f"MATCH (a {{id: $src}})-[r:{rel_type}]->(b {{id: $tgt}}) DELETE r"
        await session.run(q, src=source_id, tgt=target_id)
    await driver.close()
    return True
