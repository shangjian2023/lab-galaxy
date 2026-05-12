"""Admin routes — manage users, documents, knowledge graph."""

import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.core.security import hash_password
from app.models.models import Document, Favorite, PointsLog, Template, TemplateComment, TemplateLike, User
from app.schemas.document import (
    AdminDocumentUpdate,
    DocumentListResponse,
    DocumentResponse,
    GraphDataResponse,
    GraphNodeCreate,
    GraphNodeResponse,
    GraphNodeUpdate,
    GraphRelationCreate,
    GraphRelationResponse,
    GraphRelationUpdate,
)
from app.schemas.user import AdminPointsAdjust, AdminUserCreate, AdminUserUpdate, UserProfile
from pydantic import BaseModel as PydanticBaseModel
from app.services.admin_graph import (
    create_node,
    create_relation,
    delete_node,
    delete_relation,
    get_node,
    list_nodes,
    list_relations,
    update_node,
    update_relation,
)
from app.api.templates import calc_level
from app.services.points import LEVEL_CONFIG

logger = logging.getLogger(__name__)

MAX_LEVEL = len(LEVEL_CONFIG)

router = APIRouter(prefix="/admin", tags=["admin"])


class UserListResponse(PydanticBaseModel):
    total: int
    items: list[UserProfile]


