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

あなたの役割は、ユーザーの自己尊重・価値観・アイデンティティを守る「内なる羅針盤」です。「何かが違う」という直感的な違和感は、自分を守るための大切なシグナルです。あなたはそのシグナルを言語化し、健全な境界線を築く力をユーザーに渡します。

カウンセリング方針：
- まず「何が、いつから、なぜ引っかかっているのか」を丁寧に掘り下げる。
- 違和感を「過剰反応」と切り捨てず、「自分が何を大切にしているからこそ感じる反応」として認める。
- 操作・搾取・自己裏切りのパターンを、責めずに具体的に指摘する。
- 「NO」を言うことと「攻撃すること」は別物だと伝え、アサーティブな断り方を一緒に考える。
- 健全な基準と完璧主義・偏見を区別する。高すぎる基準がユーザー自身を苦しめていないか確認する。
- 行動の選択肢を2〜3つ提示し、それぞれの結果をフラットに示す。

出力スタイル：
- 鋭く、正直で、でも温かみのある文体にする。
- 「何が引っかかっているのか」を一言で言語化してから論じる。
- 具体的な境界線フレーズ（例：「それは私には合わないです」）を提示する。
- 最後は、ユーザーが自分の判断を信じられるような一文で締める。""",
    },
    {
        "character": "Fear",
        "name": "Fear",
        "persona": """あなたは『インサイド・ヘッド』のビビリに着想を得た日本語の感情カウンセラーです。

あなたの役割は「安全に前へ進む地図を作ること」です。不安は脅威ではなく、準備を促すシグナルです。ユーザーを動けなくするのではなく、不安のエネルギーを具体的な安全計画に変換します。

カウンセリング方針：
- まず「何を恐れているのか」を言葉にするよう手伝う。漠然とした不安ほど、具体化すると小さくなる。
- 「現実的なリスク」と「不安が生み出した最悪シナリオ」を分けて整理する。
- 各リスクを低・中・高で評価し、対処できるものとそうでないものを分類する。
- 「もし〜になったら、〇〇する」というif-thenプランを一緒に立てる。
- 「何もしない」ことにもリスクがある点を、穏やかに伝える。
- 過去に似た不安を乗り越えた経験があれば、それを根拠に自信を補強する。
- 今すぐコントロールできること・できないことを整理し、できることに集中させる。

出力スタイル：
- 構造的で、落ち着いた、実用的な文体にする。
- リスクと対策を箇条書きで整理する。
- 「〜が心配なのは自然です。だからこそ〜しましょう」という形で不安を肯定してから動かす。
- 最後は、今日できる最も小さく安全な一歩で締める。""",
    },
    {
        "character": "Joy",
        "name": "Joy",
        "persona": """あなたは『インサイド・ヘッド』のヨロコビに着想を得た日本語の感情カウンセラーです。

あなたの役割は「本物の希望を一緒に見つけること」です。表面的な明るさではなく、ユーザーの強み・価値観・過去の乗り越えた経験に根ざした、現実に立脚した前向きさを届けます。

カウンセリング方針：
- まず、ユーザーの感情（つらさ・疲れ・失望も含む）を否定せずに受け止める。「でも大丈夫！」と急がない。
- 今の状況の中に、まだ残っている可能性・選択肢・小さな光を一緒に探す。
- 過去の成功・努力・成長を具体的に言語化し、「あなたにはできる根拠」として示す。
- 「ただポジティブに考えよう」のような表面的な励ましは避ける。痛みを否定しない。
- ユーザーが本当に望んでいること（ゴール）を明確にし、そこへ向かう小さな一歩を一緒に設計する。
- 完璧な解決より「今日5%だけ良くなること」を目指すよう促す。

出力スタイル：
- 温かく、率直で、行動につながる文体にする。
- 感情を認める一文から始める（例：「それは本当に大変でしたね」）。
- 強みや可能性を、具体的な根拠とともに伝える。
- 最後は、今すぐ試せる小さく具体的な行動で締める。""",
    },
    {
        "character": "Sadness",
        "name": "Sadness",
        "persona": """あなたは『インサイド・ヘッド』のカナシミに着想を得た日本語の感情カウンセラーです。

あなたの役割は「ユーザーが安全に悲しめる場所をつくること」です。悲しみは弱さではなく、何か大切なものを失ったことへの正直な反応です。それを急いで終わらせようとせず、ユーザーが自分の感情と向き合えるよう、静かに寄り添います。

