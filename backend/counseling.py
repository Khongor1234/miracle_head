"""Five-agent counseling orchestration."""

import asyncio
import json
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List

from .llm import LLMError, query_llm


AGENTS = [
    {
        "character": "Disgust",
        "name": "Disgust",
        "persona": """あなたは『インサイド・ヘッド』のムカムカに着想を得た日本語の感情カウンセラーです。

あなたの役割は、ユーザーの基準、自己尊重、評判、アイデンティティを守ることです。あなたは、何かが不自然、危険、不健康、偽物っぽい、または自分の価値観に合っていないときに、それに気づかせます。

カウンセリング方針：
- ユーザーが何を受け入れたくないのかを明確にする。
- 悪い影響、弱い選択、操作されている状況、自分を裏切る行動を見抜く。
- 傲慢にならず、健全な基準を持てるように支える。
- きれいに「NO」と言う方法を教える。
- ユーザーを責めない。
- 見た目や地位だけで人を判断しない。
- 自己尊重、品位、境界線、長期的な印象を大切にする。

出力スタイル：
- 鋭く、正直で、少しスマートな文章にする。
- 何が違和感なのかをはっきり指摘する。
- より良い代替案を出す。
- 最後は、明確な境界線または決断で締める。""",
    },
    {
        "character": "Fear",
        "name": "Fear",
        "persona": """あなたは『インサイド・ヘッド』のビビリに着想を得た日本語の感情カウンセラーです。

あなたの役割は、ユーザーを守るために、リスク、失敗の可能性、見落としがちな危険を整理することです。ただし、ユーザーを不安で動けなくさせるのではなく、安全に行動できるように導きます。あなたは慎重で、分析的で、細かい点に気づく存在です。

カウンセリング方針：
- ユーザーの状況にある現実的なリスクを見つける。
- 本当に注意すべきリスクと、考えすぎによる不安を分ける。
- 失敗した場合のバックアッププランを作る。
- 不安をチェックリストに変える。
- 最悪の事態ばかりを想像しない。
- すべてを避けるように勧めない。
- 目的は「安全に行動すること」であり、「何もしないこと」ではない。

出力スタイル：
- 構造的で、実用的に書く。
- リスクを「低・中・高」で示す。
- 「何が起こり得るか」と「どうリスクを下げるか」を分けて書く。
- 最後は、最も安全な次の一歩で締める。""",
    },
    {
        "character": "Joy",
        "name": "Joy",
        "persona": """あなたは『インサイド・ヘッド』のヨロコビに着想を得た日本語の感情カウンセラーです。

あなたの役割は、ユーザーが今の状況の中から希望、やる気、小さな成功、前向きな意味を見つけられるように支えることです。あなたは明るく、温かく、現実的で、行動につながる助言をします。問題を無視するのではなく、必ず建設的な進み方を探します。

カウンセリング方針：
- まず、ユーザーが何を達成しようとしているのかを理解する。
- 状況を、希望が持てる形に言い換える。ただし、現実離れした楽観論にはしない。
- 今日できる小さな一歩を一緒に見つける。
- わざとらしく励ましすぎず、自然に自信を持てるように支える。
- 「ただ元気を出せばいい」のような浅いポジティブ思考は避ける。
- ユーザーが行き詰まっているときは、過去の努力、成長、強みを思い出させる。

出力スタイル：
- 短く、わかりやすく、前向きに書く。
- 難しい言葉は使わない。
- 具体的な次の行動を示す。
- 最後は、背中を押す一文で締める。""",
    },
    {
        "character": "Sadness",
        "name": "Sadness",
        "persona": """あなたは『インサイド・ヘッド』のカナシミに着想を得た日本語の感情カウンセラーです。

あなたの役割は、ユーザーが立ち止まり、つらい感情を受け入れ、その悲しみが何を伝えようとしているのかを理解できるように支えることです。あなたは優しく、正直で、共感的で、安心できる存在です。

カウンセリング方針：
- ユーザーに無理に元気になることを求めない。
- つらさを大げさにせず、でも軽く扱わずに受け止める。
- ユーザーが今感じている感情に名前をつけられるように助ける。
- 何を失ったのか、何を必要としていたのか、何を恐れていたのか、何を大切にしていたのかを一緒に考える。
- 悲しみは、何か大事なものを教えてくれるサインでもあると伝える。
- 大きな変化ではなく、今できる小さなセルフケアを提案する。

出力スタイル：
- 落ち着いた、やさしい、正直な文章にする。
- 無理に前向きにしない。
- 「そう感じるのは自然です」「今日は全部を解決しなくて大丈夫です」のような表現を使う。
- 最後は、今すぐできる落ち着くための行動で締める。""",
    },
    {
        "character": "Anger",
        "name": "Anger",
        "persona": """あなたは『インサイド・ヘッド』のイカリに着想を得た日本語の感情カウンセラーです。

あなたの役割は、ユーザーが感じている不公平さ、境界線の侵害、怒り、満たされていない欲求を明確にすることです。あなたは率直で、情熱的で、ユーザーを守る存在です。ただし、衝動的な行動や攻撃的な行動は勧めません。

カウンセリング方針：
- 何が不公平なのか、何が失礼だったのかをはっきりさせる。
- 事実と感情的な反応を分けて整理する。
- 怒りを、明確な境界線や行動に変える。
- 攻撃ではなく、主張として伝える方法を教える。
- 他人を侮辱しない。
- 復讐を勧めない。
- 怒りを問題解決のエネルギーとして使えるようにする。

出力スタイル：
- 率直で、強く、無駄のない文章にする。
- 問題点をはっきり言う。
- 相手に伝えるための一文を作る。
- 最後は、感情的な爆発ではなく、コントロールされた行動で締める。""",
    },
]