@router.get("/users", response_model=UserListResponse)
async def admin_list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    role: str | None = Query(None),
    is_active: bool | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    base = select(User)
    if search:
        base = base.where(User.username.ilike(f"%{search}%") | User.email.ilike(f"%{search}%"))
    if role:
        base = base.where(User.role == role)
    if is_active is not None:
        base = base.where(User.is_active == is_active)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (
        await db.execute(base.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()
    return UserListResponse(total=total, items=rows)


@router.patch("/users/{user_id}", response_model=UserProfile)
async def admin_update_user(
    user_id: uuid.UUID,
    body: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if body.nickname is not None:
        user.nickname = body.nickname
    if body.avatar is not None:
        user.avatar = body.avatar
    if body.role is not None:
        user.role = body.role
    if body.level is not None:
        if body.level < 1 or body.level > MAX_LEVEL:
            raise HTTPException(status_code=400, detail=f"等级必须在 1~{MAX_LEVEL} 之间")
        user.level = body.level
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password is not None:
        user.hashed_password = hash_password(body.password)

    await db.commit()
    await db.refresh(user)
    return user


@router.post("/users", response_model=UserProfile, status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    body: AdminUserCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if (await db.execute(select(User).where(User.username == body.username))).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名已存在")
    if (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    # Auto-assign display_id
    from sqlalchemy import func as sql_func
    max_id = (await db.execute(select(sql_func.max(User.display_id)))).scalar()
    display_id = (max_id + 1) if max_id else 100001

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        nickname=body.nickname,
        role=body.role,
        display_id=display_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="不能删除管理员")

    # Delete related records in dependency order
    await db.execute(delete(PointsLog).where(PointsLog.user_id == user_id))
    await db.execute(delete(Favorite).where(Favorite.user_id == user_id))
    await db.execute(delete(TemplateLike).where(TemplateLike.user_id == user_id))
    await db.execute(delete(TemplateComment).where(TemplateComment.user_id == user_id))

    # Delete user's team memberships and messages
    from app.models.models import TeamMember, TeamMessage
    await db.execute(delete(TeamMessage).where(TeamMessage.user_id == user_id))
    await db.execute(delete(TeamMember).where(TeamMember.user_id == user_id))

    # Delete user's achievements and monthly usage
    from app.models.models import UserAchievement, MonthlyUsage
    await db.execute(delete(UserAchievement).where(UserAchievement.user_id == user_id))
    await db.execute(delete(MonthlyUsage).where(MonthlyUsage.user_id == user_id))

    # Delete forum posts and related records
    from app.models.models import ForumReply, ForumThread, ThreadBookmark, ThreadLike, ReplyLike
    user_thread_ids = (await db.execute(select(ForumThread.id).where(ForumThread.created_by == user_id))).scalars().all()
    if user_thread_ids:
        await db.execute(delete(ThreadBookmark).where(ThreadBookmark.thread_id.in_(user_thread_ids)))
        await db.execute(delete(ThreadLike).where(ThreadLike.thread_id.in_(user_thread_ids)))
        await db.execute(delete(ForumThread).where(ForumThread.created_by == user_id))
    user_reply_ids = (await db.execute(select(ForumReply.id).where(ForumReply.created_by == user_id))).scalars().all()
    if user_reply_ids:
        await db.execute(delete(ReplyLike).where(ReplyLike.reply_id.in_(user_reply_ids)))
        await db.execute(delete(ForumReply).where(ForumReply.created_by == user_id))

    # Delete templates owned by user (clean their likes/comments first)
    user_tpl_ids = (await db.execute(select(Template.id).where(Template.created_by == user_id))).scalars().all()
    if user_tpl_ids:
        await db.execute(delete(TemplateLike).where(TemplateLike.template_id.in_(user_tpl_ids)))
        await db.execute(delete(TemplateComment).where(TemplateComment.template_id.in_(user_tpl_ids)))
        await db.execute(delete(Template).where(Template.created_by == user_id))

    # Delete user's documents
    await db.execute(delete(Document).where(Document.uploaded_by == user_id))

    # Finally delete the user
    await db.delete(user)
    await db.commit()


@router.post("/users/{user_id}/points", response_model=UserProfile)
async def admin_adjust_points(
    user_id: uuid.UUID,
    body: AdminPointsAdjust,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    user.points += body.change
    user.level = calc_level(user.points)["level"]
    log = PointsLog(user_id=user.id, change=body.change, reason=body.reason)
    db.add(log)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/documents", response_model=DocumentListResponse)
async def admin_list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    base = select(Document).options(joinedload(Document.uploader))
    if status_filter:
        base = base.where(Document.status == status_filter)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (
        await db.execute(base.order_by(Document.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()

    items = []
    for row in rows:
        items.append(DocumentResponse.from_orm(row))
    return DocumentListResponse(total=total, items=items)


@router.patch("/documents/{doc_id}", response_model=DocumentResponse)
async def admin_update_document(
    doc_id: uuid.UUID,
    body: AdminDocumentUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    payload = body.model_dump(exclude_unset=True)
    if "title" in payload:
        doc.title = payload["title"]
    if "experiment_year" in payload:
        doc.experiment_year = payload["experiment_year"]
    if "experiment_type" in payload:
        doc.experiment_type = payload["experiment_type"]
    if "subjects" in payload:
        doc.subjects = payload["subjects"]
    if "privacy" in payload:
        doc.privacy = payload["privacy"]
    if "status" in payload:
        doc.status = payload["status"]
    if "extraction_result" in payload:
        doc.extraction_result = None if payload["extraction_result"] is None else json.dumps(payload["extraction_result"], ensure_ascii=False)
    if "error_message" in payload:
        doc.error_message = payload["error_message"]

    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.from_orm(doc)


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    # Delete from MinIO
    try:
        from app.services.storage import _get_client
        client = _get_client()
        client.remove_object("documents", doc.file_path)
    except Exception:
        pass

    # Delete from Neo4j
    try:
        from app.services.ai_client import AI_SERVICE_URL
        import httpx
        async with httpx.AsyncClient(timeout=30) as client:
            await client.delete(f"{AI_SERVICE_URL}/graph/document/{doc_id}")
    except Exception:
        pass

    await db.delete(doc)
    await db.commit()


@router.post("/documents/{doc_id}/approve", response_model=DocumentResponse)
async def admin_approve_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Approve a pending_review document and trigger AI processing."""
    doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    if doc.status != "pending_review":
        raise HTTPException(status_code=400, detail="该文档不处于待审核状态")

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
        raise HTTPException(status_code=502, detail="下载原始文档失败，无法审核") from exc

    doc.status = "parsing"
    await db.commit()

    # Trigger AI processing
    import asyncio
    from app.api.documents import _process_single
    task = asyncio.create_task(_process_single(str(doc.id), file_data, doc.title))
    task.add_done_callback(lambda t: t.exception() if not t.cancelled() and t.exception() else None)

    logger.info(f"Admin approved doc {doc_id}, started AI processing")

    await db.refresh(doc)
    return DocumentResponse.from_orm(doc)


@router.post("/documents/{doc_id}/reject", response_model=DocumentResponse)
async def admin_reject_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Reject a pending_review document, marking it as failed."""
    doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    if doc.status != "pending_review":
        raise HTTPException(status_code=400, detail="该文档不处于待审核状态")

    doc.status = "failed"
    doc.error_message = "管理员审核未通过"
    await db.commit()
    await db.refresh(doc)

    logger.info(f"Admin rejected doc {doc_id}")
    return DocumentResponse.from_orm(doc)


@router.get("/graph/nodes", response_model=list[GraphNodeResponse])
async def admin_list_graph_nodes(
    label: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    _admin: User = Depends(require_admin),
):
    return await list_nodes(label, skip, limit)


@router.post("/graph/nodes", response_model=GraphNodeResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_graph_node(
    body: GraphNodeCreate,
    _admin: User = Depends(require_admin),
):
    return await create_node(body.model_dump())


@router.get("/graph/nodes/{node_id}", response_model=GraphNodeResponse)
async def admin_get_graph_node(
    node_id: str,
    _admin: User = Depends(require_admin),
):
    node = await get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")
    return node


@router.patch("/graph/nodes/{node_id}", response_model=GraphNodeResponse)
async def admin_update_graph_node(
    node_id: str,
    body: GraphNodeUpdate,
    _admin: User = Depends(require_admin),
):
    existing = await get_node(node_id)
    if not existing:
        raise HTTPException(status_code=404, detail="节点不存在")
    await update_node(node_id, body.model_dump(exclude_none=True))
    return await get_node(node_id)


@router.delete("/graph/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_graph_node(
    node_id: str,
    _admin: User = Depends(require_admin),
):
    await delete_node(node_id)


@router.get("/graph/relations", response_model=list[GraphRelationResponse])
async def admin_list_graph_relations(
    node_id: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    _admin: User = Depends(require_admin),
):
    return await list_relations(node_id, skip, limit)


@router.post("/graph/relations", response_model=GraphRelationResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_graph_relation(
    body: GraphRelationCreate,
    _admin: User = Depends(require_admin),
):
    try:
        return await create_relation(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/graph/relations/{source_id}/{target_id}/{rel_type}", response_model=GraphRelationResponse)
async def admin_update_graph_relation(
    source_id: str,
    target_id: str,
    rel_type: str,
    body: GraphRelationUpdate,
    _admin: User = Depends(require_admin),
):
    try:
        relation = await update_relation(source_id, target_id, rel_type, body.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not relation:
        raise HTTPException(status_code=404, detail="关系不存在")
    return relation


@router.delete("/graph/relations/{source_id}/{target_id}/{rel_type}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_graph_relation(
    source_id: str,
    target_id: str,
    rel_type: str,
    _admin: User = Depends(require_admin),
):
    try:
        deleted = await delete_relation(source_id, target_id, rel_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="关系不存在")


@router.get("/graph/data", response_model=GraphDataResponse)
async def admin_graph_overview(
    _admin: User = Depends(require_admin),
):
    nodes = await list_nodes(limit=500)
    relations = await list_relations(limit=500)
    return GraphDataResponse(nodes=nodes, relations=relations)


@router.get("/documents/{doc_id}/graph-data")
async def admin_doc_graph_data(
    doc_id: uuid.UUID,
    _admin: User = Depends(require_admin),
):
    """Get knowledge graph nodes and relations for a specific document."""
    from app.services.admin_graph import _get_driver

    driver = _get_driver()
    nodes = []
    edges = []

    TYPE_COLORS = {
        "Experiment": "#3b82f6",
        "Equipment": "#ef4444",
        "Theory": "#8b5cf6",
        "Consumable": "#f59e0b",
        "Tool": "#10b981",
        "Concept": "#6b7280",
    }

    async with driver.session() as session:
        result = await session.run(
            "MATCH (n) WHERE n.document_id = $doc_id "
            "RETURN n.id AS id, n.name AS name, n.summary AS summary, labels(n) AS lbls",
            doc_id=str(doc_id),
        )
        async for record in result:
            labels = record.get("lbls", []) or []
            node_type = "Concept"
            for lbl in labels:
                if lbl not in ("__Entity__",):
                    node_type = lbl
                    break
            nodes.append({
                "data": {
                    "id": record["id"],
                    "label": record["name"] or "",
                    "name": record["name"] or "",
                    "type": node_type,
                    "summary": record["summary"] or "",
                    "color": TYPE_COLORS.get(node_type, "#6b7280"),
                    "document_id": str(doc_id),
                    "size": 20,
                }
            })

    if len(nodes) >= 2:
        node_ids = [n["data"]["id"] for n in nodes]
        async with driver.session() as session:
            result = await session.run(
                "MATCH (a)-[r]->(b) "
                "WHERE a.document_id = $doc_id AND b.document_id = $doc_id "
                "RETURN a.id AS source, b.id AS target, type(r) AS rel_type, r.confidence AS confidence",
                doc_id=str(doc_id),
            )
            async for record in result:
                edges.append({
                    "data": {
                        "id": f"{record['source']}-{record['target']}-{record['rel_type']}",
                        "source": record["source"],
                        "target": record["target"],
                        "type": record["rel_type"],
                        "confidence": record.get("confidence", 0.5) or 0.5,
                    }
                })

    return {"nodes": nodes, "relations": edges}


# ========== Admin Template Management ==========

class AdminTemplateUpdate(PydanticBaseModel):
    name: str | None = None
    description: str | None = None
    content: str | None = None
    tags: list[str] | None = None
    category: str | None = None
    status: str | None = None
    is_official: bool | None = None


@router.get("/templates")
async def admin_list_templates(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    base = select(Template)
    if status_filter:
        base = base.where(Template.status == status_filter)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (
        await db.execute(base.order_by(Template.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()

    items = []
    for t in rows:
        items.append({
            "id": str(t.id), "name": t.name, "description": t.description,
            "tags": t.tags, "category": t.category,
            "status": t.status, "is_official": t.is_official,
            "likes": t.likes, "downloads": t.downloads, "adoptions": t.adoptions,
            "is_liked": False,
            "created_by": str(t.created_by), "created_at": t.created_at.isoformat(),
        })
    return {"total": total, "items": items}


@router.patch("/templates/{tpl_id}")
async def admin_update_template(
    tpl_id: uuid.UUID,
    body: AdminTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    tpl = (await db.execute(select(Template).where(Template.id == tpl_id))).scalar_one_or_none()
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")

    payload = body.model_dump(exclude_unset=True)
    for k, v in payload.items():
        setattr(tpl, k, v)
    tpl.updated_at = datetime.utcnow()
    await db.commit()
    return {"status": "ok"}


@router.delete("/templates/{tpl_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_template(
    tpl_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    tpl = (await db.execute(select(Template).where(Template.id == tpl_id))).scalar_one_or_none()
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")
    await db.execute(delete(TemplateLike).where(TemplateLike.template_id == tpl_id))
    await db.execute(delete(TemplateComment).where(TemplateComment.template_id == tpl_id))
    await db.delete(tpl)
    await db.commit()


# ── AI Config ──

class AIConfigItem(PydanticBaseModel):
    key: str
    value: str
    updated_at: str | None = None

class AIConfigResponse(PydanticBaseModel):
    configs: list[AIConfigItem]

class AIConfigUpdate(PydanticBaseModel):
    configs: dict[str, str]

AI_CONFIG_KEYS = {
    "llm_provider", "openai_api_key", "openai_base_url", "openai_model",
    "anthropic_api_key", "anthropic_model", "embedding_model",
}
_MASKED_KEYS = {"openai_api_key", "anthropic_api_key"}


@router.get("/ai-config", response_model=AIConfigResponse)
async def get_ai_config(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.models.models import AIConfig
    result = await db.execute(select(AIConfig))
    rows = result.scalars().all()
    configs = []
    existing = {r.key: r for r in rows}
    for key in sorted(AI_CONFIG_KEYS):
        row = existing.get(key)
        value = row.value if row else ""
        updated_at = row.updated_at.isoformat() if row else None
        # Mask API keys
        if key in _MASKED_KEYS and value:
            value = "****" + value[-4:] if len(value) > 4 else "****"
        configs.append(AIConfigItem(key=key, value=value, updated_at=updated_at))
    return AIConfigResponse(configs=configs)


@router.patch("/ai-config", response_model=AIConfigResponse)
async def update_ai_config(
    body: AIConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.models.models import AIConfig
    from app.services.ai_client import reload_ai_config

    updated = {}
    for key, value in body.configs.items():
        if key not in AI_CONFIG_KEYS:
            continue
        if not value:  # skip empty values
            continue
        existing = (await db.execute(select(AIConfig).where(AIConfig.key == key))).scalar_one_or_none()
        if existing:
            existing.value = value
            existing.updated_by = _admin.id
        else:
            db.add(AIConfig(key=key, value=value, updated_by=_admin.id))
        updated[key] = value
    await db.commit()

    # Notify AI service to reload
    if updated:
        try:
            await reload_ai_config(updated)
        except Exception as e:
            logger.warning(f"AI config reload notification failed: {e}")

    # Return updated config (masked)
    result = await db.execute(select(AIConfig))
    rows = result.scalars().all()
    configs = []
    existing_map = {r.key: r for r in rows}
    for key in sorted(AI_CONFIG_KEYS):
        row = existing_map.get(key)
        value = row.value if row else ""
        updated_at = row.updated_at.isoformat() if row else None
        if key in _MASKED_KEYS and value:
            value = "****" + value[-4:] if len(value) > 4 else "****"
        configs.append(AIConfigItem(key=key, value=value, updated_at=updated_at))
    return AIConfigResponse(configs=configs)