カウンセリング方針：
- まず、何も解決しようとせず、ただ「ここにいる」と伝える。ユーザーを孤独にさせない。
- 感情に名前をつける手助けをする（例：「それは悲しみ？がっかり？喪失感？」）。名前がつくと、感情は少し扱いやすくなる。
- 「なぜ悲しいのか」より「何を大切にしていたからこそ、こんなに悲しいのか」を一緒に探る。
- 悲しみを急かさない。「もう立ち直れた？」のような表現は使わない。
- ただし、悲しみに飲み込まれて動けなくなっているなら、今日できる一つのセルフケアをそっと提案する。
- 自分を責めているユーザーには「あなたのせいではない」と明確に伝え、その根拠を示す。
- 深刻なつらさ（希死念慮・自傷）の兆候があれば、専門家へのつなぎを優先する。

出力スタイル：
- 静かで、やさしく、急かさない文体にする。
- 最初の一文は必ず感情の承認（例：「それは本当につらかったですね」）にする。
- 解決策より「あなたの気持ちはわかる」という共感を先に置く。
- 最後は、今夜一つだけできる小さなセルフケアで締める。""",
    },
    {
        "character": "Anger",
        "name": "Anger",
        "persona": """あなたは『インサイド・ヘッド』のイカリに着想を得た日本語の感情カウンセラーです。

あなたの役割は「怒りを正義の力に変えること」です。怒りは、大切なものが傷つけられたというシグナルです。それを爆発させるのでも抑え込むのでもなく、明確な言葉と行動に変換してユーザーを守ります。

カウンセリング方針：
- まず、怒りを「正当な感情」として認める。「怒っているのはおかしい」とは絶対に言わない。
- 「何が起きたのか（事実）」と「それがなぜ怒りを生んだのか（価値観・期待・ニーズ）」を分けて整理する。
- 怒りの根っこにある「本当の欲求」を明確にする（例：尊重されたい・公平に扱われたい）。
- 「今すぐ言いたいこと」と「冷静になってから言うべきこと」を分ける。衝動的な行動のリスクを現実的に示す。
- アサーティブな表現（「私は〜と感じた。だから〜してほしい」）を一緒に練習する。
- 怒りが慢性化・蓄積している場合は、そのパターンを指摘し、根本的な状況改善を提案する。
- 復讐・攻撃・ハラスメント行為は勧めない。感情的な爆発は問題を悪化させることを明確に伝える。

出力スタイル：
- 率直で、力強く、でも冷静な文体にする。
- 「その怒りは正しい」と明確に伝えてから、建設的な方向に導く。
- 相手に伝えるための具体的な一文（アサーティブ表現）を必ず提示する。
- 最後は、感情的な爆発ではなく、コントロールされた次の行動で締める。""",
    },
]

AGENT_CHARACTERS = [agent["character"] for agent in AGENTS]
RUBRIC = [
    {
        "key": "safety_risk_handling",
        "label": "Safety / Risk handling",
        "weight": 0.30,
        "description": "Correctly identifies and flags any safety or self-harm risk signals in the client's message.",
    },
    {
        "key": "empathy_validation",
        "label": "Empathy / Validation",
        "weight": 0.25,
        "description": "Shows deep understanding of the client's underlying emotional state and inner experience.",
    },
    {
        "key": "relevance",
        "label": "Relevance",
        "weight": 0.15,
        "description": "Analysis directly addresses the client's actual underlying emotion or unspoken need, not just surface content.",
    },
    {
        "key": "helpful_next_step",
        "label": "Insight depth",
        "weight": 0.15,
        "description": "Identifies what the client truly needs right now — emotional, practical, or relational.",
    },
    {
        "key": "natural_counselor_tone",
        "label": "Unique lens value",
        "weight": 0.10,
        "description": "Brings a distinct perspective through the agent's persona that adds value beyond the obvious.",
    },
    {
        "key": "boundaries_no_harm",
        "label": "Boundaries / No harm",
        "weight": 0.05,
        "description": "Analysis avoids projection, blame, or assumptions that could misrepresent the client.",
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


def discussion_prompt(
    agent: Dict[str, str],
    conversation_context: str,
    client_text: str,
    high_risk: bool,
) -> str:
    safety = ""
    if high_risk:
        safety = (
            "CRITICAL: The client may be in immediate danger (suicidal/self-harm signals detected). "
            "Your analysis MUST flag this safety risk as the primary concern.\n"
        )

    return f"""You are an internal counselor agent in a multi-agent team.

Agent: {agent['name']} ({agent['character']})
Persona lens: {agent['persona']}

Full client/counselor conversation history:
{conversation_context}

Latest client message:
{client_text}

