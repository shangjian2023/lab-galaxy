"""Processing endpoints — document parsing and extraction pipeline."""

from fastapi import APIRouter, HTTPException, Request

from app.schemas.requests import ProcessRequest
from app.schemas.responses import ProcessResponse
from app.services.pipeline import process_document, write_graph_only
from app.services.graph import delete_document_graph
from app.core.exceptions import ParsingError

router = APIRouter()


@router.post("/process", response_model=ProcessResponse)
async def process_doc(body: ProcessRequest):
    """Trigger the full AI pipeline on a document."""
    raise HTTPException(status_code=400, detail="Use /process-sync with file data")


@router.post("/process-sync", response_model=ProcessResponse)
async def process_doc_sync(
    document_id: str, filename: str, skip_graph: bool = False, request: Request = None
):
    """Synchronous processing endpoint — accepts raw file bytes."""
    try:
        file_data = await request.body()
        result = await process_document(file_data, filename, document_id, skip_graph=skip_graph)
        return ProcessResponse(**result)
    except ValueError as e:
        raise ParsingError(str(e))


@router.post("/write-graph")
async def write_graph(request: Request):
    """Write pre-extracted entities and relations to Neo4j and FAISS."""
    body = await request.json()
    document_id = body.get("document_id", "")
    entities = body.get("entities", [])
    relations = body.get("relations", [])
    if not document_id or not entities:
        raise HTTPException(status_code=400, detail="document_id and entities are required")
    result = await write_graph_only(document_id, entities, relations)
    return result


@router.delete("/graph/document/{document_id}")
async def delete_doc_graph(document_id: str):
    """Delete all graph data for a document."""
    deleted = await delete_document_graph(document_id)
    return {"deleted": deleted}
