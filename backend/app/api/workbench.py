"""Workbench API — document tree, card stream, favorites."""

import json
import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Document, Favorite, User
from app.schemas.document import DocumentResponse
from app.api.documents import _can_view_document

router = APIRouter(prefix="/workbench", tags=["workbench"])


# ========== Document Tree ==========

@router.get("/tree")
async def document_tree(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return documents grouped by year > type for the tree sidebar."""
    rows = (
        await db.execute(
            select(Document)
            .where(Document.uploaded_by == current_user.id)
            .order_by(Document.experiment_year.desc(), Document.experiment_type, Document.title)
        )
    ).scalars().all()

    tree: dict = {}
    for doc in rows:
        year = str(doc.experiment_year) if doc.experiment_year else "未知年份"
        exp_type = doc.experiment_type or "未分类"

        if year not in tree:
            tree[year] = {}
        if exp_type not in tree[year]:
            tree[year][exp_type] = []

        tree[year][exp_type].append({
            "id": str(doc.id),
            "title": doc.title,
            "file_type": doc.file_type,
            "status": doc.status,
        })

    return tree


# ========== Card Stream ==========

def _build_card(doc: Document, fav_set: set[str]) -> dict:
    """Build a card-stream entry from a Document row."""
    extraction = None
    if doc.extraction_result:
        try:
            extraction = json.loads(doc.extraction_result)
        except json.JSONDecodeError:
            pass

    # Build AI summary from extraction
    ai_summary = ""
    if extraction:
        entities = extraction.get("entities", [])
        relations = extraction.get("relations", [])
        type_counts = defaultdict(int)
        for e in entities:
            type_counts[e.get("type", "Concept")] += 1
        parts = [f"发现 {len(entities)} 个实体"]
        for t, c in sorted(type_counts.items()):
            parts.append(f"{t}({c})")
        parts.append(f"{len(relations)} 条关系")
        ai_summary = "、".join(parts)

    return {
        "id": str(doc.id),
        "title": doc.title,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
        "status": doc.status,
        "experiment_year": doc.experiment_year,
        "experiment_type": doc.experiment_type,
        "subjects": doc.subjects,
        "privacy": doc.privacy,
        "ai_summary": ai_summary,
        "entities": extraction.get("entities", []) if extraction else [],
        "relations": extraction.get("relations", []) if extraction else [],
        "extraction_result": extraction,
        "is_favorite": str(doc.id) in fav_set,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


@router.get("/cards")
async def card_stream(
    year: int | None = Query(None),
    experiment_type: str | None = Query(None),
    favorite_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    include_doc: uuid.UUID | None = Query(None, description="Ensure this doc appears in the stream (e.g. when opening a shared node's source doc that isn't owned by the user)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return document cards with AI summary and entity cards."""
    base = select(Document).where(Document.uploaded_by == current_user.id)

    if year is not None:
        base = base.where(Document.experiment_year == year)
    if experiment_type:
        base = base.where(Document.experiment_type == experiment_type)
    if favorite_only:
        fav_sub = select(Favorite.document_id).where(Favorite.user_id == current_user.id)
        base = base.where(Document.id.in_(fav_sub))

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0

    rows = (
        await db.execute(
            base.order_by(Document.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    ).scalars().all()

    # Optionally include a shared/guest document (e.g. the source doc of a node
    # that was @-mentioned) so the workbench can open it even though it isn't
    # owned by the user. Only completed docs are includable (view permission).
    guest_doc = None
    include_count = 0
    if include_doc is not None:
        guest_doc = (await db.execute(select(Document).where(Document.id == include_doc))).scalar_one_or_none()
        if guest_doc and _can_view_document(guest_doc, current_user) and not any(d.id == guest_doc.id for d in rows):
            include_count = 1

    # Get user's favorites for these docs
    doc_ids = [doc.id for doc in rows]
    if guest_doc and include_count:
        doc_ids.append(guest_doc.id)
    fav_rows = (
        await db.execute(select(Favorite.document_id).where(Favorite.user_id == current_user.id, Favorite.document_id.in_(doc_ids)))
    ).scalars().all()
    fav_set = set(str(f) for f in fav_rows)

    cards = [_build_card(doc, fav_set) for doc in rows]
    if guest_doc and include_count:
        cards.insert(0, _build_card(guest_doc, fav_set))

    return {"total": total + include_count, "cards": cards}


# ========== Favorites ==========

@router.post("/favorites/{doc_id}", status_code=201)
async def toggle_favorite(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle favorite on/off for a document."""
    existing = (
        await db.execute(
            select(Favorite).where(
                Favorite.user_id == current_user.id,
                Favorite.document_id == doc_id,
            )
        )
    ).scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()
        return {"is_favorite": False}
    else:
        fav = Favorite(user_id=current_user.id, document_id=doc_id)
        db.add(fav)
        await db.commit()
        return {"is_favorite": True}


@router.get("/favorites")
async def list_favorites(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return list of favorited document IDs."""
    rows = (
        await db.execute(
            select(Favorite.document_id).where(Favorite.user_id == current_user.id)
        )
    ).scalars().all()
    return {"favorites": [str(r) for r in rows]}