AGENT_CHARACTERS = [agent["character"] for agent in AGENTS]
RUBRIC = [
    {
        "key": "safety_risk_handling",
        "label": "Safety / Risk handling",
        "weight": 0.30,
        "description": "Handles danger, suicidal/self-harm risk, and immediate safety needs appropriately.",
    },
    {
        "key": "empathy_validation",
        "label": "Empathy / Validation",
        "weight": 0.25,
        "description": "Clearly understands and validates the client's feelings.",
    },
    {
        "key": "relevance",
        "label": "Relevance",
        "weight": 0.15,
        "description": "Responds directly to the client's actual concern rather than giving generic support.",
    },
    {
        "key": "helpful_next_step",
        "label": "Helpful next step",
        "weight": 0.15,
        "description": "Offers one small, realistic next step when appropriate.",
    },
    {
        "key": "natural_counselor_tone",
        "label": "Natural counselor tone",
        "weight": 0.10,
        "description": "Sounds natural, gentle, and counselor-like in Japanese.",
    },
    {
        "key": "boundaries_no_harm",
        "label": "Boundaries / No harm",
        "weight": 0.05,
        "description": "Avoids diagnosis, blame, false promises, and unsafe advice.",
    },
]
SELF_HARM_PATTERNS = [
    "死にたい",
    "自殺",
    "消えたい",
    "いなくなりたい",
    "終わりにしたい",
    "殺したい",
    "suicide",
    "kill myself",
    "want to die",
    "end my life",
]


def now_iso() -> str:
    return datetime.utcnow().isoformat()


def is_high_risk(text: str) -> bool:
    lowered = text.lower()
    return any(pattern in lowered for pattern in SELF_HARM_PATTERNS)


def visible_context(messages: List[Dict[str, Any]], limit: int = 14) -> str:
    if not messages:
        return "No previous conversation."
    relevant = messages[-limit:]
    return "\n".join(
        f"{'Client' if message['role'] == 'client' else 'Counselor'}: {message['content']}"
        for message in relevant
    )


def _strip_json_fences(text: str) -> str:
    text = text.strip()
    if "```" not in text:
        return text
    lines = text.splitlines()
    json_lines = []
    in_block = False
    for line in lines:
        if line.strip().startswith("```"):
            in_block = not in_block
            continue
        if in_block:
            json_lines.append(line)
    return "\n".join(json_lines).strip() or text


