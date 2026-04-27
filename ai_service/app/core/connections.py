"""Application-scoped connection pools for Neo4j and LLM clients."""

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

_neo4j_driver = None
_llm_clients: dict[str, object] = {}


async def init_neo4j():
    global _neo4j_driver
    from neo4j import AsyncGraphDatabase

    _neo4j_driver = AsyncGraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
        max_connection_pool_size=settings.NEO4J_MAX_POOL_SIZE,
        connection_timeout=30,
    )
    logger.info(f"Neo4j driver initialized (pool_size={settings.NEO4J_MAX_POOL_SIZE})")


async def close_neo4j():
    global _neo4j_driver
    if _neo4j_driver:
        await _neo4j_driver.close()
        _neo4j_driver = None
        logger.info("Neo4j driver closed")


def get_neo4j_driver():
    if _neo4j_driver is None:
        raise RuntimeError("Neo4j driver not initialized — app lifespan may not have started")
    return _neo4j_driver


def init_llm_clients():
    if settings.LLM_PROVIDER == "anthropic":
        import anthropic
        kwargs = {"api_key": settings.ANTHROPIC_API_KEY}
        _llm_clients["anthropic"] = anthropic.AsyncAnthropic(**kwargs)
        logger.info(f"Anthropic client initialized (model={settings.ANTHROPIC_MODEL})")
    elif settings.LLM_PROVIDER == "openai":
        from openai import AsyncOpenAI
        kwargs = {"api_key": settings.OPENAI_API_KEY}
        if settings.OPENAI_BASE_URL:
            kwargs["base_url"] = settings.OPENAI_BASE_URL
        _llm_clients["openai"] = AsyncOpenAI(**kwargs)
        logger.info(f"OpenAI client initialized (model={settings.OPENAI_MODEL}, base_url={settings.OPENAI_BASE_URL or 'default'})")

    if settings.LLM_PROVIDER == "anthropic" and "openai" not in _llm_clients:
        if settings.OPENAI_API_KEY:
            from openai import AsyncOpenAI
            kwargs = {"api_key": settings.OPENAI_API_KEY}
            if settings.OPENAI_BASE_URL:
                kwargs["base_url"] = settings.OPENAI_BASE_URL
            _llm_clients["openai"] = AsyncOpenAI(**kwargs)
    elif settings.LLM_PROVIDER == "openai" and "anthropic" not in _llm_clients:
        if settings.ANTHROPIC_API_KEY:
            import anthropic
            _llm_clients["anthropic"] = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


def get_llm_client(provider: str | None = None):
    provider = provider or settings.LLM_PROVIDER
    if provider not in _llm_clients:
        raise RuntimeError(f"LLM client for '{provider}' not initialized")
    return _llm_clients[provider]
