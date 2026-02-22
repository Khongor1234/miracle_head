"""Model validation against OpenRouter's available models."""

import json
import time
from pathlib import Path
from typing import Dict, Any, List

import httpx

from .config import OPENROUTER_API_KEY

MODELS_CACHE_PATH = Path(__file__).parent.parent / "data" / "models_cache.json"
CACHE_TTL_SECONDS = 3600  # 1 hour


async def _fetch_openrouter_models() -> List[str]:
    """Fetch available model IDs from OpenRouter."""
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            "https://openrouter.ai/api/v1/models",
            headers=headers,
        )
        response.raise_for_status()
        data = response.json()
        return [model["id"] for model in data.get("data", [])]


async def _get_models_cached() -> List[str]:
    """Return cached model list or fetch fresh if expired."""
    MODELS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)

    if MODELS_CACHE_PATH.exists():
        with open(MODELS_CACHE_PATH) as f:
            cache = json.load(f)
        if time.time() - cache.get("fetched_at", 0) < CACHE_TTL_SECONDS:
            return cache["models"]

    models = await _fetch_openrouter_models()

    with open(MODELS_CACHE_PATH, "w") as f:
        json.dump({"fetched_at": time.time(), "models": models}, f)

    return models


async def validate_model(model_id: str) -> bool:
    """Return True if model_id exists on OpenRouter."""
    models = await _get_models_cached()
    return model_id in models


async def validate_models(model1: str, model2: str) -> Dict[str, Any]:
    """Validate both model IDs. Returns {valid: bool, errors: [str]}."""
    models = await _get_models_cached()
    errors = []
    if model1 not in models:
        errors.append(f"Model '{model1}' not found on OpenRouter")
    if model2 not in models:
        errors.append(f"Model '{model2}' not found on OpenRouter")
    return {"valid": len(errors) == 0, "errors": errors}
