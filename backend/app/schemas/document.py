import json
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


def _parse_json_field(value: str | None) -> dict | list | None:
    if not value:
        return None
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return None


class DocumentUploadMeta(BaseModel):
    experiment_year: int | None = Field(None, description="实验年份")
    experiment_type: str | None = Field(None, description="课程实验/创新实验/科研项目/竞赛项目")
    subjects: list[str] | None = Field(None, description="学科领域（多选）")
    privacy: str = Field("public", pattern="^(public|team|private)$", description="public/team/private")


class DocumentResponse(BaseModel):
    id: uuid.UUID
    title: str
    file_type: str
    file_size: int
    file_path: str
    status: str
    experiment_year: int | None = None
    experiment_type: str | None = None
    subjects: list[str] | None = None
    privacy: str = "public"
    extraction_result: dict | None = None
    error_message: str | None = None
    duplicate_info: list[dict] | None = None
    uploaded_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, doc) -> "DocumentResponse":
        return cls(
            id=str(doc.id) if isinstance(doc.id, uuid.UUID) else doc.id,
            title=doc.title,
            file_type=doc.file_type,
            file_size=doc.file_size,
            file_path=doc.file_path,
            status=doc.status,
            experiment_year=doc.experiment_year,
            experiment_type=doc.experiment_type,
            subjects=doc.subjects,
            privacy=doc.privacy,
            extraction_result=_parse_json_field(doc.extraction_result),
            error_message=doc.error_message,
            duplicate_info=_parse_json_field(doc.duplicate_info),
            uploaded_by=str(doc.uploaded_by) if isinstance(doc.uploaded_by, uuid.UUID) else doc.uploaded_by,
            created_at=doc.created_at,
        )


class DocumentListResponse(BaseModel):
    total: int
    items: list[DocumentResponse]


class BatchUploadResponse(BaseModel):
    documents: list[DocumentResponse]
    errors: list[dict]


class IngestConfirmRequest(BaseModel):
    action: str = Field(..., pattern="^(overwrite|cancel|coexist)$", description="覆盖入库/取消入库/并存入库")


# ---------- Admin document edit ----------

class AdminDocumentUpdate(BaseModel):
    title: str | None = None
    experiment_year: int | None = None
    experiment_type: str | None = None
    subjects: list[str] | None = None
    privacy: str | None = Field(None, pattern="^(public|team|private)$")
    status: str | None = Field(None, pattern="^(uploaded|parsing|extracting|awaiting_confirmation|completed|failed)$")
    extraction_result: dict | None = None
    error_message: str | None = None


# ---------- Knowledge Graph edit ----------

class GraphNodeCreate(BaseModel):
    id: str | None = None
    type: str = Field(pattern="^(Experiment|Equipment|Theory|Consumable|Tool|Concept)$")
    name: str
    summary: str = ""
    document_id: str | None = None


class GraphNodeUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    summary: str | None = None


class GraphRelationCreate(BaseModel):
    source_id: str
    target_id: str
    type: str
    confidence: float = Field(0.5, ge=0, le=1)
    document_id: str | None = None


class GraphRelationUpdate(BaseModel):
    type: str | None = None
    confidence: float | None = Field(None, ge=0, le=1)


class GraphNodeResponse(BaseModel):
    id: str
    type: str
    name: str
    summary: str
    document_id: str | None = None


class GraphRelationResponse(BaseModel):
    source_id: str
    target_id: str
    type: str
    confidence: float
    document_id: str | None = None


class GraphDataResponse(BaseModel):
    nodes: list[GraphNodeResponse]
    relations: list[GraphRelationResponse]