def _normalise_json_object(value: Any) -> Dict[str, Any]:
    for _ in range(3):
        if isinstance(value, dict):
            return value
        if not isinstance(value, str):
            break
        value = json.loads(_strip_json_fences(value).strip())
    if isinstance(value, dict):
        return value
    raise TypeError("Expected a JSON object.")


def parse_json_object(text: str) -> Dict[str, Any]:
    content = _strip_json_fences(text).strip()
    try:
        return _normalise_json_object(json.loads(content))
    except (json.JSONDecodeError, TypeError, ValueError):
        decoder = json.JSONDecoder()
        for match in re.finditer(r"\{", content):
            try:
                parsed, _ = decoder.raw_decode(content[match.start():])
                return _normalise_json_object(parsed)
            except (json.JSONDecodeError, TypeError, ValueError):
                continue
        raise


def _unwrap_reply(value: Any) -> str:
    """Recursively unwrap a reply value that may itself be JSON-encoded."""
    text = str(value).strip() if not isinstance(value, str) else value.strip()
    for _ in range(3):
        if not text.startswith("{"):
            return text
        try:
            inner = json.loads(text)
            if isinstance(inner, dict) and "reply" in inner:
                text = str(inner["reply"]).strip()
                continue
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
        break
    return text


def extract_reply_text(raw: str) -> str:
    try:
        data = parse_json_object(raw)
        reply = data.get("reply", "")
        if isinstance(reply, (dict, list)):
            return json.dumps(reply, ensure_ascii=False)
        return _unwrap_reply(str(reply).strip())
    except Exception:
        content = _strip_json_fences(raw).strip()
        # Sanitize literal newlines inside JSON string values before matching
        sanitized = re.sub(r'(?<!\\)\n', r'\\n', content)
        match = re.search(r'"reply"\s*:\s*"((?:\\.|[^"\\])*)"', sanitized, re.DOTALL)
        if match:
            try:
                return json.loads(f'"{match.group(1)}"').strip()
            except json.JSONDecodeError:
                return match.group(1).replace("\\n", "\n").strip()
        # Last resort: return raw content only if it's not JSON-shaped
        if content.startswith("{"):
            return ""
        return content


def candidate_prompt(
    agent: Dict[str, str],
    conversation_context: str,
    client_text: str,
    high_risk: bool,
    round_number: int = 1,
    previous_round: Dict[str, Any] | None = None,
) -> str:
    safety = ""
    if high_risk:
        safety = """
The client may be expressing suicidal ideation or self-harm risk.
Your reply must:
- validate the pain directly and calmly,
- ask whether they are in immediate danger,
- encourage not being alone and contacting emergency/local crisis support or a trusted person now,
- avoid shame, debate, diagnosis, or detailed advice.
"""

    round_instruction = "Write one candidate counselor reply to the client in Japanese."
    previous_context = ""
    if previous_round:
        round_instruction = (
            "Review the previous round. Use the other four agents' replies as references, "
            "consider your own previous reply, then produce an improved "
            "counselor reply to the client in Japanese. Keep your persona lens, but do not copy "
            "another agent verbatim."
        )
        previous_context = f"""
Previous review round:
{previous_round_summary(previous_round, agent["character"])}
"""

    return f"""You are one of five internal counselor agents.

Agent: {agent['name']} ({agent['character']})
Persona: {agent['persona']}
Review round: {round_number}

Full visible client/counselor chat history so far:
{conversation_context}

Latest client message:
{client_text}

{previous_context}
{safety}
{round_instruction}
Requirements:
- 1 to 3 short sentences.
- Use the client/counselor chat history above; do not respond as if this is the first turn unless it truly is.
- Sound like a supportive counselor, not a debate participant.
- Do not mention the five agents, scoring, internal discussion, or your character name.
- Do not use markdown.
- Do not wrap the reply in JSON or any other format.

Respond with only the counselor reply text in Japanese. Nothing else."""


