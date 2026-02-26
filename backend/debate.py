"""Core debate orchestration logic."""

import json as _json
import re as _re
from typing import AsyncGenerator, List, Dict, Any, Optional

from .openrouter import query_model, query_model_with_retry, query_model_streaming
from .config import POV_GENERATOR_MODEL


def build_debater_system_prompt(
    name: str,
    topic: str,
    pov: str,
    opponent_name: str,
    opponent_pov: str,
    max_turns: int,
    judged: bool = False,
) -> str:
    """Build the system prompt for a debater."""
    judge_note = ""
    if judged:
        judge_note = """
Judging criteria — an impartial judge will score you on:
- Argumentation: quality and logical structure of your core arguments
- Evidence & Reasoning: use of facts, examples, and supporting logic
- Rebuttal: how effectively you respond to your opponent's specific points
- Clarity: coherence and readability of your arguments
- Persuasiveness: overall rhetorical impact and persuasive skill
Optimise your arguments accordingly.
"""

    return f"""You are {name}, participating in a structured debate.

Topic: {topic}

Your position: {pov}

Your opponent ({opponent_name}) holds the opposing view: {opponent_pov}
{judge_note}
Rules:
- Argue clearly and persuasively for your position.
- Respond directly to your opponent's most recent argument.
- Be concise but substantive. Aim for 2-4 paragraphs per turn.
- Do not concede your position or agree with your opponent.
- This debate will last {max_turns} rounds ({max_turns * 2} messages total).
- Do not introduce yourself or reference the debate format — just argue."""


def build_turn_messages(
    system_prompt: str,
    debate_history: List[Dict[str, Any]],
    speaker_name: str,
    opponent_name: str,
    turn_number: int = 1,
    max_turns: int = 10,
) -> List[Dict[str, str]]:
    """Build the message list for a debater's turn.

    Maps each turn to the appropriate role from this speaker's perspective:
    - This speaker's own turns → "assistant"
    - Opponent's turns → "user"

    If the history starts with this speaker's turn (i.e. they went first),
    a synthetic opening user prompt is prepended so the messages array is
    always user-first.
    """
    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

    turn_hint = f" [Turn {turn_number} of {max_turns}]"
    if turn_number == max_turns or turn_number == max_turns - 1:
        turn_hint += " — This is one of the final turns. Summarise your strongest points and deliver a compelling closing."
    elif turn_number == 1:
        turn_hint += " — Opening turn."

    if not debate_history:
        messages.append({"role": "user", "content": f"Make your opening argument.{turn_hint}"})
        return messages

    # If the first turn belongs to the current speaker we need a synthetic
    # prompt to satisfy the user-first constraint most models require.
    if debate_history[0]["speaker_name"] == speaker_name:
        messages.append({"role": "user", "content": "Make your opening argument."})

    for turn in debate_history:
        role = "assistant" if turn["speaker_name"] == speaker_name else "user"
        messages.append({"role": role, "content": turn["content"]})

    # If the last message is already from the assistant (i.e. the current
    # speaker just went), prompt for the next turn explicitly.
    if messages[-1]["role"] == "assistant":
        messages.append({
            "role": "user",
            "content": f"Now provide your next argument as {speaker_name}.{turn_hint}",
        })
    else:
        # Append turn context to the last user message (opponent's turn)
        messages[-1]["content"] += f"\n\n{turn_hint}"

    return messages


async def run_debate_turn(
    model: str,
    system_prompt: str,
    debate_history: List[Dict[str, Any]],
    speaker_name: str,
    opponent_name: str,
    turn_number: int = 1,
    max_turns: int = 10,
) -> Optional[str]:
    """Run a single debate turn and return the content string."""
    messages = build_turn_messages(
        system_prompt, debate_history, speaker_name, opponent_name,
        turn_number=turn_number, max_turns=max_turns,
    )
    result = await query_model_with_retry(model, messages, timeout=120.0)
    if result is None:
        return None
    return result.get("content")


async def run_debate_turn_streaming(
    model: str,
    system_prompt: str,
    debate_history: List[Dict[str, Any]],
    speaker_name: str,
    opponent_name: str,
    turn_number: int = 1,
    max_turns: int = 10,
) -> AsyncGenerator[str, None]:
    """Run a single debate turn, yielding tokens as they stream in."""
    messages = build_turn_messages(
        system_prompt, debate_history, speaker_name, opponent_name,
        turn_number=turn_number, max_turns=max_turns,
    )
    async for token in query_model_streaming(model, messages, timeout=120.0):
        yield token


