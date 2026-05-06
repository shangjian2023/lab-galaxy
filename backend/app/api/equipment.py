from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models.models import EquipmentRequest, EquipmentCatalogItem, User
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class EquipmentRequestCreate(BaseModel):
    request_type: str
    title: str
    description: str = ""
    quantity: int = 1


class EquipmentRequestReply(BaseModel):
    status: str
    reply: str


class EquipmentRequestResponse(BaseModel):
    id: str
    user_id: str
    user_nickname: Optional[str]
    request_type: str
    title: str
    description: Optional[str]
    quantity: int
    status: str
    admin_reply: Optional[str]
    created_at: Optional[datetime]


class CatalogItemCreate(BaseModel):
    name: str
    icon: str = "🔧"
    description: str = ""
    sort_order: int = 0


class CatalogItemUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class CatalogItemResponse(BaseModel):
    id: str
    name: str
    icon: str
    description: Optional[str]
    sort_order: int
    is_active: bool
    created_at: Optional[datetime]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SEED_CATALOG = [
    ("高性能服务器", "🖥️", "用于大规模计算任务的集群服务器，支持深度学习模型训练和大数据处理", 0),
    ("GPU 工作站", "🎮", "配备高性能显卡的工作站，用于深度学习、图形渲染和并行计算", 1),
    ("3D 打印机", "🖨️", "用于快速原型制作，支持 FDM/SLA 打印技术", 2),
    ("示波器", "📈", "用于观测电信号波形的仪器，调试电路和嵌入式系统开发", 3),
    ("万用表", "⚡", "测量电压、电流、电阻等参数的电工仪表", 4),
    ("逻辑分析仪", "🔍", "分析和调试数字电路信号，捕获总线通信数据", 5),
    ("开发板套件", "🔧", "包含 Arduino、树莓派、STM32 等常用开发板的套件", 6),
    ("路由器/交换机", "🌐", "用于网络实验的路由器和交换机设备，支持 VLAN 和路由配置", 7),
    ("网络抓包设备", "📡", "用于网络协议分析和流量监控的硬件设备", 8),
    ("VR 头显", "🥽", "虚拟现实头显设备，用于 VR/AR 应用开发和交互设计", 9),
    ("机械键盘", "⌨️", "高手感机械轴键盘，适合长时间编码使用", 10),
    ("双显示器支架", "🖥️", "可调节的双屏支架，提高多任务开发效率", 11),
    ("嵌入式调试器", "🔌", "用于烧录固件和调试嵌入式程序的硬件调试工具", 12),
    ("数据采集卡", "📊", "将模拟信号转换为数字信号的采集设备，用于传感器数据读取", 13),
    ("焊接工作台", "🔥", "配备防静电垫、焊台和排烟装置的 PCB 焊接工作台", 14),
    ("存储阵列柜", "💾", "大容量数据存储设备，用于备份和分布式文件系统实验", 15),
    ("不间断电源 UPS", "🔋", "保障服务器和设备在断电时持续运行，防止数据丢失", 16),
    ("KVM 切换器", "🔄", "一套键鼠显示器控制多台服务器的切换设备", 17),
    ("物联网传感器套件", "📦", "包含温湿度、光照、加速度等多种传感器的 IoT 开发套件", 18),
    ("机器人平台", "🤖", "用于机器人算法开发和 AI 视觉识别的移动机器人平台", 19),
]


def _catalog_to_response(row: EquipmentCatalogItem) -> CatalogItemResponse:
    return CatalogItemResponse(
        id=str(row.id),
        name=row.name,
        icon=row.icon,
        description=row.description,
        sort_order=row.sort_order,
        is_active=row.is_active,
        created_at=row.created_at,
    )


def _request_to_response(row: EquipmentRequest, user_nickname: Optional[str] = None) -> EquipmentRequestResponse:
    return EquipmentRequestResponse(
        id=str(row.id),
        user_id=str(row.user_id),
        user_nickname=user_nickname,
        request_type=row.request_type,
        title=row.title,
        description=row.description,
        quantity=row.quantity,
        status=row.status,
        admin_reply=row.admin_reply,
        created_at=row.created_at,
    )


# ---------------------------------------------------------------------------
# Catalog endpoints (public)
# ---------------------------------------------------------------------------

