from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import setup_logging
from app.core.connections import init_neo4j, close_neo4j, init_llm_clients
from app.core.exceptions import AIServiceError
from app.middleware.logging import RequestLoggingMiddleware
from app.middleware.error_handler import ai_service_error_handler, unhandled_exception_handler
from app.api import router as api_router

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_neo4j()
    init_llm_clients()
    yield
    await close_neo4j()


app = FastAPI(title="AI Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AIServiceError, ai_service_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
