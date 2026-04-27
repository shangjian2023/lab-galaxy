"""Response schemas for AI service API."""

from pydantic import BaseModel


class ProcessResponse(BaseModel):
    document_id: str
    text_length: int
    entity_count: int
    relation_count: int
    entities: list[dict]
    relations: list[dict]


class ErrorResponse(BaseModel):
    error: str
    detail: str
    error_code: str
