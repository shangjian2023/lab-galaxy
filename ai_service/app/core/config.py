from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # LLM
    LLM_PROVIDER: str = "openai"  # anthropic | openai
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = ""  # custom base URL for OpenAI-compatible APIs
    ANTHROPIC_MODEL: str = "claude-sonnet-4-20250514"
    OPENAI_MODEL: str = "gpt-4o"

    # Vector Index
    EMBEDDING_MODEL: str = "BAAI/bge-small-zh-v1.5"
    FAISS_INDEX_PATH: str = "./data/faiss_index"

    # Neo4j
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "password"
    NEO4J_MAX_POOL_SIZE: int = 50

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "text"  # text | json

    # MinIO
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "documents"

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/1"

    # HuggingFace
    HF_ENDPOINT: str = "https://hf-mirror.com"

    class Config:
        env_file = ".env"


settings = Settings()
