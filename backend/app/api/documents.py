"""Document upload & management routes."""

import json
import logging
import uuid
from difflib import SequenceMatcher

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Document, User
from app.schemas.document import (
    BatchUploadResponse,
    DocumentListResponse,
    DocumentResponse,
    DocumentUploadMeta,
    IngestConfirmRequest,
)
from app.services.storage import upload_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".ppt", ".pptx"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
VALID_PRIVACY = {"public", "team", "private"}

SIMILARITY_THRESHOLD = 0.78


def _validate_file(filename: str, size: int):
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"不支持的文件类型: {ext}")
    if size > MAX_FILE_SIZE:
        raise ValueError("文件大小超过 50MB 限制")
    return ext.lstrip(".")


def _parse_subjects(subjects: str | None) -> list[str] | None:
    if not subjects:
        return None
    try:
        parsed = json.loads(subjects)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="subjects 必须是 JSON 字符串数组") from exc
    if parsed is None:
        return None
    if not isinstance(parsed, list) or any(not isinstance(item, str) for item in parsed):
        raise HTTPException(status_code=400, detail="subjects 必须是字符串数组")
    return parsed


def _parse_upload_meta(
    experiment_year: int | None,
    experiment_type: str | None,
    subjects: str | None,
    privacy: str,
) -> DocumentUploadMeta:
    if privacy not in VALID_PRIVACY:
        raise HTTPException(status_code=400, detail="privacy 必须是 public、team 或 private")
    return DocumentUploadMeta(
        experiment_year=experiment_year,
        experiment_type=experiment_type,
        subjects=_parse_subjects(subjects),
        privacy=privacy,
    )


async def _update_status(doc_id: str, status: str, error: str | None = None):
    """Update document status in its own session."""
    from app.core.database import async_session

    for attempt in range(3):
        try:
            async with async_session() as db:
                doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
                if doc:
                    doc.status = status
                    if error:
                        doc.error_message = error[:500]
                    await db.commit()
                return
        except Exception:
            import asyncio
            await asyncio.sleep(1 * (attempt + 1))


def _is_similar_name(a: str, b: str) -> bool:
    """Check if two experiment names are similar enough to be considered duplicates."""
    a = a.strip()
    b = b.strip()
    if not a or not b:
        return False
    if a == b:
        return True
    al, bl = a.lower(), b.lower()
    if al == bl:
        return True
    return SequenceMatcher(None, al, bl).ratio() >= SIMILARITY_THRESHOLD


async def _check_duplicate_experiments(
    entities: list[dict], user_id: str
) -> list[dict]:
    """Check extracted Experiment entities against existing Neo4j nodes.
    Returns list of duplicate warnings: [{name, existing_name, existing_id, similarity}]
    """
    experiment_names = [
        e.get("name", "").strip()
        for e in entities
        if isinstance(e, dict) and e.get("type") == "Experiment"
    ]
    if not experiment_names:
        return []

    from app.api.graph import _driver

    driver = _driver()
    existing_experiments: list[dict] = []
    try:
        async with driver.session() as session:
            result = await session.run("MATCH (e:Experiment) RETURN e.id AS id, e.name AS name")
            async for record in result:
                existing_experiments.append({"id": record["id"], "name": record["name"] or ""})
    except Exception as e:
        logger.warning(f"Failed to query existing experiments for duplicate check: {e}")
        return []

    warnings = []
    for name in experiment_names:
        for existing in existing_experiments:
            if _is_similar_name(name, existing["name"]):
                ratio = SequenceMatcher(None, name.lower(), existing["name"].lower()).ratio()
                exact = name.strip() == existing["name"].strip()
                warnings.append({
                    "new_name": name,
                    "existing_name": existing["name"],
                    "existing_id": existing["id"],
                    "similarity": round(ratio, 3),
                    "is_exact": exact,
                })
    return warnings


async def _write_graph_for_doc(doc_id: str, entities: list[dict], relations: list[dict]):
    """Write entities/relations to Neo4j + FAISS via AI service."""
    from app.services.ai_client import write_to_graph
    await write_to_graph(doc_id, entities, relations)