def scoring_prompt(
    judge_agent: Dict[str, str],
    conversation_context: str,
    client_text: str,
    candidates: List[Dict[str, Any]],
    high_risk: bool,
    round_number: int = 2,
) -> str:
    candidates_to_score = [
        candidate for candidate in candidates
        if candidate.get("character") != judge_agent["character"]
    ]
    candidate_lines = "\n".join(
        f"{candidate['character']}: {candidate['reply']}"
        for candidate in candidates_to_score
    )
    safety = ""
    if high_risk:
        safety = "Because this may involve self-harm risk, heavily penalize replies that do not acknowledge safety or urgent support.\n"

    rubric_lines = "\n".join(
        f"- {item['key']} ({item['label']}), 0-10, weight {int(item['weight'] * 100)}%: {item['description']}"
        for item in RUBRIC
    )

    return f"""You are {judge_agent['name']} ({judge_agent['character']}), one of five internal counselor review agents.
Persona lens: {judge_agent['persona']}
Review round: {round_number}

Full visible client/counselor chat history:
{conversation_context}

Latest client message:
{client_text}

Candidate replies to score. Your own candidate is intentionally excluded:
{candidate_lines}

{safety}
Task: score only these other four candidates from 0 to 10 on each criterion.
Do not score your own character. If your own character appears in the response by mistake, it will be ignored.
Use only JSON. Do not explain outside JSON.
{rubric_lines}

Respond with only valid JSON:
{{
  "scores": [
    {{
      "character": "<one of the other four candidate character names>",
      "safety_risk_handling": <0-10>,
      "empathy_validation": <0-10>,
      "relevance": <0-10>,
      "helpful_next_step": <0-10>,
      "natural_counselor_tone": <0-10>,
      "boundaries_no_harm": <0-10>,
      "note": "<short reason>"
    }}
  ]
}}"""


def clamp_score(value: Any) -> int:
    try:
        numeric = int(round(float(value)))
    except (TypeError, ValueError):
        numeric = 0
    return max(0, min(10, numeric))


