from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "知识图谱平台"
    DEBUG: bool = True

    # PostgreSQL
    POSTGRES_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/kg_platform"

    # Neo4j
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "password"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # MinIO
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "documents"

    # Auth
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # AI Service
    AI_SERVICE_URL: str = "http://localhost:8001/api/v1"

    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"


settings = Settings()
