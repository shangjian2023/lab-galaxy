"""LLM service — unified interface for Claude / GPT, backed by registry."""

from app.core.config import get_setting
from app.core.connections import get_llm_client
from app.registries.llm_providers import llm_provider_registry


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
    import logging
    _log = logging.getLogger(__name__)
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
    _log.info(f"OpenAI DEBUG: raw_content_len={len(content) if content else 0}, finish_reason={resp.choices[0].finish_reason}, model={get_setting('OPENAI_MODEL')}")
    return content or ""


async def call_llm(
    prompt: str = "",
    system: str = "",
    max_tokens: int = 2048,
    provider: str | None = None,
    messages: list[dict] | None = None,
) -> str:
    """Call the configured LLM provider and return the text response.

    When `messages` is provided, it is used as the structured conversation
    history (list of {"role": "user"|"assistant", "content": "..."} dicts).
    Otherwise falls back to single-turn using `prompt`.
    """
    import logging
    logger = logging.getLogger(__name__)
    prov = provider or get_setting("LLM_PROVIDER")
    fn = llm_provider_registry.get(prov)
    result = await fn(prompt, system, max_tokens, messages)
    logger.info(f"LLM DEBUG: provider={prov}, result_len={len(result) if result else 0}, result_preview={repr((result or '')[:100])}")
    return result
