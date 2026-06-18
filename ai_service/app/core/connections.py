"""Application-scoped connection pools for Neo4j and LLM clients."""

import logging

from app.core.config import settings, get_setting

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
    provider = get_setting("LLM_PROVIDER")
    llm_timeout = get_setting("LLM_TIMEOUT")
    if provider == "anthropic":
        import anthropic
        kwargs = {"api_key": get_setting("ANTHROPIC_API_KEY"), "timeout": llm_timeout}
        _llm_clients["anthropic"] = anthropic.AsyncAnthropic(**kwargs)
        logger.info(f"Anthropic client initialized (model={get_setting('ANTHROPIC_MODEL')}, timeout={llm_timeout}s)")
    elif provider == "openai":
        from openai import AsyncOpenAI
        kwargs = {"api_key": get_setting("OPENAI_API_KEY"), "timeout": llm_timeout}
        base_url = get_setting("OPENAI_BASE_URL")
        if base_url:
            kwargs["base_url"] = base_url
        _llm_clients["openai"] = AsyncOpenAI(**kwargs)
        logger.info(f"OpenAI client initialized (model={get_setting('OPENAI_MODEL')}, base_url={base_url or 'default'}, timeout={llm_timeout}s)")

    if provider == "anthropic" and "openai" not in _llm_clients:
        openai_key = get_setting("OPENAI_API_KEY")
        if openai_key:
            from openai import AsyncOpenAI
            kwargs = {"api_key": openai_key, "timeout": llm_timeout}
            base_url = get_setting("OPENAI_BASE_URL")
            if base_url:
                kwargs["base_url"] = base_url
            _llm_clients["openai"] = AsyncOpenAI(**kwargs)
    elif provider == "openai" and "anthropic" not in _llm_clients:
        anthropic_key = get_setting("ANTHROPIC_API_KEY")
        if anthropic_key:
            import anthropic
            _llm_clients["anthropic"] = anthropic.AsyncAnthropic(api_key=anthropic_key, timeout=llm_timeout)


async def reload_llm_clients():
    """Re-initialize LLM clients with current config overrides."""
    global _llm_clients
    # Close existing clients
    for name, client in _llm_clients.items():
        try:
            if hasattr(client, "close"):
                await client.close()
        except Exception:
            pass
    _llm_clients.clear()
    # Re-initialize
    init_llm_clients()
    logger.info("LLM clients reloaded")


def get_llm_client(provider: str | None = None):
    provider = provider or get_setting("LLM_PROVIDER")
    if provider not in _llm_clients:
        raise RuntimeError(f"LLM client for '{provider}' not initialized")
    return _llm_clients[provider]
