"""Vector index service — embedding & FAISS similarity search."""

import asyncio
import hashlib
import json
import os
import threading
from pathlib import Path

import numpy as np

from app.core.config import settings

_id_map_path = Path(settings.FAISS_INDEX_PATH + ".idmap.json")
_id_map: dict[str, int] = {}
_int_to_uuid: dict[int, str] = {}

_lock = asyncio.Lock()
_faiss_index = None  # in-memory cache of the FAISS index
_loaded = False


def _load_id_map():
    global _id_map, _int_to_uuid, _loaded
    if _loaded:
        return
    if _id_map_path.exists():
        try:
            data = json.loads(_id_map_path.read_text())
            _id_map = data
            _int_to_uuid = {v: k for k, v in data.items()}
        except (json.JSONDecodeError, ValueError):
            _id_map = {}
            _int_to_uuid = {}
    _loaded = True


def _save_id_map():
    _id_map_path.parent.mkdir(parents=True, exist_ok=True)
    _id_map_path.write_text(json.dumps(_id_map))


def _to_int_id(uuid_str: str) -> int:
    if uuid_str in _id_map:
        return _id_map[uuid_str]
    int_id = int(hashlib.md5(uuid_str.encode()).hexdigest()[:15], 16)
    _id_map[uuid_str] = int_id
    _int_to_uuid[int_id] = uuid_str
    return int_id


def _from_int_id(int_id: int) -> str:
    return _int_to_uuid.get(int_id, str(int_id))


_cached_model = None
_model_lock = threading.Lock()


def _get_embedding_model():
    global _cached_model
    if _cached_model is not None:
        return _cached_model
    with _model_lock:
        if _cached_model is not None:
            return _cached_model
        os.environ.setdefault("HF_ENDPOINT", settings.HF_ENDPOINT)
        from fastembed import TextEmbedding
        _cached_model = TextEmbedding(model_name=settings.EMBEDDING_MODEL)
        return _cached_model


def _ensure_dir():
    Path(settings.FAISS_INDEX_PATH).parent.mkdir(parents=True, exist_ok=True)


async def rebuild_index_from_neo4j():
    """Rebuild FAISS index from Neo4j on startup if index is missing."""
    import os
    index_path = Path(settings.FAISS_INDEX_PATH)
    if index_path.exists():
        return  # Index already on disk, skip rebuild

    try:
        from neo4j import AsyncGraphDatabase
    except ImportError:
        return

    valid_labels = {"Experiment", "Equipment", "Theory", "Consumable", "Tool", "Concept"}

    driver = AsyncGraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
    )
    try:
        texts, ids = [], []
        async with driver.session() as session:
            result = await session.run(
                "MATCH (n) WHERE n.id IS NOT NULL "
                "RETURN n.id AS id, n.name AS name, labels(n) AS labels, n.summary AS summary"
            )
            async for r in result:
                nid = r["id"]
                name = r["name"] or ""
                summary = r["summary"] or ""
                lbls = r["labels"]
                ntype = next((l for l in lbls if l in valid_labels), "Concept")
                texts.append(f"[{ntype}] {name} {summary}")
                ids.append(nid)

        if texts:
            await build_index(texts, ids)
            import logging
            logging.getLogger(__name__).info(f"Rebuilt FAISS index with {len(texts)} entries from Neo4j")
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"FAISS index rebuild from Neo4j failed: {e}")
    finally:
        await driver.close()


def _load_faiss_index():
    """Load FAISS index into memory (once, cached)."""
    global _faiss_index
    if _faiss_index is not None:
        return _faiss_index
    import faiss
    if os.path.exists(settings.FAISS_INDEX_PATH):
        _faiss_index = faiss.read_index(settings.FAISS_INDEX_PATH)
    return _faiss_index


def _flush_index():
    """Write the in-memory FAISS index to disk."""
    global _faiss_index
    if _faiss_index is None:
        return
    import faiss
    _ensure_dir()
    faiss.write_index(_faiss_index, settings.FAISS_INDEX_PATH)


# --- Sync internal functions (called via to_thread) ---

def _build_index_sync(texts: list[str], ids: list[str]):
    import faiss
    import numpy as np

    global _faiss_index

    model = _get_embedding_model()
    embeddings = np.stack(list(model.embed(texts)))
    dim = embeddings.shape[1]

    _faiss_index = faiss.IndexIDMap(faiss.IndexFlatIP(dim))
    _faiss_index.add_with_ids(embeddings.astype("float32"), np.array([_to_int_id(i) for i in ids]))

    _flush_index()


def _add_to_index_sync(texts: list[str], ids: list[str]):
    import faiss
    import numpy as np

    global _faiss_index

    model = _get_embedding_model()
    embeddings = np.stack(list(model.embed(texts))).astype("float32")
    int_ids = np.array([_to_int_id(i) for i in ids])

    _load_faiss_index()

    if _faiss_index is None:
        dim = embeddings.shape[1]
        _faiss_index = faiss.IndexIDMap(faiss.IndexFlatIP(dim))

    # Remove existing IDs before re-adding to avoid silent drops
    try:
        _faiss_index.remove_ids(int_ids)
    except Exception:
        pass

    _faiss_index.add_with_ids(embeddings, int_ids)
    _flush_index()


def _search_sync(query: str, top_k: int) -> list[tuple[str, float]]:
    import numpy as np

    _load_faiss_index()
    if _faiss_index is None:
        return []

    model = _get_embedding_model()
    q_emb = np.stack(list(model.embed([query]))).astype("float32")

    scores, ids = _faiss_index.search(q_emb, top_k)
    return [
        (_from_int_id(int(idx)), float(score))
        for idx, score in zip(ids[0], scores[0])
        if idx >= 0
    ]


# --- Public async wrappers ---

async def build_index(texts: list[str], ids: list[str]) -> None:
    async with _lock:
        _load_id_map()
        await asyncio.to_thread(_build_index_sync, texts, ids)
        _save_id_map()


async def add_to_index(texts: list[str], ids: list[str]) -> None:
    async with _lock:
        _load_id_map()
        await asyncio.to_thread(_add_to_index_sync, texts, ids)
        _save_id_map()


async def search(query: str, top_k: int = 5) -> list[tuple[str, float]]:
    async with _lock:
        _load_id_map()
        return await asyncio.to_thread(_search_sync, query, top_k)
