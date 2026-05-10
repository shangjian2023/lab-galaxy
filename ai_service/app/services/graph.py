"""Neo4j graph service — write entities and relations with pooled driver."""

import logging

from app.core.config import settings
from app.core.connections import get_neo4j_driver
from app.core.exceptions import GraphWriteError

logger = logging.getLogger(__name__)

import re

VALID_LABELS = settings.VALID_LABELS
VALID_REL_TYPES = settings.VALID_REL_TYPES


def _normalize_name(name: str) -> str:
    """Normalize entity name for dedup: collapse whitespace, strip common suffixes."""
    name = re.sub(r"\s+", " ", name.strip())
    # Remove trailing "实验" suffix — LLM inconsistently adds it
    if name.endswith("实验") and len(name) > 4:
        name = name[:-2]
    return name


async def write_entities_and_relations(
    document_id: str,
    entities: list[dict],
    relations: list[dict],
) -> int:
    """Write extracted entities and relations to Neo4j.

    Merges by (normalized_name, type) so that the same entity referenced by
    multiple documents — or reprocessed with slightly different names — becomes
    a single shared node.
    """
    driver = get_neo4j_driver()
    id_map: dict[str, str] = {}

    # Pre-validate and group entities by type for batch UNWIND
    valid_entities: list[dict] = []
    # Track which entities appear in relations
    relation_entity_ids: set[str] = set()
    for rel in relations:
        relation_entity_ids.add(rel.get("source_id"))
        relation_entity_ids.add(rel.get("target_id"))

    for ent in entities:
        entity_type = ent.get("type", "Concept")
        if entity_type not in VALID_LABELS:
            logger.warning(f"Invalid entity type '{entity_type}', falling back to 'Concept'")
            entity_type = "Concept"
        raw_name = ent.get("name", "").strip()
        if not raw_name:
            continue
        # Skip entities not involved in any relation (orphaned nodes)
        if ent.get("id") not in relation_entity_ids:
            logger.info(f"Dropping orphaned entity: {raw_name} ({entity_type})")
            continue
        name = _normalize_name(raw_name)
        valid_entities.append({
            "id": ent["id"],
            "name": name,
            "raw_name": raw_name,
            "type": entity_type,
            "summary": ent.get("summary", ""),
        })

    async with driver.session() as session:
        # Delete old graph data for this document to prevent duplicates on reprocessing
        await session.run("""
            MATCH ()-[r {document_id: $doc_id}]->()
            DELETE r
        """, doc_id=document_id)
        await session.run("""
            MATCH (n {document_id: $doc_id})
            WHERE NOT (n)--()
            DELETE n
        """, doc_id=document_id)
        # Batch write entities grouped by label (Neo4j doesn't support parameterized labels)
        by_type: dict[str, list[dict]] = {}
        for e in valid_entities:
            by_type.setdefault(e["type"], []).append(e)

        for entity_type, batch in by_type.items():
            query = f"""
            UNWIND $batch AS ent
            MERGE (n:{entity_type} {{name: ent.name}})
            ON CREATE SET n.id = ent.id, n.created_at = datetime(), n.summary = ent.summary, n.display_name = ent.raw_name
            ON MATCH SET n.summary = CASE
                WHEN n.summary IS NULL OR n.summary = '' THEN ent.summary
                ELSE n.summary
            END
            SET n.document_id = $doc_id
            RETURN ent.id AS input_id, n.id AS node_id
            """
            result = await session.run(query, batch=batch, doc_id=document_id)
            async for record in result:
                id_map[record["input_id"]] = record["node_id"]

        # Batch write relations grouped by type
        valid_rels: list[dict] = []
        for rel in relations:
            rel_type = rel.get("type", "RELATED_TO").replace(" ", "_").upper()
            if rel_type not in VALID_REL_TYPES:
                logger.warning(f"Invalid relation type '{rel_type}', falling back to 'RELATED_TO'")
                rel_type = "RELATED_TO"
            src_id = id_map.get(rel.get("source_id"))
            tgt_id = id_map.get(rel.get("target_id"))
            if not src_id or not tgt_id:
                continue
            valid_rels.append({
                "source_id": src_id,
                "target_id": tgt_id,
                "type": rel_type,
                "confidence": rel.get("confidence", 0.5),
            })

        rel_by_type: dict[str, list[dict]] = {}
        for r in valid_rels:
            rel_by_type.setdefault(r["type"], []).append(r)

        for rel_type, batch in rel_by_type.items():
            query = f"""
            UNWIND $batch AS rel
            MATCH (a {{id: rel.source_id}}), (b {{id: rel.target_id}})
            MERGE (a)-[r:{rel_type}]->(b)
            SET r.confidence = rel.confidence,
                r.document_id = $doc_id
            """
            await session.run(query, batch=batch, doc_id=document_id)

    return len(valid_entities)


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
    """Expand neighborhood around given entity IDs. Returns nodes and relations."""
    driver = get_neo4j_driver()
    nodes: dict[str, dict] = {}
    relations: list[dict] = []
    seen_rels: set[str] = set()
    hops = max(1, min(max_hops, 4))

    async with driver.session() as session:
        query = f"""
        MATCH path = (n)-[r*1..{hops}]-(m)
        WHERE n.id IN $ids
        UNWIND relationships(path) AS rel
        WITH DISTINCT n, m, rel
        RETURN n.id AS n_id, n.name AS n_name, labels(n) AS n_labels, n.summary AS n_summary, n.document_id AS n_doc_id,
               m.id AS m_id, m.name AS m_name, labels(m) AS m_labels, m.summary AS m_summary, m.document_id AS m_doc_id,
               startNode(rel).id AS src, endNode(rel).id AS tgt,
               type(rel) AS rel_type, rel.confidence AS confidence
        LIMIT $limit
        """
        records = await session.run(query, ids=entity_ids, limit=limit)
        async for r in records:
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
                        "document_id": r.get(f"{prefix}_doc_id"),
                    }

            rel_type = r["rel_type"]
            if rel_type:
                rel_key = f"{r['src']}->{r['tgt']}:{rel_type}"
                if rel_key not in seen_rels:
                    seen_rels.add(rel_key)
                    relations.append({
                        "source_id": r["src"],
                        "target_id": r["tgt"],
                        "type": rel_type,
                        "confidence": r["confidence"] or 0.5,
                    })

        seed_query = """
        MATCH (n) WHERE n.id IN $ids
        RETURN n.id AS id, n.name AS name, labels(n) AS labels, n.summary AS summary, n.document_id AS doc_id
        """
        seed_records = await session.run(seed_query, ids=entity_ids)
        async for r in seed_records:
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
        result = await session.run("""
            MATCH ()-[r {document_id: $doc_id}]->()
            DELETE r
            RETURN count(r) AS cnt
        """, doc_id=document_id)
        async for record in result:
            deleted += record["cnt"]

        result = await session.run("""
            MATCH (n {document_id: $doc_id})
            WHERE NOT (n)--()
            DELETE n
            RETURN count(n) AS cnt
        """, doc_id=document_id)
        async for record in result:
            deleted += record["cnt"]

    return deleted


async def cleanup_orphaned_experiments() -> int:
    """Remove Experiment nodes that have no relations (orphaned). Returns count deleted."""
    driver = get_neo4j_driver()
    async with driver.session() as session:
        result = await session.run("""
            MATCH (n:Experiment)
            WHERE NOT (n)--()
            WITH n LIMIT 500
            DELETE n
            RETURN count(n) AS cnt
        """)
        async for record in result:
            return record["cnt"]
    return 0


async def cleanup_isolated_nodes() -> int:
    """Remove all nodes with no relations across all types. Returns count deleted."""
    driver = get_neo4j_driver()
    async with driver.session() as session:
        result = await session.run("""
            MATCH (n)
            WHERE NOT (n)--()
            WITH n LIMIT 500
            DELETE n
            RETURN count(n) AS cnt
        """)
        async for record in result:
            return record["cnt"]
    return 0
