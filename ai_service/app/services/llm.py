"""LLM service — unified interface for Claude / GPT, backed by registry."""

import asyncio
import logging

from app.core.config import get_setting
from app.core.connections import get_llm_client
from app.registries.llm_providers import llm_provider_registry

logger = logging.getLogger(__name__)


@llm_provider_registry.register("anthropic")
async def _call_anthropic(prompt: str, system: str, max_tokens: int, messages: list[dict] | None = None) -> str:
    client = get_llm_client("anthropic")
    if messages:
        msg_list = messages
    else:
        msg_list = [{"role": "user", "content": prompt}]
    resp = await client.messages.create(
        model=get_setting("ANTHROPIC_MODEL"),
        max_tokens=max_tokens,
        temperature=0,
        system=system,
        messages=msg_list,
    )
    return resp.content[0].text


@llm_provider_registry.register("openai")
async def _call_openai(prompt: str, system: str, max_tokens: int, messages: list[dict] | None = None) -> str:
    client = get_llm_client("openai")
    if messages:
        msg_list = [{"role": "system", "content": system}, *messages]
    else:
        msg_list = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
    resp = await client.chat.completions.create(
        model=get_setting("OPENAI_MODEL"),
        max_tokens=max_tokens,
        temperature=0,
        messages=msg_list,
    )
    content = resp.choices[0].message.content
    logger.info(f"OpenAI DEBUG: raw_content_len={len(content) if content else 0}, finish_reason={resp.choices[0].finish_reason}, model={get_setting('OPENAI_MODEL')}")
    return content or ""


async def call_llm(
    prompt: str = "",
    system: str = "",
    max_tokens: int = 2048,
    provider: str | None = None,
    messages: list[dict] | None = None,
) -> str:
    """Call the configured LLM provider and return the text response.

    Retries on transient/timeout errors (network blips, gateway 5xx) with
    exponential backoff, so a single flaky LLM call no longer fails a whole
    document parse or query.
    """
    prov = provider or get_setting("LLM_PROVIDER")
    fn = llm_provider_registry.get(prov)
    max_retries = int(get_setting("LLM_MAX_RETRIES"))

    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            result = await fn(prompt, system, max_tokens, messages)
            logger.info(f"LLM DEBUG: provider={prov}, attempt={attempt + 1}, result_len={len(result) if result else 0}")
            return result
        except Exception as e:
            last_exc = e
            # Non-retryable: auth/permission errors etc. — fail fast.
            err_text = str(e).lower()
            if any(k in err_text for k in ("api key", "authentication", "unauthorized", "forbidden", "permission")):
                raise
            if attempt < max_retries:
                wait = 0.8 * (2 ** attempt)  # 0.8s, 1.6s, ...
                logger.warning(f"LLM call failed (attempt {attempt + 1}/{max_retries + 1}), retrying in {wait:.1f}s: {e}")
                await asyncio.sleep(wait)
            else:
                logger.error(f"LLM call failed after {max_retries + 1} attempts: {e}")
    raise last_exc  # type: ignore[misc]


async def call_llm_stream(
    prompt: str = "",
    system: str = "",
    max_tokens: int = 2048,
    provider: str | None = None,
    messages: list[dict] | None = None,
):
    """Stream text chunks from the LLM as an async generator.

    Yields str deltas as they arrive. Used by the natural-language query
    endpoint to show answers progressively instead of blocking until done.
    """
    import anthropic  # noqa: F401  (ensured available when provider is anthropic)

    prov = provider or get_setting("LLM_PROVIDER")

    if prov == "anthropic":
        client = get_llm_client("anthropic")
        msg_list = messages if messages else [{"role": "user", "content": prompt}]
        async with client.messages.stream(
            model=get_setting("ANTHROPIC_MODEL"),
            max_tokens=max_tokens,
            temperature=0,
            system=system,
            messages=msg_list,
        ) as stream:
            async for text in stream.text_stream:
                yield text
        return

    # openai-compatible (default)
    client = get_llm_client("openai")
    if messages:
        msg_list = [{"role": "system", "content": system}, *messages]
    else:
        msg_list = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
    stream = await client.chat.completions.create(
        model=get_setting("OPENAI_MODEL"),
        max_tokens=max_tokens,
        temperature=0,
        messages=msg_list,
        stream=True,
    )
    async for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
