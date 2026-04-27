"""Neo4j graph service — write entities and relations with pooled driver."""

import logging

from app.core.connections import get_neo4j_driver
from app.core.exceptions import GraphWriteError

logger = logging.getLogger(__name__)

VALID_LABELS = {"Experiment", "Equipment", "Theory", "Consumable", "Tool", "Concept"}
VALID_REL_TYPES = {"USES", "BASED_ON", "SIMILAR_TO", "REQUIRES", "RELATED_TO"}


async def write_entities_and_relations(
    document_id: str,
    entities: list[dict],
    relations: list[dict],
) -> int:
    """Write extracted entities and relations to Neo4j. Returns count of nodes created."""
    driver = get_neo4j_driver()
    created = 0

    async with driver.session() as session:
        for ent in entities:
            entity_type = ent.get("type", "Concept")
            if entity_type not in VALID_LABELS:
                logger.warning(f"Invalid entity type '{entity_type}', falling back to 'Concept'")
                entity_type = "Concept"

            query = f"""
            MERGE (n:{entity_type} {{id: $id}})
            SET n.name = $name,
                n.summary = $summary,
                n.document_id = $doc_id
            """
            await session.run(
                query,
                id=ent["id"],
                name=ent.get("name", ""),
                summary=ent.get("summary", ""),
                doc_id=document_id,
            )
            created += 1

        for rel in relations:
            rel_type = rel.get("type", "RELATED_TO").replace(" ", "_").upper()
            if rel_type not in VALID_REL_TYPES:
                logger.warning(f"Invalid relation type '{rel_type}', falling back to 'RELATED_TO'")
                rel_type = "RELATED_TO"

            query = f"""
            MATCH (a {{id: $source_id}}), (b {{id: $target_id}})
            MERGE (a)-[r:{rel_type}]->(b)
            SET r.confidence = $confidence,
                r.document_id = $doc_id
            """
            await session.run(
                query,
                source_id=rel.get("source_id"),
                target_id=rel.get("target_id"),
                confidence=rel.get("confidence", 0.5),
                doc_id=document_id,
            )

    return created


async def find_similar_experiments(experiment_name: str, top_k: int = 5) -> list[dict]:
    """Find similar experiments in the graph."""
    driver = get_neo4j_driver()
    results = []

    async with driver.session() as session:
        query = """
        MATCH (e:Experiment)
        WHERE e.name CONTAINS $keyword
        RETURN e.id AS id, e.name AS name, e.summary AS summary
        LIMIT $limit
        """
        records = await session.run(query, keyword=experiment_name, limit=top_k)
        async for record in records:
            results.append({
                "id": record["id"],
                "name": record["name"],
                "summary": record["summary"],
            })

    return results


async def expand_neighborhood(entity_ids: list[str], max_hops: int = 2, limit: int = 50) -> dict:
    """Expand 2-hop neighborhood around given entity IDs. Returns nodes and relations."""
    driver = get_neo4j_driver()
    nodes: dict[str, dict] = {}
    relations: list[dict] = []

    async with driver.session() as session:
        query = """
        MATCH path = (n)-[r*1..2]-(m)
        WHERE n.id IN $ids
        UNWIND relationships(path) AS rel
        WITH DISTINCT n, m, rel
        RETURN n.id AS n_id, n.name AS n_name, labels(n) AS n_labels, n.summary AS n_summary,
               m.id AS m_id, m.name AS m_name, labels(m) AS m_labels, m.summary AS m_summary,
               startNode(rel).id AS src, endNode(rel).id AS tgt,
               type(rel) AS rel_type, rel.confidence AS confidence
        LIMIT $limit
        """
        records = await session.run(query, ids=entity_ids, limit=limit)
        async for r in records:
            # Collect nodes
            for prefix in ("n", "m"):
                nid = r[f"{prefix}_id"]
                if nid and nid not in nodes:
                    lbls = r[f"{prefix}_labels"]
                    ntype = next((l for l in lbls if l in VALID_LABELS), "Concept")
                    nodes[nid] = {
                        "id": nid,
                        "name": r[f"{prefix}_name"] or "",
                        "type": ntype,
                        "summary": r[f"{prefix}_summary"] or "",
                    }

            # Collect relations
            rel_type = r["rel_type"]
            if rel_type:
                relations.append({
                    "source_id": r["src"],
                    "target_id": r["tgt"],
                    "type": rel_type,
                    "confidence": r["confidence"] or 0.5,
                })

    # Also include the seed nodes themselves
    seed_query = """
    MATCH (n) WHERE n.id IN $ids
    RETURN n.id AS id, n.name AS name, labels(n) AS labels, n.summary AS summary, n.document_id AS doc_id
    """
    records = await driver.session()  # reuse session
    async with driver.session() as session2:
        records = await session2.run(seed_query, ids=entity_ids)
        async for r in records:
            nid = r["id"]
            if nid not in nodes:
                lbls = r["labels"]
                ntype = next((l for l in lbls if l in VALID_LABELS), "Concept")
                nodes[nid] = {
                    "id": nid,
                    "name": r["name"] or "",
                    "type": ntype,
                    "summary": r["summary"] or "",
                    "document_id": r.get("doc_id"),
                }

    return {"nodes": list(nodes.values()), "relations": relations}


async def delete_document_graph(document_id: str) -> int:
    """Delete all nodes and relations associated with a document."""
    driver = get_neo4j_driver()
    deleted = 0

    async with driver.session() as session:
        # Delete relations first
        result = await session.run("""
            MATCH ()-[r {document_id: $doc_id}]->()
            DELETE r
            RETURN count(r) AS cnt
        """, doc_id=document_id)
        async for record in result:
            deleted += record["cnt"]

        # Delete nodes that belong to this document and have no other relations
        result = await session.run("""
            MATCH (n {document_id: $doc_id})
            WHERE NOT (n)--()
            DELETE n
            RETURN count(n) AS cnt
        """, doc_id=document_id)
        async for record in result:
            deleted += record["cnt"]

    return deleted
