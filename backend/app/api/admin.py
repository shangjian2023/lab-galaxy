"""Admin routes — manage users, documents, knowledge graph."""

import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.core.security import hash_password
from app.models.models import Document, PointsLog, User
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ========== Users ==========

@router.get("/users", response_model=list[UserProfile])
async def admin_list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    rows = (
        await db.execute(
            select(User).order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    ).scalars().all()
    return rows


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
        user.level = body.level
    if body.is_active is not None:
        user.is_active = body.is_active

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

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        nickname=body.nickname,
        role=body.role,
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
    user.is_active = False
    await db.commit()


# ========== Points ==========

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
    log = PointsLog(user_id=user.id, change=body.change, reason=body.reason)
    db.add(log)
    await db.commit()
    await db.refresh(user)
    return user


# ========== Documents ==========

@router.get("/documents", response_model=DocumentListResponse)
async def admin_list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    base = select(Document)
    if status_filter:
        base = base.where(Document.status == status_filter)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (
        await db.execute(base.order_by(Document.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()

    items = []
    for row in rows:
        resp = DocumentResponse.model_validate(row)
        if row.extraction_result:
            try:
                resp.extraction_result = json.loads(row.extraction_result)
            except json.JSONDecodeError:
                resp.extraction_result = None
        items.append(resp)
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

    if body.title is not None:
        doc.title = body.title
    if body.experiment_year is not None:
        doc.experiment_year = body.experiment_year
    if body.experiment_type is not None:
        doc.experiment_type = body.experiment_type
    if body.subjects is not None:
        doc.subjects = body.subjects
    if body.privacy is not None:
        doc.privacy = body.privacy
    if body.status is not None:
        doc.status = body.status
    if body.extraction_result is not None:
        doc.extraction_result = json.dumps(body.extraction_result, ensure_ascii=False)
    if body.error_message is not None:
        doc.error_message = body.error_message

    await db.commit()
    await db.refresh(doc)

    resp = DocumentResponse.model_validate(doc)
    if doc.extraction_result:
        try:
            resp.extraction_result = json.loads(doc.extraction_result)
        except json.JSONDecodeError:
            resp.extraction_result = None
    return resp


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    await db.delete(doc)
    await db.commit()


# ========== Knowledge Graph ==========

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
    return await create_relation(body.model_dump())


@router.patch("/graph/relations/{source_id}/{target_id}/{rel_type}")
async def admin_update_graph_relation(
    source_id: str,
    target_id: str,
    rel_type: str,
    body: GraphRelationUpdate,
    _admin: User = Depends(require_admin),
):
    await update_relation(source_id, target_id, rel_type, body.model_dump(exclude_none=True))
    return {"status": "ok"}


@router.delete("/graph/relations/{source_id}/{target_id}/{rel_type}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_graph_relation(
    source_id: str,
    target_id: str,
    rel_type: str,
    _admin: User = Depends(require_admin),
):
    await delete_relation(source_id, target_id, rel_type)


@router.get("/graph/data", response_model=GraphDataResponse)
async def admin_graph_overview(
    _admin: User = Depends(require_admin),
):
    nodes = await list_nodes(limit=500)
    relations = await list_relations(limit=500)
    return GraphDataResponse(nodes=nodes, relations=relations)
