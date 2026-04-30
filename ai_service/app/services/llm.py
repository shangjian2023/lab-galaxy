"""LLM service — unified interface for Claude / GPT, backed by registry."""

from app.core.config import settings
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
        model=settings.ANTHROPIC_MODEL,
        max_tokens=max_tokens,
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
        model=settings.OPENAI_MODEL,
        max_tokens=max_tokens,
        messages=msg_list,
    )
    return resp.choices[0].message.content


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
    prov = provider or settings.LLM_PROVIDER
    fn = llm_provider_registry.get(prov)
    return await fn(prompt, system, max_tokens, messages)
