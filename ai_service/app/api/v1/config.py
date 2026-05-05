"""Config reload endpoint — allows backend to push new AI config at runtime."""

from fastapi import APIRouter, Request
from app.core.config import update_overrides

router = APIRouter()


@router.post("/reload")
async def reload_config(request: Request):
    """Reload LLM client configuration. Backend sends new config values."""
    from app.core.connections import reload_llm_clients

    body = await request.json()
    configs = body.get("configs", {})
    if not configs:
        return {"status": "error", "message": "No configs provided"}

    update_overrides(configs)
    await reload_llm_clients()
    return {"status": "ok", "updated_keys": list(configs.keys())}
