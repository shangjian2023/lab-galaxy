"""Vector index service — embedding & FAISS similarity search."""

import asyncio
import hashlib
import json
import os
from pathlib import Path

from app.core.config import settings

_id_map_path = Path(settings.FAISS_INDEX_PATH + ".idmap.json")
_id_map: dict[str, int] = {}
_int_to_uuid: dict[int, str] = {}


def _load_id_map():
    global _id_map, _int_to_uuid
    if _id_map_path.exists():
        try:
            data = json.loads(_id_map_path.read_text())
            _id_map = data
            _int_to_uuid = {v: k for k, v in data.items()}
        except (json.JSONDecodeError, ValueError):
            _id_map = {}
            _int_to_uuid = {}


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


def _get_embedding_model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(settings.EMBEDDING_MODEL)


def _ensure_dir():
    Path(settings.FAISS_INDEX_PATH).parent.mkdir(parents=True, exist_ok=True)


# --- Sync internal functions (called via to_thread) ---

def _build_index_sync(texts: list[str], ids: list[str]):
    import faiss
    import numpy as np

    model = _get_embedding_model()
    embeddings = model.encode(texts, normalize_embeddings=True)
    dim = embeddings.shape[1]

    index = faiss.IndexIDMap(faiss.IndexFlatIP(dim))
    index.add_with_ids(embeddings.astype("float32"), np.array([_to_int_id(i) for i in ids]))

    _ensure_dir()
    faiss.write_index(index, settings.FAISS_INDEX_PATH)


def _add_to_index_sync(texts: list[str], ids: list[str]):
    import faiss
    import numpy as np

    model = _get_embedding_model()
    embeddings = model.encode(texts, normalize_embeddings=True).astype("float32")
    int_ids = np.array([_to_int_id(i) for i in ids])

    _ensure_dir()

    if os.path.exists(settings.FAISS_INDEX_PATH):
        index = faiss.read_index(settings.FAISS_INDEX_PATH)
        index.add_with_ids(embeddings, int_ids)
    else:
        dim = embeddings.shape[1]
        index = faiss.IndexIDMap(faiss.IndexFlatIP(dim))
        index.add_with_ids(embeddings, int_ids)

    faiss.write_index(index, settings.FAISS_INDEX_PATH)


def _search_sync(query: str, top_k: int) -> list[tuple[str, float]]:
    import faiss

    if not os.path.exists(settings.FAISS_INDEX_PATH):
        return []

    index = faiss.read_index(settings.FAISS_INDEX_PATH)
    model = _get_embedding_model()
    q_emb = model.encode([query], normalize_embeddings=True).astype("float32")

    scores, ids = index.search(q_emb, top_k)
    return [
        (_from_int_id(int(idx)), float(score))
        for idx, score in zip(ids[0], scores[0])
        if idx >= 0
    ]


# --- Public async wrappers ---

async def build_index(texts: list[str], ids: list[str]) -> None:
    _load_id_map()
    await asyncio.to_thread(_build_index_sync, texts, ids)
    _save_id_map()


async def add_to_index(texts: list[str], ids: list[str]) -> None:
    _load_id_map()
    await asyncio.to_thread(_add_to_index_sync, texts, ids)
    _save_id_map()


async def search(query: str, top_k: int = 5) -> list[tuple[str, float]]:
    _load_id_map()
    return await asyncio.to_thread(_search_sync, query, top_k)
