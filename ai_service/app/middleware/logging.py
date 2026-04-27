"""Request logging middleware."""

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("app.middleware")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.monotonic()
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:8])
        response: Response = await call_next(request)
        duration_ms = (time.monotonic() - start) * 1000
        logger.info(
            f"{request.method} {request.url.path} {response.status_code} {duration_ms:.1f}ms",
            extra={"extra_data": {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round(duration_ms, 2),
            }},
        )
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = f"{duration_ms:.2f}ms"
        return response
