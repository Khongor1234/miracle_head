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


def parse_json_object(text: str) -> Dict[str, Any]:
    content = _strip_json_fences(text)
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise


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
- Do not mention the five agents, internal discussion, or your character name.
- Do not use markdown.

Respond with only valid JSON:
{{"reply": "<Japanese counselor reply>"}}"""


def synthesis_prompt(
    conversation_context: str,
    client_text: str,
    candidates: List[Dict[str, Any]],
    high_risk: bool,
) -> str:
    candidate_lines = "\n".join(
        f"{candidate['character']}: {candidate['reply']}"
        for candidate in candidates
    )
    safety = ""
    if high_risk:
        safety = """
The client may be expressing suicidal ideation or self-harm risk.
Your final reply must:
- validate the pain directly and calmly,
- ask whether they are in immediate danger,
- encourage not being alone and contacting emergency/local crisis support or a trusted person now,
- avoid shame, debate, diagnosis, or detailed advice.
"""

    return f"""You are the final counselor response synthesizer.

Full visible client/counselor chat history so far:
{conversation_context}

Latest client message:
{client_text}

Five internal counselor agents produced these revised replies:
{candidate_lines}

{safety}
Task:
- Synthesize the strongest parts of the five revised replies into one final counselor response in Japanese.
- Be warm, practical, and directly relevant to the client's latest message.
- Do not mention the agents, synthesis, scoring, or internal discussion.
- Do not use markdown.
- 1 to 3 short sentences.

Respond with only valid JSON:
{{"reply": "<Japanese final counselor reply>"}}"""


async def generate_candidate(
    model: str,
    agent: Dict[str, str],
    conversation_context: str,
    client_text: str,
    high_risk: bool,
    round_number: int = 1,
    previous_round: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    try:
        raw = await query_llm(
            model,
            candidate_prompt(agent, conversation_context, client_text, high_risk, round_number, previous_round),
            temperature=0.55,
            max_output_tokens=512,
            response_mime_type="application/json",
        )
    except LLMError:
        raw = (
            "今ここで話してくれてありがとうございます。"
            "まず安全を一緒に確認したいです。今すぐ自分を傷つけそうな危険はありますか。"
            if high_risk
            else "今ここで話してくれてありがとうございます。もう少し、そのつらさについて聞かせてください。"
        )
    try:
        data = parse_json_object(raw)
        reply = str(data.get("reply", "")).strip()
    except Exception:
        reply = raw.strip()
    if not reply:
        reply = "そうなんですね。今ここで話してくれてありがとうございます。"
    return {
        "character": agent["character"],
        "name": agent["name"],
        "reply": reply,
    }


async def synthesize_final_reply(
    model: str,
    conversation_context: str,
    client_text: str,
    candidates: List[Dict[str, Any]],
    high_risk: bool,
) -> str:
    try:
        raw = await query_llm(
            model,
            synthesis_prompt(conversation_context, client_text, candidates, high_risk),
            temperature=0.35,
            max_output_tokens=512,
            response_mime_type="application/json",
        )
    except LLMError:
        raise
    try:
        data = parse_json_object(raw)
        reply = str(data.get("reply", "")).strip()
    except Exception:
        reply = raw.strip()
    if not reply:
        raise LLMError("Final synthesizer returned an empty response.")
    return enforce_high_risk_floor(reply, high_risk)


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
) -> List[Dict[str, Any]]:
    """Create a readable internal discussion timeline for the UI."""
    discussion = []
    for candidate in candidates:
        discussion.append({
            "type": "candidate",
            "character": candidate["character"],
            "title": "Candidate reply",
            "content": candidate["reply"],
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
        round_result = build_round_result(round_number, candidates)
        rounds.append(round_result)
        previous_round = round_result

    final_reply = await synthesize_final_reply(model, context, client_text, rounds[-1]["candidates"], high_risk)
    return build_agent_round(client_message, high_risk, review_rounds, rounds, final_reply)


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


def build_agent_round(
    client_message: Dict[str, Any],
    high_risk: bool,
    review_rounds: int,
    rounds: List[Dict[str, Any]],
    final_reply: str,
) -> Dict[str, Any]:
    final_round = rounds[-1]
    winner = {
        "character": "Synthesizer",
        "name": "Synthesizer",
        "synthetic": True,
        "reply": final_reply,
    }

    return {
        "id": str(uuid.uuid4()),
        "created_at": now_iso(),
        "client_message_id": client_message["id"],
        "high_risk": high_risk,
        "review_rounds": review_rounds,
        "rounds": rounds,
        "candidates": final_round["candidates"],
        "peer_scores": [],
        "totals": [],
        "discussion": final_round["discussion"],
        "winner": winner,
    }