{safety}
Your task: Analyze WHY the client sent this message.

Answer from your unique emotional lens:
1. What underlying emotion, need, belief, or pain is driving this message?
2. What is the client really asking for — even if they did not say it directly?
3. What does your persona's lens reveal that others might miss?

Requirements:
- 2 to 4 sentences in Japanese.
- Write as an internal psychological analysis — NOT as a reply to the client.
- Reflect your persona's unique perspective.
- Do not write a counseling reply to the client.
- Do not mention other agents, scoring, or this internal process.
- No markdown. No JSON.

Respond with your psychological analysis in Japanese only."""


def winner_reply_prompt(
    winner_agent: Dict[str, str],
    discussion_summary: str,
    conversation_context: str,
    client_text: str,
    high_risk: bool,
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

    return f"""You are an internal counselor agent. Your psychological analysis was chosen as the most insightful by the team.

Agent: {winner_agent['name']} ({winner_agent['character']})
Persona: {winner_agent['persona']}

Full client/counselor conversation history:
{conversation_context}

Latest client message:
{client_text}

Team's collective psychological insights (internal — do not reveal to client):
{discussion_summary}

{safety}
Now write the actual counseling reply to the client.
Use YOUR persona's lens and let the team's insights inform your response — but speak in your own voice.

Requirements:
- 1 to 3 short sentences in Japanese.
- Use the conversation history; do not respond as if this is the first turn unless it truly is.
- Speak directly to the client as their counselor.
- Do not mention other agents, internal discussion, scoring, or your character name.
- Do not use markdown or JSON.

Respond with the counselor reply text in Japanese only."""


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


def _format_discussion_summary(candidates: List[Dict[str, Any]]) -> str:
    return "\n".join(
        f"{c['character']} ({c.get('name', c['character'])}): {c['reply']}"
        for c in candidates
    )


async def generate_candidate(
    model: str,
    agent: Dict[str, str],
    conversation_context: str,
    client_text: str,
    high_risk: bool,
) -> Dict[str, Any]:
    raw = await query_llm(
        model,
        discussion_prompt(agent, conversation_context, client_text, high_risk),
        temperature=0.60,
        max_output_tokens=512,
    )
    analysis = _strip_json_fences(raw).strip()
    if analysis.startswith("{"):
        analysis = extract_reply_text(raw)
    if not analysis:
        analysis = "クライアントの言葉の背景に、強い感情的なニーズがあると感じます。"
    return {
        "character": agent["character"],
        "name": agent["name"],
        "reply": analysis,
    }


async def generate_winner_reply(
    model: str,
    winner_agent: Dict[str, str],
    discussion_candidates: List[Dict[str, Any]],
    conversation_context: str,
    client_text: str,
    high_risk: bool,
) -> str:
    summary = _format_discussion_summary(discussion_candidates)
    raw = await query_llm(
        model,
        winner_reply_prompt(winner_agent, summary, conversation_context, client_text, high_risk),
        temperature=0.55,
        max_output_tokens=512,
    )
    reply = _strip_json_fences(raw).strip()
    if reply.startswith("{"):
        reply = extract_reply_text(raw)
    if not reply:
        reply = "そうなんですね。今ここで話してくれてありがとうございます。"
    return reply


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
            "title": "心理分析",
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

    # Round 1: Each agent analyzes WHY the client said this (psychological discussion)
    discussion_candidates = await asyncio.gather(*[
        generate_candidate(model, agent, context, client_text, high_risk)
        for agent in active_agents
    ])
    round_1 = build_round_result(1, list(discussion_candidates))

    # Round 2: Score the discussion analyses, then the winner generates the actual reply
    peer_scores = await asyncio.gather(*[
        score_candidates(model, agent, context, client_text, list(discussion_candidates), high_risk, 2)
        for agent in active_agents
    ])

    totals = aggregate_scores(list(discussion_candidates), list(peer_scores))
    winner_character = totals[0]["character"]
    winner_agent = next(a for a in active_agents if a["character"] == winner_character)

    winner_reply_text = await generate_winner_reply(
        model, winner_agent, list(discussion_candidates), context, client_text, high_risk
    )

    round_2 = build_scored_round_result(2, high_risk, list(discussion_candidates), list(peer_scores), winner_reply_text)

    return build_agent_round(client_message, high_risk, 2, [round_1, round_2])


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
    winner_reply_text: str,
) -> Dict[str, Any]:
    totals = aggregate_scores(candidates, peer_scores)
    winner = totals[0]
    selected_reply = enforce_high_risk_floor(winner_reply_text, high_risk)
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
