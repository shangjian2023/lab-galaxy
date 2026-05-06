"""Rebuild FAISS vector index from existing Neo4j data."""

import asyncio
import os

os.environ.setdefault("NEO4J_URI", "bolt://neo4j:7687")
os.environ.setdefault("NEO4J_USER", "neo4j")
os.environ.setdefault("NEO4J_PASSWORD", os.environ.get("NEO4J_PASSWORD", ""))
os.environ.setdefault("FAISS_INDEX_PATH", "/app/data/faiss_index")
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("FASTEMBED_CACHE_PATH", "/app/data/fastembed_cache")

from neo4j import AsyncGraphDatabase
from app.services.vector import build_index
from app.core.connections import get_neo4j_driver

VALID_LABELS = {"Experiment", "Equipment", "Theory", "Consumable", "Tool", "Concept"}


async def rebuild():
    driver = get_neo4j_driver()
    texts = []
    ids = []

    async with driver.session() as session:
        result = await session.run("""
            MATCH (n)
            WHERE n.id IS NOT NULL
            RETURN n.id AS id, n.name AS name, labels(n) AS labels, n.summary AS summary
        """)
        async for r in result:
            nid = r["id"]
            name = r["name"] or ""
            summary = r["summary"] or ""
            lbls = r["labels"]
            ntype = next((l for l in lbls if l in VALID_LABELS), "Concept")
            texts.append(f"[{ntype}] {name} {summary}")
            ids.append(nid)

    print(f"Found {len(texts)} nodes in Neo4j")

    if not texts:
        print("No nodes to index!")
        return

    await build_index(texts, ids)
    print(f"Built FAISS index with {len(texts)} entries")

    await driver.close()


if __name__ == "__main__":
    asyncio.run(rebuild())
