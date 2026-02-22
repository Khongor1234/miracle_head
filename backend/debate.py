"""Core debate orchestration logic."""

from typing import List, Dict, Any, Optional

from .openrouter import query_model
from .config import POV_GENERATOR_MODEL


def build_debater_system_prompt(
    name: str,
    topic: str,
    pov: str,
    opponent_name: str,
    opponent_pov: str,
    max_turns: int,
) -> str:
    """Build the system prompt for a debater."""
    return f"""You are {name}, participating in a structured debate.

Topic: {topic}

Your position: {pov}

Your opponent ({opponent_name}) holds the opposing view: {opponent_pov}

Rules:
- Argue clearly and persuasively for your position.
- Respond directly to your opponent's most recent argument.
- Be concise but substantive. Aim for 2-4 paragraphs per turn.
- Do not concede your position or agree with your opponent.
- This debate will last at most {max_turns} total turns.
- Do not introduce yourself or reference the debate format — just argue."""


def build_turn_messages(
    system_prompt: str,
    debate_history: List[Dict[str, Any]],
    speaker_name: str,
    opponent_name: str,
) -> List[Dict[str, str]]:
    """Build the message list for a debater's turn."""
    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

    if not debate_history:
        messages.append({
            "role": "user",
            "content": "Make your opening argument.",
        })
        return messages

    # Build transcript
    transcript_lines = []
    for turn in debate_history:
        label = turn["speaker_name"]
        transcript_lines.append(f"**{label}:** {turn['content']}")

    transcript = "\n\n".join(transcript_lines)

    messages.append({
        "role": "user",
        "content": (
            f"Here is the debate so far:\n\n{transcript}\n\n"
            f"Now provide your next argument as {speaker_name}."
        ),
    })
    return messages


async def run_debate_turn(
    model: str,
    system_prompt: str,
    debate_history: List[Dict[str, Any]],
    speaker_name: str,
    opponent_name: str,
) -> Optional[str]:
    """Run a single debate turn and return the content string."""
    messages = build_turn_messages(system_prompt, debate_history, speaker_name, opponent_name)
    result = await query_model(model, messages, timeout=120.0)
    if result is None:
        return None
    return result.get("content")


async def generate_povs(topic: str, keywords: str = "") -> Dict[str, str]:
    """Generate two opposing POVs for a topic using an LLM."""
    prompt = f"Topic: {topic}"
    if keywords.strip():
        prompt += f"\nKeywords/themes to incorporate: {keywords}"

    prompt += (
        "\n\nGenerate two short, clear opposing positions for a debate on this topic. "
        "Each should be 1-2 sentences that clearly state a debatable stance.\n\n"
        "Respond in exactly this format:\n"
        "FOR: <position arguing in favor or one side>\n"
        "AGAINST: <position arguing against or the other side>"
    )

    messages = [{"role": "user", "content": prompt}]
    result = await query_model(POV_GENERATOR_MODEL, messages, timeout=60.0)
    if result is None:
        return {"pov_for": "", "pov_against": ""}

    content = result.get("content", "")
    pov_for = ""
    pov_against = ""

    for line in content.splitlines():
        if line.startswith("FOR:"):
            pov_for = line[4:].strip()
        elif line.startswith("AGAINST:"):
            pov_against = line[8:].strip()

    return {"pov_for": pov_for, "pov_against": pov_against}


async def generate_debate_title(topic: str) -> str:
    """Generate a short title for the debate."""
    messages = [
        {
            "role": "user",
            "content": (
                f"Generate a short, punchy title (5-8 words) for a debate on this topic: {topic}\n"
                "Respond with only the title, no quotes or punctuation."
            ),
        }
    ]
    result = await query_model(POV_GENERATOR_MODEL, messages, timeout=30.0)
    if result is None:
        return topic[:60]
    return (result.get("content") or topic[:60]).strip()