async def generate_povs(topic: str, keywords: str = "") -> Dict[str, str]:
    """Generate two opposing POVs for a topic using an LLM."""
    prompt = f"Topic: {topic}"
    if keywords.strip():
        prompt += f"\nAngle to argue from: {keywords}"

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


_JUDGE_FACETS = [
    ("Argumentation", "Quality and logical structure of core arguments"),
    ("Evidence & Reasoning", "Use of facts, examples, and supporting logic"),
    ("Rebuttal", "Effectiveness in responding to the opponent's points"),
    ("Clarity", "Coherence, organisation, and readability of arguments"),
    ("Persuasiveness", "Overall rhetorical impact and persuasive skill"),
]


async def run_judge(
    judge_model: str,
    topic: str,
    model1_name: str,
    pov1: str,
    model2_name: str,
    pov2: str,
    turns: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Run a judge model over the full debate transcript and return a report card."""
    transcript_parts = []
    for turn in turns:
        transcript_parts.append(
            f"**{turn['speaker_name']} (Round {turn['turn_number']}):**\n{turn['content']}"
        )
    transcript = "\n\n---\n\n".join(transcript_parts)

    prompt = f"""You are an impartial debate judge. Read the full transcript below and score both debaters.

Topic: {topic}

{model1_name} argued: {pov1}
{model2_name} argued: {pov2}

FULL TRANSCRIPT:
{transcript}

---

Evaluate both debaters across 5 criteria. Be precise, fair, and decisive.

Respond with ONLY valid JSON in this exact structure:
{{
  "facets": [
    {{
      "name": "Argumentation",
      "description": "Quality and logical structure of core arguments",
      "model1_score": <integer 0-10>,
      "model2_score": <integer 0-10>,
      "model1_note": "<one sentence>",
      "model2_note": "<one sentence>"
    }},
    {{
      "name": "Evidence & Reasoning",
      "description": "Use of facts, examples, and supporting logic",
      "model1_score": <integer 0-10>,
      "model2_score": <integer 0-10>,
      "model1_note": "<one sentence>",
      "model2_note": "<one sentence>"
    }},
    {{
      "name": "Rebuttal",
      "description": "Effectiveness in responding to the opponent's points",
      "model1_score": <integer 0-10>,
      "model2_score": <integer 0-10>,
      "model1_note": "<one sentence>",
      "model2_note": "<one sentence>"
    }},
    {{
      "name": "Clarity",
      "description": "Coherence, organisation, and readability of arguments",
      "model1_score": <integer 0-10>,
      "model2_score": <integer 0-10>,
      "model1_note": "<one sentence>",
      "model2_note": "<one sentence>"
    }},
    {{
      "name": "Persuasiveness",
      "description": "Overall rhetorical impact and persuasive skill",
      "model1_score": <integer 0-10>,
      "model2_score": <integer 0-10>,
      "model1_note": "<one sentence>",
      "model2_note": "<one sentence>"
    }}
  ],
  "winner": "<use the exact name '{model1_name}' or '{model2_name}' or the string 'Draw'>",
  "summary": "<2-3 sentences explaining your verdict>"
}}

Output only valid JSON. No markdown fences, no preamble, no trailing text."""

    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert, impartial debate judge. "
                "You evaluate arguments on their logical merit, use of evidence, rebuttal quality, clarity, and persuasiveness. "
                "You are rigorous, fair, and decisive. You always output valid JSON exactly as instructed."
            ),
        },
        {"role": "user", "content": prompt},
    ]
    result = await query_model(judge_model, messages, timeout=180.0)

    if result is None:
        raise ValueError(f"Judge model '{judge_model}' failed to respond")

    content = result.get("content", "").strip()

    # Strip markdown code fences if present
    if "```" in content:
        lines = content.splitlines()
        json_lines = []
        in_block = False
        for line in lines:
            if line.strip().startswith("```"):
                in_block = not in_block
                continue
            if in_block:
                json_lines.append(line)
        content = "\n".join(json_lines).strip()

    # Parse JSON
    try:
        data = _json.loads(content)
    except _json.JSONDecodeError:
        match = _re.search(r'\{.*\}', content, _re.DOTALL)
        if match:
            data = _json.loads(match.group())
        else:
            raise ValueError(f"Could not parse judge response as JSON. Raw: {content[:300]}")

    # Attach totals and metadata
    facets = data.get("facets", [])
    data["total_model1"] = sum(f.get("model1_score", 0) for f in facets)
    data["total_model2"] = sum(f.get("model2_score", 0) for f in facets)
    data["model1_name"] = model1_name
    data["model2_name"] = model2_name
    data["judge_model"] = judge_model

    return data


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