async def _process_single(doc_id: str, file_data: bytes, filename: str):
    """Run AI processing with real-time status updates and duplicate detection."""
    from app.services.ai_client import trigger_processing

    try:
        # Phase 1: Parsing + Extraction (skip graph write for duplicate check)
        await _update_status(doc_id, "parsing")

        result = await trigger_processing(doc_id, filename, file_data, skip_graph=True)

        await _update_status(doc_id, "extracting")

        entities = result.get("entities", [])
        relations = result.get("relations", [])

        # Check for duplicate experiments
        warnings = await _check_duplicate_experiments(entities, "")

        from app.core.database import async_session

        if warnings:
            # Store result and wait for user confirmation
            async with async_session() as db:
                doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
                if doc:
                    result["duplicate_warnings"] = warnings
                    doc.extraction_result = json.dumps(result, ensure_ascii=False)
                    doc.duplicate_info = json.dumps(warnings, ensure_ascii=False)
                    doc.status = "awaiting_confirmation"
                    doc.error_message = None
                    await db.commit()
            logger.info(f"Doc {doc_id} awaiting confirmation for {len(warnings)} duplicate(s)")
        else:
            # No duplicates — write graph and mark completed
            try:
                await _write_graph_for_doc(doc_id, entities, relations)
            except Exception as e:
                logger.warning(f"Graph write failed for doc {doc_id} (non-fatal): {e}")

            async with async_session() as db:
                doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
                if doc:
                    doc.status = "completed"
                    doc.extraction_result = json.dumps(result, ensure_ascii=False)
                    doc.error_message = None
                    await db.commit()

    except Exception as e:
        logger.error(f"Processing failed for doc {doc_id}: {e}")
        await _update_status(doc_id, "failed", str(e))


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    experiment_year: int | None = Form(None),
    experiment_type: str | None = Form(None),
    subjects: str | None = Form(None),  # JSON array string
    privacy: str = Form("public"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filename = file.filename or "unknown"
    content = await file.read()
    try:
        ext = _validate_file(filename, len(content))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    meta = _parse_upload_meta(experiment_year, experiment_type, subjects, privacy)
    object_key = upload_file(content, filename, file.content_type or "application/octet-stream")

    doc = Document(
        title=filename,
        file_path=object_key,
        file_type=ext,
        file_size=len(content),
        status="uploaded",
        experiment_year=meta.experiment_year,
        experiment_type=meta.experiment_type,
        subjects=meta.subjects,
        privacy=meta.privacy,
        uploaded_by=current_user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Trigger AI processing in the background
    import asyncio
    task = asyncio.create_task(_process_single(str(doc.id), content, filename))
    task.add_done_callback(lambda t: t.exception() if not t.cancelled() and t.exception() else None)
    logger.info(f"Started background processing for document {doc.id}")

    return doc


@router.post("/upload-batch", response_model=BatchUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_batch(
    files: list[UploadFile] = File(...),
    experiment_year: int | None = Form(None),
    experiment_type: str | None = Form(None),
    subjects: str | None = Form(None),
    privacy: str = Form("public"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meta = _parse_upload_meta(experiment_year, experiment_type, subjects, privacy)
    docs: list[Document] = []
    pending_processing: list[tuple[Document, bytes, str]] = []
    errors: list[dict] = []

    for file in files:
        filename = file.filename or "unknown"
        content = await file.read()
        try:
            ext = _validate_file(filename, len(content))
            object_key = upload_file(content, filename, file.content_type or "application/octet-stream")

            doc = Document(
                title=filename,
                file_path=object_key,
                file_type=ext,
                file_size=len(content),
                status="uploaded",
                experiment_year=meta.experiment_year,
                experiment_type=meta.experiment_type,
                subjects=meta.subjects,
                privacy=meta.privacy,
                uploaded_by=current_user.id,
            )
            db.add(doc)
            docs.append(doc)
            pending_processing.append((doc, content, filename))
        except ValueError as e:
            errors.append({"filename": filename, "error": str(e)})

    await db.commit()
    for doc in docs:
        await db.refresh(doc)

    import asyncio
    for doc, content, filename in pending_processing:
        task = asyncio.create_task(_process_single(str(doc.id), content, filename))
        task.add_done_callback(lambda t: t.exception() if not t.cancelled() and t.exception() else None)
        logger.info(f"Started background processing for document {doc.id}")

    return BatchUploadResponse(
        documents=docs,
        errors=errors,
    )


@router.get("/list", response_model=DocumentListResponse)
async def list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base = select(Document).where(Document.uploaded_by == current_user.id)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0

    rows = (
        await db.execute(
            base.order_by(Document.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    ).scalars().all()

    # Parse extraction_result JSON for each row
    items = []
    for row in rows:
        er = None
        if row.extraction_result:
            try:
                er = json.loads(row.extraction_result) if isinstance(row.extraction_result, str) else row.extraction_result
            except (json.JSONDecodeError, TypeError):
                er = None
        di = None
        if row.duplicate_info:
            try:
                di = json.loads(row.duplicate_info) if isinstance(row.duplicate_info, str) else row.duplicate_info
            except (json.JSONDecodeError, TypeError):
                di = None
        items.append(DocumentResponse(
            id=str(row.id), title=row.title, file_type=row.file_type,
            file_size=row.file_size, status=row.status,
            experiment_year=row.experiment_year, experiment_type=row.experiment_type,
            subjects=row.subjects, privacy=row.privacy,
            extraction_result=er, error_message=row.error_message,
            duplicate_info=di,
            uploaded_by=str(row.uploaded_by),
            created_at=row.created_at.isoformat() if row.created_at else None,
        ))

    return DocumentListResponse(total=total, items=items)


@router.get("/{doc_id}/status", response_model=DocumentResponse)
async def document_status(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    if doc.uploaded_by != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="无权访问此文档")

    # Parse extraction_result JSON before validation
    data = {
        "id": str(doc.id),
        "title": doc.title,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
        "status": doc.status,
        "experiment_year": doc.experiment_year,
        "experiment_type": doc.experiment_type,
        "subjects": doc.subjects,
        "privacy": doc.privacy,
        "extraction_result": None,
        "error_message": doc.error_message,
        "uploaded_by": str(doc.uploaded_by),
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }
    if doc.extraction_result:
        try:
            data["extraction_result"] = json.loads(doc.extraction_result) if isinstance(doc.extraction_result, str) else doc.extraction_result
        except (json.JSONDecodeError, TypeError):
            data["extraction_result"] = None
    # Include duplicate_info for frontend
    if doc.duplicate_info:
        try:
            data["duplicate_info"] = json.loads(doc.duplicate_info) if isinstance(doc.duplicate_info, str) else doc.duplicate_info
        except (json.JSONDecodeError, TypeError):
            data["duplicate_info"] = None
    return DocumentResponse(**data)


@router.post("/{doc_id}/confirm-ingest", response_model=DocumentResponse)
async def confirm_ingest(
    doc_id: uuid.UUID,
    body: IngestConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Confirm how to handle duplicate experiment detection: overwrite, coexist, or cancel."""
    doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    if doc.uploaded_by != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="无权操作此文档")
    if doc.status != "awaiting_confirmation":
        raise HTTPException(status_code=400, detail="该文档不处于待确认状态")

    extraction = None
    if doc.extraction_result:
        try:
            extraction = json.loads(doc.extraction_result) if isinstance(doc.extraction_result, str) else doc.extraction_result
        except (json.JSONDecodeError, TypeError):
            extraction = None

    if not extraction or "entities" not in extraction:
        doc.status = "failed"
        doc.error_message = "无法读取抽取结果"
        await db.commit()
        raise HTTPException(status_code=500, detail="无法读取抽取结果")

    entities = extraction.get("entities", [])
    relations = extraction.get("relations", [])

    if body.action == "cancel":
        doc.status = "completed"
        doc.duplicate_info = None
        doc.error_message = None
        # Remove duplicate_warnings from extraction_result
        extraction.pop("duplicate_warnings", None)
        doc.extraction_result = json.dumps(extraction, ensure_ascii=False)
        await db.commit()
        return DocumentResponse(
            id=str(doc.id), title=doc.title, file_type=doc.file_type,
            file_size=doc.file_size, status="completed",
            experiment_year=doc.experiment_year, experiment_type=doc.experiment_type,
            subjects=doc.subjects, privacy=doc.privacy,
            extraction_result=extraction, error_message=None,
            uploaded_by=str(doc.uploaded_by),
            created_at=doc.created_at.isoformat() if doc.created_at else None,
        )

    if body.action == "overwrite":
        # Delete existing duplicate experiment nodes from Neo4j
        duplicate_info = []
        if doc.duplicate_info:
            try:
                duplicate_info = json.loads(doc.duplicate_info) if isinstance(doc.duplicate_info, str) else doc.duplicate_info
            except (json.JSONDecodeError, TypeError):
                pass
        for dup in duplicate_info:
            existing_id = dup.get("existing_id")
            if existing_id:
                try:
                    from app.api.graph import _driver
                    driver = _driver()
                    async with driver.session() as session:
                        await session.run("MATCH (n {id: $id}) DETACH DELETE n", id=existing_id)
                except Exception as e:
                    logger.warning(f"Failed to delete existing node {existing_id}: {e}")

    # For both "overwrite" and "coexist": write to graph
    if body.action in ("overwrite", "coexist"):
        try:
            await _write_graph_for_doc(str(doc.id), entities, relations)
        except Exception as e:
            logger.warning(f"Graph write failed for doc {doc_id} during confirm: {e}")

    doc.status = "completed"
    doc.duplicate_info = None
    doc.error_message = None
    extraction.pop("duplicate_warnings", None)
    doc.extraction_result = json.dumps(extraction, ensure_ascii=False)
    await db.commit()

    return DocumentResponse(
        id=str(doc.id), title=doc.title, file_type=doc.file_type,
        file_size=doc.file_size, status="completed",
        experiment_year=doc.experiment_year, experiment_type=doc.experiment_type,
        subjects=doc.subjects, privacy=doc.privacy,
        extraction_result=extraction, error_message=None,
        uploaded_by=str(doc.uploaded_by),
        created_at=doc.created_at.isoformat() if doc.created_at else None,
    )


@router.post("/{doc_id}/reprocess", response_model=DocumentResponse)
async def reprocess_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-trigger AI processing for a document."""
    doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    if doc.uploaded_by != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="无权操作此文档")

    # Download file from MinIO
    from app.services.storage import get_file_url
    import httpx

    file_url = get_file_url(doc.file_path)
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(file_url)
            resp.raise_for_status()
            file_data = resp.content
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="下载原始文档失败，无法重新处理") from exc

    doc.status = "parsing"
    doc.error_message = None
    doc.duplicate_info = None
    await db.commit()

    import asyncio
    asyncio.create_task(_process_single(str(doc.id), file_data, doc.title))

    return DocumentResponse(
        id=str(doc.id), title=doc.title, file_type=doc.file_type,
        file_size=doc.file_size, status="parsing",
        experiment_year=doc.experiment_year, experiment_type=doc.experiment_type,
        subjects=doc.subjects, privacy=doc.privacy,
        extraction_result=None, error_message=None, duplicate_info=None,
        uploaded_by=str(doc.uploaded_by),
        created_at=doc.created_at.isoformat() if doc.created_at else None,
    )


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a document and all associated data."""
    doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    if doc.uploaded_by != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="无权删除此文档")

    # 1. Delete from MinIO
    try:
        from app.services.storage import _get_client
        client = _get_client()
        client.remove_object("documents", doc.file_path)
    except Exception:
        pass  # MinIO file may already be gone

    # 2. Delete from Neo4j (entities & relations for this document)
    try:
        from app.services.ai_client import AI_SERVICE_URL
        import httpx
        async with httpx.AsyncClient(timeout=30) as client:
            await client.delete(f"{AI_SERVICE_URL}/graph/document/{doc_id}")
    except Exception:
        pass  # AI service may be down

    # 3. Delete from PostgreSQL
    await db.delete(doc)
    await db.commit()
