"""Global exception handler for AI service errors."""

import logging

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.exceptions import (
    AIServiceError,
    ParsingError,
    ExtractionError,
    GraphWriteError,
    VectorIndexError,
    ModelNotFoundError,
)

logger = logging.getLogger(__name__)

_STATUS_MAP = {
    ParsingError: 422,
    ExtractionError: 502,
    GraphWriteError: 503,
    VectorIndexError: 503,
    ModelNotFoundError: 400,
}


async def ai_service_error_handler(request: Request, exc: AIServiceError):
    status = _STATUS_MAP.get(type(exc), 500)
    logger.error(f"{type(exc).__name__}: {exc.detail}")
    return JSONResponse(
        status_code=status,
        content={
            "error": type(exc).__name__,
            "detail": exc.detail,
            "error_code": exc.error_code,
        },
    )


async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "InternalServerError",
            "detail": "An unexpected error occurred",
            "error_code": "INTERNAL_ERROR",
        },
    )
