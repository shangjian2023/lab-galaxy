"""Processing endpoints — document parsing and extraction pipeline."""

from fastapi import APIRouter, HTTPException, Request

from app.schemas.requests import ProcessRequest
from app.schemas.responses import ProcessResponse
from app.services.pipeline import process_document
from app.services.graph import delete_document_graph
from app.core.exceptions import ParsingError

router = APIRouter()


@router.post("/process", response_model=ProcessResponse)
async def process_doc(body: ProcessRequest):
    """Trigger the full AI pipeline on a document."""
    raise HTTPException(status_code=400, detail="Use /process-sync with file data")


@router.post("/process-sync", response_model=ProcessResponse)
async def process_doc_sync(document_id: str, filename: str, request: Request):
    """Synchronous processing endpoint — accepts raw file bytes."""
    try:
        file_data = await request.body()
        result = await process_document(file_data, filename, document_id)
        return ProcessResponse(**result)
    except ValueError as e:
        raise ParsingError(str(e))


@router.delete("/graph/document/{document_id}")
async def delete_doc_graph(document_id: str):
    """Delete all graph data for a document."""
    deleted = await delete_document_graph(document_id)
    return {"deleted": deleted}
