"""Local vLLM client (OpenAI-compatible API)."""

import asyncio
import os
from typing import Optional

import httpx

LOCAL_LLM_URL = os.getenv("LOCAL_LLM_URL", "http://localhost:8000")
LOCAL_LLM_MODEL = os.getenv("LOCAL_LLM_MODEL", "kokoro-chat")


class LocalLLMError(RuntimeError):
    pass


async def query_local_llm(
    model: str,
    prompt: str,
    *,
    temperature: float = 0.4,
    max_output_tokens: int = 1024,
    timeout: float = 120.0,
    retries: int = 2,
    **_kwargs,
) -> str:
    payload = {
        "model": model or LOCAL_LLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
        "max_tokens": max_output_tokens,
    }
    last_empty_detail = ""
    for attempt in range(retries + 1):
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{LOCAL_LLM_URL}/v1/chat/completions",
                json=payload,
                headers={"Authorization": "Bearer miracle_head"},
            )
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise LocalLLMError(f"vLLM error {resp.status_code}: {resp.text[:500]}") from exc

        data = resp.json()
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        text = str(message.get("content") or "").strip()
        if text:
            return text
        last_empty_detail = (
            f"finish_reason={choice.get('finish_reason')}, "
            f"model={data.get('model')}, usage={data.get('usage')}"
        )
        if attempt < retries:
            await asyncio.sleep(0.35 * (attempt + 1))

    raise LocalLLMError(f"vLLM returned empty response after {retries + 1} attempts ({last_empty_detail})")
