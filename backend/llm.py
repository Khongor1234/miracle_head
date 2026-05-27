"""Route model requests to Gemini or the local OpenAI-compatible LLM."""

from .gemini import GeminiError, query_gemini
from .local_llm import LocalLLMError, query_local_llm


class LLMError(RuntimeError):
    """Raised when the selected LLM backend cannot return usable text."""


def is_gemini_model(model: str | None) -> bool:
    normalised = (model or "").strip().lower()
    return normalised.startswith("gemini") or normalised.startswith("models/gemini")


async def query_llm(
    model: str,
    prompt: str,
    *,
    temperature: float = 0.4,
    max_output_tokens: int = 1024,
    timeout: float = 120.0,
    **kwargs,
) -> str:
    try:
        if is_gemini_model(model):
            return await query_gemini(
                model,
                prompt,
                temperature=temperature,
                max_output_tokens=max_output_tokens,
                timeout=timeout,
                **kwargs,
            )
        return await query_local_llm(
            model,
            prompt,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            timeout=timeout,
            **kwargs,
        )
    except (GeminiError, LocalLLMError) as exc:
        raise LLMError(str(exc)) from exc
