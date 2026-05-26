"""Gemini API client."""

import json
from typing import Any, Dict, Optional

import httpx

from .config import GEMINI_API_KEY, GEMINI_API_URL


class GeminiError(RuntimeError):
    """Raised when Gemini cannot return usable text."""


def _extract_text(data: Dict[str, Any]) -> str:
    parts = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    text = "".join(part.get("text", "") for part in parts)
    return text.strip()


async def query_gemini(
    model: str,
    prompt: str,
    *,
    temperature: float = 0.4,
    max_output_tokens: int = 1024,
    response_mime_type: Optional[str] = None,
    timeout: float = 120.0,
) -> str:
    """Query Gemini generateContent and return the first text response."""
    if not GEMINI_API_KEY:
        raise GeminiError("GEMINI_API_KEY is not set in .env")

    url = f"{GEMINI_API_URL}/models/{model}:generateContent"
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
    }
    generation_config: Dict[str, Any] = {
        "temperature": temperature,
        "maxOutputTokens": max_output_tokens,
    }
    if response_mime_type:
        generation_config["responseMimeType"] = response_mime_type

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": generation_config,
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=headers, json=payload)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = response.text[:500]
            raise GeminiError(f"Gemini API error {response.status_code}: {detail}") from exc

    data = response.json()
    text = _extract_text(data)
    if not text:
        raise GeminiError(f"Gemini returned no text: {json.dumps(data)[:500]}")
    return text