@router.post("/catalog")
async def get_catalog(db: AsyncSession = Depends(get_db)):
    """Return active catalog items."""
    stmt = (
        select(EquipmentCatalogItem)
        .where(EquipmentCatalogItem.is_active == True)
        .order_by(EquipmentCatalogItem.sort_order, EquipmentCatalogItem.created_at)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return {"items": [_catalog_to_response(r) for r in rows]}


@router.get("/catalog/all")
async def get_catalog_all(db: AsyncSession = Depends(get_db)):
    """Return all catalog items including inactive ones."""
    stmt = select(EquipmentCatalogItem).order_by(EquipmentCatalogItem.sort_order, EquipmentCatalogItem.created_at)
    rows = (await db.execute(stmt)).scalars().all()
    return {"items": [_catalog_to_response(r) for r in rows]}


# ---------------------------------------------------------------------------
# Admin catalog management
# ---------------------------------------------------------------------------

@router.post("/admin/catalog", status_code=201)
async def create_catalog_item(
    payload: CatalogItemCreate,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: add a new catalog item."""
    item = EquipmentCatalogItem(
        name=payload.name,
        icon=payload.icon,
        description=payload.description,
        sort_order=payload.sort_order,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _catalog_to_response(item)


@router.put("/admin/catalog/{item_id}")
async def update_catalog_item(
    item_id: str,
    payload: CatalogItemUpdate,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: update a catalog item."""
    try:
        iid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid item_id format")

    stmt = select(EquipmentCatalogItem).where(EquipmentCatalogItem.id == iid)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Catalog item not found")

    if payload.name is not None:
        row.name = payload.name
    if payload.icon is not None:
        row.icon = payload.icon
    if payload.description is not None:
        row.description = payload.description
    if payload.sort_order is not None:
        row.sort_order = payload.sort_order
    if payload.is_active is not None:
        row.is_active = payload.is_active

    await db.commit()
    await db.refresh(row)
    return _catalog_to_response(row)


@router.delete("/admin/catalog/{item_id}")
async def delete_catalog_item(
    item_id: str,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: delete a catalog item."""
    try:
        iid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid item_id format")

    stmt = select(EquipmentCatalogItem).where(EquipmentCatalogItem.id == iid)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Catalog item not found")

    await db.delete(row)
    await db.commit()
    return {"message": "Deleted"}


# ---------------------------------------------------------------------------
# Equipment request endpoints (user)
# ---------------------------------------------------------------------------

@router.post("/requests", status_code=201)
async def create_request(
    payload: EquipmentRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a new equipment or lab-space request."""
    if payload.request_type not in ("equipment", "lab_space"):
        raise HTTPException(status_code=400, detail="request_type must be 'equipment' or 'lab_space'")
    if not payload.title or not payload.title.strip():
        raise HTTPException(status_code=400, detail="title must not be empty")

    request = EquipmentRequest(
        user_id=current_user.id,
        request_type=payload.request_type,
        title=payload.title.strip(),
        description=payload.description,
        quantity=payload.quantity,
    )
    db.add(request)
    await db.commit()
    await db.refresh(request)

    return {"id": str(request.id), "message": "申请已提交"}


@router.get("/requests/my")
async def get_my_requests(
    page: int = Query(1, ge=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's own equipment requests."""
    offset = (page - 1) * 20

    total_stmt = select(func.count()).where(EquipmentRequest.user_id == current_user.id)
    total = (await db.execute(total_stmt)).scalar() or 0

    stmt = (
        select(EquipmentRequest)
        .where(EquipmentRequest.user_id == current_user.id)
        .order_by(EquipmentRequest.created_at.desc())
        .offset(offset)
        .limit(20)
    )
    rows = (await db.execute(stmt)).scalars().all()

    items = [_request_to_response(r) for r in rows]
    return {"total": total, "items": items}


# ---------------------------------------------------------------------------
# Admin request management
# ---------------------------------------------------------------------------

@router.get("/admin/requests")
async def admin_list_requests(
    page: int = Query(1, ge=1),
    status: Optional[str] = Query(None),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: list all equipment requests with optional status filter."""
    offset = (page - 1) * 20

    base_conditions = []
    if status is not None:
        base_conditions.append(EquipmentRequest.status == status)

    total_stmt = select(func.count()).where(*base_conditions) if base_conditions else select(func.count(EquipmentRequest.id))
    total = (await db.execute(total_stmt)).scalar() or 0

    stmt = (
        select(EquipmentRequest, User.nickname)
        .join(User, EquipmentRequest.user_id == User.id, isouter=True)
    )
    if base_conditions:
        stmt = stmt.where(*base_conditions)

    stmt = stmt.order_by(EquipmentRequest.created_at.desc()).offset(offset).limit(20)
    rows = (await db.execute(stmt)).all()

    items = [
        _request_to_response(row.EquipmentRequest, user_nickname=row.nickname)
        for row in rows
    ]
    return {"total": total, "items": items}


@router.patch("/admin/requests/{request_id}")
async def admin_reply_request(
    request_id: str,
    payload: EquipmentRequestReply,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: approve or reject an equipment request."""
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="status must be 'approved' or 'rejected'")

    try:
        rid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid request_id format")

    stmt = select(EquipmentRequest).where(EquipmentRequest.id == rid)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Request not found")

    row.status = payload.status
    row.admin_reply = payload.reply
    await db.commit()
    await db.refresh(row)

    return _request_to_response(row)
