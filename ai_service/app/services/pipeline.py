"""Full pipeline: parse -> extract -> write graph -> index vectors."""

import logging
import time

from app.services.parser import parse_file
from app.services.extractor import extract_entities
from app.services.graph import write_entities_and_relations
from app.services.vector import add_to_index
from app.monitoring.stats import stats_collector

logger = logging.getLogger(__name__)


async def process_document(data: bytes, filename: str, document_id: str) -> dict:
    """
    Run the full AI pipeline on a document:
    1. Parse to text
    2. Extract entities & relations
    3. Write to Neo4j
    4. Index text in FAISS

    Returns the extraction result.
    """
    start = time.monotonic()

    # Step 1: Parse
    try:
        text = parse_file(data, filename)
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"Parse failed for {filename}: {e}")
        raise

    parse_time = time.monotonic() - start

    if not text.strip():
        raise ValueError("文档内容为空，无法解析")

    # Step 2: Extract entities & relations
    result = await extract_entities(text)
    entities = result.get("entities", [])
    relations = result.get("relations", [])
    extract_time = time.monotonic() - start - parse_time

    # Step 3: Write to Neo4j
    try:
        node_count = await write_entities_and_relations(document_id, entities, relations)
        logger.info(f"Wrote {node_count} nodes to Neo4j for doc {document_id}")
    except Exception as e:
        logger.warning(f"Neo4j write failed (non-fatal): {e}")

    # Step 4: Vector index (async, non-blocking)
    try:
        texts = [f"{e.get('name', '')} {e.get('summary', '')}" for e in entities]
        ids = [e["id"] for e in entities]
        await add_to_index(texts, ids)
    except Exception as e:
        logger.warning(f"Vector indexing failed (non-fatal): {e}")

    total_time = time.monotonic() - start
    stats_collector.record_pipeline(document_id, filename, parse_time, extract_time,
                                    total_time, len(entities), len(relations))

    return {
        "document_id": document_id,
        "text_length": len(text),
        "entity_count": len(entities),
        "relation_count": len(relations),
        "entities": entities,
        "relations": relations,
    }