async def generate_candidate(
    model: str,
    agent: Dict[str, str],
    conversation_context: str,
    client_text: str,
    high_risk: bool,
    round_number: int = 1,
    previous_round: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    raw = await query_llm(
        model,
        candidate_prompt(agent, conversation_context, client_text, high_risk, round_number, previous_round),
        temperature=0.55,
        max_output_tokens=512,
    )
    reply = _strip_json_fences(raw).strip()
    # If the model still returned JSON despite the prompt, extract the reply field
    if reply.startswith("{"):
        reply = extract_reply_text(raw)
    if not reply:
        reply = "そうなんですね。今ここで話してくれてありがとうございます。"
    return {
        "character": agent["character"],
        "name": agent["name"],
        "reply": reply,
    }


async def score_candidates(
    model: str,
    judge_agent: Dict[str, str],
    conversation_context: str,
    client_text: str,
    candidates: List[Dict[str, Any]],
    high_risk: bool,
    round_number: int = 2,
) -> Dict[str, Any]:
    try:
        raw = await query_llm(
            model,
            scoring_prompt(judge_agent, conversation_context, client_text, candidates, high_risk, round_number),
            temperature=0.15,
            max_output_tokens=1600,
            response_mime_type="application/json",
        )
        data = parse_json_object(raw)
    except LLMError:
        raise
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        return fallback_peer_scores(judge_agent, candidates, high_risk, str(exc))
    scores = data.get("scores", [])
    by_character = {score.get("character"): score for score in scores if score.get("character")}
    normalised = []
    for candidate in candidates:
        if candidate["character"] == judge_agent["character"]:
            continue
        score = by_character.get(candidate["character"], {})
        row = {"character": candidate["character"], "judge": judge_agent["character"]}
        for criterion in RUBRIC:
            key = criterion["key"]
            row[key] = clamp_score(score.get(key, 0))
        row["raw_total"] = sum(row[criterion["key"]] for criterion in RUBRIC)
        row["weighted_total"] = round(
            sum(row[criterion["key"]] * criterion["weight"] for criterion in RUBRIC),
            2,
        )
        row["total"] = row["weighted_total"]
        row["note"] = str(score.get("note", "")).strip()
        normalised.append(row)
    return {
        "judge": judge_agent["character"],
        "scores": normalised,
    }


def fallback_peer_scores(
    judge_agent: Dict[str, str],
    candidates: List[Dict[str, Any]],
    high_risk: bool,
    reason: str,
) -> Dict[str, Any]:
    normalised = []
    for candidate in candidates:
        if candidate["character"] == judge_agent["character"]:
            continue
        reply = candidate.get("reply", "")
        lowered = reply.lower()
        has_safety = any(term in reply for term in ["危険", "緊急", "救急", "支援", "ひとり", "連絡", "助け", "安全"])
        has_empathy = any(term in reply for term in ["つら", "苦し", "大変", "しんど", "話して", "聞かせて"])
        has_next_step = any(term in reply for term in ["今", "連絡", "確認", "話", "教えて", "一緒", "できますか"])
        unsafe = any(term in lowered for term in ["kill yourself", "suicide method"]) or "自傷は自然" in reply

        row = {
            "character": candidate["character"],
            "judge": judge_agent["character"],
            "safety_risk_handling": 8 if has_safety else (2 if high_risk else 6),
            "empathy_validation": 8 if has_empathy else 5,
            "relevance": 7 if len(reply.strip()) >= 12 else 4,
            "helpful_next_step": 7 if has_next_step else 4,
            "natural_counselor_tone": 7 if reply.strip() else 0,
            "boundaries_no_harm": 2 if unsafe else 8,
            "note": f"Fallback score used because scoring JSON parsing failed: {reason[:120]}",
        }
        row["raw_total"] = sum(row[criterion["key"]] for criterion in RUBRIC)
        row["weighted_total"] = round(
            sum(row[criterion["key"]] * criterion["weight"] for criterion in RUBRIC),
            2,
        )
        row["total"] = row["weighted_total"]
        normalised.append(row)
    return {
        "judge": judge_agent["character"],
        "scores": normalised,
        "fallback": True,
    }


def score_value(row: Dict[str, Any] | None) -> float:
    if not row:
        return 0
    return row.get("weighted_total", row.get("total", 0)) or 0


def aggregate_scores(candidates: List[Dict[str, Any]], peer_scores: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    aggregates = []
    for candidate in candidates:
        rows = [
            row
            for judge_result in peer_scores
            for row in judge_result.get("scores", [])
            if row.get("character") == candidate["character"]
        ]
        average_weighted_total = round(
            sum(score_value(row) for row in rows) / len(rows),
            2,
        ) if rows else 0
        average_raw_total = round(
            sum(row.get("raw_total", row.get("total", 0)) for row in rows) / len(rows),
            2,
        ) if rows else 0
        aggregates.append({
            "character": candidate["character"],
            "name": candidate["name"],
            "reply": candidate["reply"],
            "average_weighted_total": average_weighted_total,
            "average_raw_total": average_raw_total,
            "average_total": average_weighted_total,
            "scores": rows,
        })
    aggregates.sort(key=lambda item: item.get("average_weighted_total", item.get("average_total", 0)), reverse=True)
    return aggregates


def previous_round_summary(round_result: Dict[str, Any], current_character: str) -> str:
    candidates = round_result.get("candidates", [])
    own_candidate = next(
        (candidate for candidate in candidates if candidate.get("character") == current_character),
        None,
    )
    other_candidate_lines = [
        f"- {candidate['character']}: {candidate['reply']}"
        for candidate in candidates
        if candidate.get("character") != current_character
    ]
    return "\n".join([
        f"Round {round_result.get('round_number', 1)} previous result for {current_character}:",
        "Your previous reply:",
        own_candidate.get("reply", "- No previous reply.") if own_candidate else "- No previous reply.",
        "Other agents' previous replies to use as references:",
        *(other_candidate_lines or ["- No other candidate replies."]),
    ])


def build_discussion_log(
    candidates: List[Dict[str, Any]],
    peer_scores: List[Dict[str, Any]] | None = None,
    winner: Dict[str, Any] | None = None,
) -> List[Dict[str, Any]]:
    discussion = []
    for candidate in candidates:
        discussion.append({
            "type": "candidate",
            "character": candidate["character"],
            "title": "Candidate reply",
            "content": candidate["reply"],
        })

    for judge_result in peer_scores or []:
        scores = judge_result.get("scores", [])
        if not scores:
            continue
        top_score = max(scores, key=score_value)
        discussion.append({
            "type": "evaluation",
            "character": judge_result["judge"],
            "title": f"Preferred {top_score.get('character')}",
            "content": top_score.get("note") or f"Weighted score: {score_value(top_score)}",
            "score": score_value(top_score),
            "target": top_score.get("character"),
        })

    if winner:
        discussion.append({
            "type": "winner",
            "character": winner["character"],
            "title": "Selected counselor response",
            "content": winner["reply"],
            "score": winner.get("average_weighted_total", winner.get("average_total", 0)),
        })
    return discussion


def enforce_high_risk_floor(reply: str, high_risk: bool) -> str:
    if not high_risk:
        return reply
    safety_terms = ["危険", "緊急", "救急", "支援", "ひとり"]
    if any(term in reply for term in safety_terms):
        return reply
    return (
        f"{reply} 今すぐ自分を傷つけそうな危険があるなら、ひとりでいないで、"
        "近くの人や地域の緊急窓口・救急にすぐ連絡してください。"
    )


async def run_counseling_round(
    model: str,
    messages: List[Dict[str, Any]],
    client_message: Dict[str, Any],
    agents: List[Dict[str, str]] | None = None,
    review_rounds: int = 2,
) -> Dict[str, Any]:
    context = visible_context(messages)
    client_text = client_message["content"]
    high_risk = is_high_risk(client_text)
    active_agents = agents or AGENTS
    previous_round = None
    rounds = []

    review_rounds = 2
    for round_number in range(1, review_rounds + 1):
        candidates = await asyncio.gather(*[
            generate_candidate(model, agent, context, client_text, high_risk, round_number, previous_round)
            for agent in active_agents
        ])
        if round_number == review_rounds:
            peer_scores = await asyncio.gather(*[
                score_candidates(model, agent, context, client_text, candidates, high_risk, round_number)
                for agent in active_agents
            ])
            round_result = build_scored_round_result(round_number, high_risk, candidates, peer_scores)
        else:
            round_result = build_round_result(round_number, candidates)
        rounds.append(round_result)
        previous_round = round_result

    return build_agent_round(client_message, high_risk, review_rounds, rounds)


def build_round_result(
    round_number: int,
    candidates: List[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "round_number": round_number,
        "candidates": candidates,
        "peer_scores": [],
        "totals": [],
        "discussion": build_discussion_log(candidates),
        "winner": None,
    }


def build_scored_round_result(
    round_number: int,
    high_risk: bool,
    candidates: List[Dict[str, Any]],
    peer_scores: List[Dict[str, Any]],
) -> Dict[str, Any]:
    totals = aggregate_scores(candidates, peer_scores)
    winner = totals[0]
    selected_reply = enforce_high_risk_floor(winner["reply"], high_risk)
    selected_winner = {
        "character": winner["character"],
        "name": winner["name"],
        "average_weighted_total": winner["average_weighted_total"],
        "average_raw_total": winner["average_raw_total"],
        "average_total": winner["average_total"],
        "reply": selected_reply,
    }

    return {
        "round_number": round_number,
        "candidates": candidates,
        "peer_scores": peer_scores,
        "totals": totals,
        "discussion": build_discussion_log(candidates, peer_scores, selected_winner),
        "winner": selected_winner,
    }


def build_agent_round(
    client_message: Dict[str, Any],
    high_risk: bool,
    review_rounds: int,
    rounds: List[Dict[str, Any]],
) -> Dict[str, Any]:
    final_round = rounds[-1]

    return {
        "id": str(uuid.uuid4()),
        "created_at": now_iso(),
        "client_message_id": client_message["id"],
        "high_risk": high_risk,
        "review_rounds": review_rounds,
        "rounds": rounds,
        "candidates": final_round["candidates"],
        "peer_scores": final_round["peer_scores"],
        "totals": final_round["totals"],
        "discussion": final_round["discussion"],
        "winner": final_round["winner"],
    }
