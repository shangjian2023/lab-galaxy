"""Request schemas for AI service API."""

from pydantic import BaseModel


class ProcessRequest(BaseModel):
    document_id: str
    filename: str


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
