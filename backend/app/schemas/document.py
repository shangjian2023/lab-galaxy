import uuid
from datetime import datetime

from pydantic import BaseModel, Field


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
    status: str
    experiment_year: int | None = None
    experiment_type: str | None = None
    subjects: list[str] | None = None
    privacy: str = "public"
    extraction_result: dict | None = None
    error_message: str | None = None
    uploaded_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    total: int
    items: list[DocumentResponse]


class BatchUploadResponse(BaseModel):
    documents: list[DocumentResponse]
    errors: list[dict]


# ---------- Admin document edit ----------

class AdminDocumentUpdate(BaseModel):
    title: str | None = None
    experiment_year: int | None = None
    experiment_type: str | None = None
    subjects: list[str] | None = None
    privacy: str | None = Field(None, pattern="^(public|team|private)$")
    status: str | None = Field(None, pattern="^(uploaded|parsing|extracting|completed|failed)$")
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
