from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models.models import EquipmentRequest, User
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class EquipmentRequestCreate(BaseModel):
    request_type: str  # "equipment" or "lab_space"
    title: str
    description: str = ""
    quantity: int = 1


class EquipmentRequestReply(BaseModel):
    status: str  # "approved" or "rejected"
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


class EquipmentCatalogItem(BaseModel):
    name: str
    icon: str
    description: str


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

_CATALOG = [
    EquipmentCatalogItem(name="Microscope", icon="🔬", description="Optical instrument for viewing objects too small to be seen by the naked eye."),
    EquipmentCatalogItem(name="Centrifuge", icon="🌀", description="Separates particles from a solution according to size, shape, density, and rotor speed."),
    EquipmentCatalogItem(name="Oscilloscope", icon="📈", description="Displays and analyzes the waveform of electronic signals."),
    EquipmentCatalogItem(name="Multimeter", icon="⚡", description="Measures voltage, current, and resistance in electrical circuits."),
    EquipmentCatalogItem(name="Spectrophotometer", icon="🌈", description="Measures the intensity of light as a function of its wavelength."),
    EquipmentCatalogItem(name="PCR Machine", icon="🧬", description="Amplifies specific DNA sequences through polymerase chain reaction."),
    EquipmentCatalogItem(name="Fume Hood", icon="💨", description="Ventilated enclosure that limits exposure to hazardous fumes and vapors."),
    EquipmentCatalogItem(name="Autoclave", icon="♨️", description="Sterilizes equipment and supplies using high-pressure saturated steam."),
    EquipmentCatalogItem(name="Incubator", icon="🥚", description="Maintains optimal temperature, humidity, and CO₂ for cell or microbiological cultures."),
    EquipmentCatalogItem(name="pH Meter", icon="🧪", description="Measures the acidity or alkalinity of a solution."),
    EquipmentCatalogItem(name="Bunsen Burner", icon="🔥", description="Produces a single open gas flame used for heating and sterilization."),
    EquipmentCatalogItem(name="Analytical Balance", icon="⚖️", description="High-precision scale for measuring mass of small samples."),
    EquipmentCatalogItem(name="Vortex Mixer", icon="🔄", description="Mixes liquid samples in test tubes by creating a vortex."),
    EquipmentCatalogItem(name="Water Bath", icon="💧", description="Incubates samples at a constant temperature in a heated water reservoir."),
    EquipmentCatalogItem(name="Hot Plate", icon="🍳", description="Heats materials or containers using an electric heating element."),
    EquipmentCatalogItem(name="Refrigerator 4°C", icon="❄️", description="Stores temperature-sensitive reagents and samples at 4 degrees Celsius."),
    EquipmentCatalogItem(name="-80°C Freezer", icon="🧊", description="Ultra-low temperature freezer for long-term storage of biological samples."),
    EquipmentCatalogItem(name="CO2 Incubator", icon="🫧", description="Cell-culture incubator that controls temperature, humidity, and CO₂ levels."),
    EquipmentCatalogItem(name="Biosafety Cabinet", icon="🛡️", description="Provides a sterile working environment and protects the user from biohazards."),
    EquipmentCatalogItem(name="Pipette Set", icon="💉", description="Set of precision liquid-handling tools for transferring small volumes."),
]


def _to_response(row: EquipmentRequest, user_nickname: Optional[str] = None) -> EquipmentRequestResponse:
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
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/catalog")
async def get_catalog():
    """Return the catalog of common lab equipment (no auth required)."""
    return {"items": _CATALOG}


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

    items = [_to_response(r) for r in rows]
    return {"total": total, "items": items}


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
        _to_response(row.EquipmentRequest, user_nickname=row.nickname)
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

    return _to_response(row)
