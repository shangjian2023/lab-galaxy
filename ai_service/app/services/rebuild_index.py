"""Rebuild FAISS vector index from existing Neo4j data."""

import asyncio
from neo4j import AsyncGraphDatabase
from app.core.config import settings
from app.services.vector import build_index

VALID_LABELS = settings.VALID_LABELS


async def rebuild():
    driver = AsyncGraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
    )
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
