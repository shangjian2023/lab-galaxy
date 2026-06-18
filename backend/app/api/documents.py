"""Document upload & management routes."""

import json
import logging
import uuid
from difflib import SequenceMatcher
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_current_user_from_header_or_query
from app.models.models import Document, User, UserAchievement
from app.schemas.document import (
    BatchUploadResponse,
    DocumentListResponse,
    DocumentResponse,
    DocumentUploadMeta,
    IngestConfirmRequest,
)
from app.services.storage import upload_file
from app.services.usage import check_upload_quota, increment_upload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])


def _can_view_document(doc: Document, current_user: User) -> bool:
    """Permission rule for *viewing* a document (status / download).

    Direction: a node @-mentioned in a post/chat is viewable by any logged-in
    user, along with its source document — so a completed document is visible to
    everyone. Non-completed (parsing / pending_review / draft / error) docs are
    still owner+admin only, since they aren't shared yet. Write operations
    (reprocess / delete / confirm) always require owner+admin regardless.
    """
    if doc.uploaded_by == current_user.id or current_user.role == "admin":
        return True
    return doc.status == "completed"

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
    visible_teams: list[str] | None = None,
) -> DocumentUploadMeta:
    if privacy not in VALID_PRIVACY:
        raise HTTPException(status_code=400, detail="privacy 必须是 public、team 或 private")
    return DocumentUploadMeta(
        experiment_year=experiment_year,
        experiment_type=experiment_type,
        subjects=_parse_subjects(subjects),
        privacy=privacy,
        visible_teams=visible_teams,
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


def _compute_similarity(a: str, b: str) -> tuple[bool, float]:
    """Check if two names are similar. Returns (is_similar, ratio)."""
    a = a.strip()
    b = b.strip()
    if not a or not b:
        return False, 0.0
    if a == b:
        return True, 1.0
    al, bl = a.lower(), b.lower()
    if al == bl:
        return True, 1.0
    ratio = SequenceMatcher(None, al, bl).ratio()
    return ratio >= SIMILARITY_THRESHOLD, ratio


async def _check_duplicate_experiments(
    entities: list[dict], user_id: str
) -> list[dict]:
    """Check extracted Experiment entities against existing Neo4j nodes for this user.
    Returns list of duplicate warnings: [{name, existing_name, existing_id, similarity}]
    """
    experiment_names = [
        e.get("name", "").strip()
        for e in entities
        if isinstance(e, dict) and e.get("type") == "Experiment"
    ]
    if not experiment_names:
        return []

    from app.services.admin_graph import _get_driver

    driver = _get_driver()
    existing_experiments: list[dict] = []
    try:
        from app.core.database import async_session

        # Get user's document IDs to filter experiments
        user_doc_ids: list[str] = []
        async with async_session() as db:
            rows = (
                await db.execute(
                    select(Document.id).where(Document.uploaded_by == user_id)
                )
            ).scalars().all()
            user_doc_ids = [str(d) for d in rows]

        # Filter out empty strings before passing to Neo4j
        valid_doc_ids = [uid for uid in user_doc_ids if uid.strip()]

        async with driver.session() as session:
            if valid_doc_ids:
                result = await session.run(
                    "MATCH (e:Experiment) WHERE e.document_id IN $doc_ids "
                    "RETURN e.id AS id, e.name AS name",
                    doc_ids=valid_doc_ids,
                )
            else:
                result = await session.run(
                    "MATCH (e:Experiment) WHERE e.document_id IS NULL "
                    "RETURN e.id AS id, e.name AS name"
                )
            async for record in result:
                existing_experiments.append({"id": record["id"], "name": record["name"] or ""})
    except Exception as e:
        logger.warning(f"Failed to query existing experiments for duplicate check: {e}")
        return []

    warnings = []
    for name in experiment_names:
        for existing in existing_experiments:
            similar, ratio = _compute_similarity(name, existing["name"])
            if similar:
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
        achievements = result.get("achievements", [])

        # Store achievements
        if achievements:
            from app.core.database import async_session
            async with async_session() as ach_db:
                doc_owner = (await ach_db.execute(
                    select(Document.uploaded_by).where(Document.id == doc_id)
                )).scalar_one()
                for ach in achievements:
                    if not isinstance(ach, dict) or not ach.get("name"):
                        continue
                    ach_type = ach.get("type", "其他")
                    if ach_type not in ("论文", "专利", "获奖", "项目成果", "其他"):
                        ach_type = "其他"
                    ach_db.add(UserAchievement(
                        user_id=doc_owner,
                        document_id=doc_id,
                        name=ach["name"],
                        description=ach.get("description"),
                        achievement_type=ach_type,
                    ))
                await ach_db.commit()

        # Check for duplicate experiments
        from app.core.database import async_session as db_session
        doc_owner = ""
        async with db_session() as owner_db:
            owner_row = (await owner_db.execute(
                select(Document.uploaded_by).where(Document.id == doc_id)
            )).scalar_one_or_none()
            if owner_row:
                doc_owner = str(owner_row)
        warnings = await _check_duplicate_experiments(entities, doc_owner)

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
            graph_write_error = None
            try:
                await _write_graph_for_doc(doc_id, entities, relations)
            except Exception as e:
                # Don't silently swallow — record the failure so users/admins can see
                # which documents have extraction but no graph data, and reprocess them.
                logger.warning(f"Graph write failed for doc {doc_id}: {e}", exc_info=True)
                graph_write_error = f"知识图谱写入失败：{e}"

            async with async_session() as db:
                doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
                if doc:
                    doc.status = "completed"
                    doc.extraction_result = json.dumps(result, ensure_ascii=False)
                    # Surface graph-write failures instead of hiding them; the doc is
                    # still usable (extraction succeeded) but the graph will be empty.
                    doc.error_message = graph_write_error
                    # Award AI parse points to the doc owner (core loop). NOTE: a
                    # reprocess re-runs this path and re-awards — intentional tiny
                    # bonus on a rare owner action; not worth a DB flag to prevent.
                    owner = (await db.execute(select(User).where(User.id == doc.uploaded_by))).scalar_one_or_none()
                    if owner:
                        from app.services.points import award_points, POINTS_RULES
                        award_points(owner, db, POINTS_RULES["ai_parse_complete"], "AI 解析完成")
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
    privacy: str = Form("private"),
    visible_teams: str | None = Form(None),  # JSON array string
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    quota = await check_upload_quota(db, current_user)
    if not quota["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"今日上传次数已用完（{quota['limit']}/{quota['limit']}），请明天再试",
        )

    filename = file.filename or "unknown"
    content = await file.read()
    try:
        ext = _validate_file(filename, len(content))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    visible_teams_list = None
    if visible_teams:
        try:
            visible_teams_list = json.loads(visible_teams)
        except json.JSONDecodeError:
            pass

    meta = _parse_upload_meta(experiment_year, experiment_type, subjects, privacy, visible_teams_list)
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
        visible_teams=meta.visible_teams,
        uploaded_by=current_user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Award upload points (core contribution loop) — once per upload
    from app.services.points import award_points, POINTS_RULES
    award_points(current_user, db, POINTS_RULES["upload_doc"], "上传实验资料")
    await db.commit()

    if not quota["unlimited"]:
        await increment_upload(db, current_user.id)
        await db.commit()

    # Trigger AI processing in the background
    # Public uploads require admin approval — set to pending_review
    if meta.privacy == "public":
        doc.status = "pending_review"
        await db.commit()
        await db.refresh(doc)
        logger.info(f"Public doc {doc.id} set to pending_review, awaiting admin approval")
        return DocumentResponse.from_orm(doc)

    import asyncio
    task = asyncio.create_task(_process_single(str(doc.id), content, filename))
    task.add_done_callback(lambda t: t.exception() if not t.cancelled() and t.exception() else None)
    logger.info(f"Started background processing for document {doc.id}")

    return DocumentResponse.from_orm(doc)


@router.post("/upload-batch", response_model=BatchUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_batch(
    files: list[UploadFile] = File(...),
    experiment_year: int | None = Form(None),
    experiment_type: str | None = Form(None),
    subjects: str | None = Form(None),
    privacy: str = Form("private"),
    visible_teams: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    quota = await check_upload_quota(db, current_user)
    if not quota["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"今日上传次数已用完（{quota['limit']}/{quota['limit']}），请明天再试",
        )

    visible_teams_list = None
    if visible_teams:
        try:
            visible_teams_list = json.loads(visible_teams)
        except json.JSONDecodeError:
            pass

    meta = _parse_upload_meta(experiment_year, experiment_type, subjects, privacy, visible_teams_list)
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
                visible_teams=meta.visible_teams,
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

    # Award upload points per document (core contribution loop)
    from app.services.points import award_points, POINTS_RULES
    for _doc in docs:
        award_points(current_user, db, POINTS_RULES["upload_doc"], "上传实验资料")
    await db.commit()

    if not quota["unlimited"] and docs:
        await increment_upload(db, current_user.id)
        await db.commit()

    import asyncio

    # Public uploads require admin approval — only process private/team docs immediately
    docs_to_process = [
        (doc, content, filename)
        for doc, content, filename in pending_processing
        if doc.privacy != "public"
    ]
    docs_pending_review = [
        doc for doc, _, _ in pending_processing
        if doc.privacy == "public"
    ]

    # Set public docs to pending_review
    if docs_pending_review:
        for doc in docs_pending_review:
            doc.status = "pending_review"
        await db.commit()
        logger.info(f"Set {len(docs_pending_review)} public doc(s) to pending_review")

    # Process non-public documents with bounded concurrency
    semaphore = asyncio.Semaphore(3)

    async def process_with_semaphore(doc: Document, content: bytes, filename: str):
        async with semaphore:
            await _process_single(str(doc.id), content, filename)

    tasks = [
        process_with_semaphore(doc, content, filename)
        for doc, content, filename in docs_to_process
    ]
    task = asyncio.gather(*tasks, return_exceptions=True)

    def done_callback(t):
        for exc in t.exception() if t.exception() else []:
            if isinstance(exc, Exception):
                logger.error(f"Batch processing error: {exc}")

    task.add_done_callback(done_callback)
    logger.info(f"Started background processing queue for {len(pending_processing)} document(s)")

    return BatchUploadResponse(
        documents=[DocumentResponse.from_orm(d) for d in docs],
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
    items = [DocumentResponse.from_orm(row) for row in rows]

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
    if not _can_view_document(doc, current_user):
        raise HTTPException(status_code=403, detail="无权访问此文档")

    return DocumentResponse.from_orm(doc)


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
        doc.extraction_result = json.dumps(extraction, ensure_ascii=False)
        await db.commit()
        await db.refresh(doc)
        return DocumentResponse.from_orm(doc)

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
    # Award AI parse points to the doc owner (core loop) — overwrite/coexist path
    from app.services.points import award_points, POINTS_RULES
    owner = (await db.execute(select(User).where(User.id == doc.uploaded_by))).scalar_one_or_none()
    if owner:
        award_points(owner, db, POINTS_RULES["ai_parse_complete"], "AI 解析完成")
    await db.commit()
    await db.refresh(doc)

    return DocumentResponse.from_orm(doc)


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
        file_size=doc.file_size, file_path=doc.file_path, status="parsing",
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

    # 1. Delete from MinIO (non-blocking with timeout)
    try:
        import asyncio
        from app.core.config import settings as _settings
        from app.services.storage import _get_client
        def _do_remove():
            c = _get_client()
            c.remove_object(_settings.MINIO_BUCKET, doc.file_path)
        await asyncio.wait_for(asyncio.to_thread(_do_remove), timeout=5)
    except Exception:
        pass  # MinIO file may already be gone or service unavailable

    # 2. Delete from Neo4j via AI service (short timeout)
    try:
        from app.services.ai_client import AI_SERVICE_URL
        import httpx
        async with httpx.AsyncClient(timeout=10) as hclient:
            await hclient.delete(f"{AI_SERVICE_URL}/graph/document/{doc_id}")
    except Exception:
        pass  # AI service may be down or slow; DB delete still proceeds

    # 3. Delete from PostgreSQL
    await db.delete(doc)
    await db.commit()


@router.get("/{doc_id}/download")
async def download_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_header_or_query),
):
    """Download the original document file from MinIO."""
    doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    if not _can_view_document(doc, current_user):
        raise HTTPException(status_code=403, detail="无权访问此文档")

    try:
        from app.services.storage import stream_file_content
        response, content_type, file_size = stream_file_content(doc.file_path)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="下载原始文档失败") from exc

    def read_and_close():
        try:
            while chunk := response.read(65536):
                yield chunk
        finally:
            response.close()
            response.release_conn()

    headers = {
        "Content-Disposition": f"inline; filename*=UTF-8''{quote(doc.title, safe='')}",
        "Content-Length": str(file_size),
    }
    return StreamingResponse(read_and_close(), media_type=content_type, headers=headers)
