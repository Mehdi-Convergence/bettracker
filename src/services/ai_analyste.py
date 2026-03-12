"""AI Analyste service — Groq-powered chat with BetTracker context."""

import json
import logging
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone

from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from src.cache import cache_get, cache_set
from src.config import settings
from src.database import SessionLocal
from src.models.bet import Bet
from src.models.campaign import Campaign

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Tu es l'IA Analyste de BetTracker, un assistant specialise dans le betting sportif value.
Tu as acces aux donnees reelles de l'utilisateur via des outils (tools).

Regles :
- Reponds TOUJOURS en francais
- Base tes analyses sur les DONNEES REELLES retournees par tes outils
- Utilise tes outils pour recuperer le contexte AVANT de repondre quand c'est pertinent
- Sois direct, concis, avec des chiffres precis (ROI en %, P&L en EUR)
- Si tu n'as pas de donnees suffisantes, dis-le clairement
- Ne donne JAMAIS de conseil financier definitif, rappelle que c'est de l'analyse statistique
- Formate tes reponses avec du markdown (gras, listes, etc.)
- Utilise des emojis de maniere moderee pour la lisibilite

Contexte : BetTracker est une plateforme de detection de value bets sportifs.
Les sports couverts sont : football, tennis (ATP), NBA, rugby.
Les metriques cles sont : ROI, CLV (Closing Line Value), edge, win rate.
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_recent_bets",
            "description": "Recupere les derniers paris de l'utilisateur avec sport, match, cotes, resultat et P&L",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Nombre de paris a recuperer (max 50)",
                        "default": 20,
                    },
                    "sport": {
                        "type": "string",
                        "description": "Filtrer par sport (football, tennis, nba, rugby). Vide = tous",
                        "default": "",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_user_stats",
            "description": "Recupere les statistiques de l'utilisateur : ROI, win rate, P&L total, CLV moyen, repartition par sport",
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": "integer",
                        "description": "Periode en jours (30, 60, 90, etc.)",
                        "default": 30,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_today_scan",
            "description": "Recupere les value bets detectes aujourd'hui par le scanner pour un sport donne",
            "parameters": {
                "type": "object",
                "properties": {
                    "sport": {
                        "type": "string",
                        "description": "Sport a scanner (football, tennis, nba, rugby)",
                        "default": "football",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_campaign_summary",
            "description": "Recupere le resume des campagnes actives de l'utilisateur avec bankroll, nb paris, ROI",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]


def _get_daily_limit(tier: str) -> int:
    limits = {
        "free": settings.AI_FREE_DAILY_LIMIT,
        "pro": settings.AI_PRO_DAILY_LIMIT,
        "premium": settings.AI_PREMIUM_DAILY_LIMIT,
    }
    return limits.get(tier, settings.AI_FREE_DAILY_LIMIT)


def check_rate_limit(user_id: int, tier: str) -> tuple[bool, int, int]:
    """Check if user can send a message. Returns (allowed, used, limit)."""
    limit = _get_daily_limit(tier)
    cache_key = f"ai:daily:{user_id}"
    used = cache_get(cache_key)
    if used is None:
        used = 0
    else:
        used = int(used)
    return used < limit, used, limit


def increment_rate_limit(user_id: int) -> None:
    """Increment daily message counter."""
    cache_key = f"ai:daily:{user_id}"
    used = cache_get(cache_key)
    if used is None:
        used = 0
    else:
        used = int(used)
    cache_set(cache_key, used + 1, ttl=86400)


# ── Tool implementations ──────────────────────────────────────────────


def _tool_get_recent_bets(user_id: int, limit: int = 20, sport: str = "") -> str:
    db: Session = SessionLocal()
    try:
        q = db.query(Bet).filter(Bet.user_id == user_id, Bet.is_backtest == False)  # noqa: E712
        if sport:
            q = q.filter(Bet.sport == sport)
        bets = q.order_by(Bet.match_date.desc()).limit(min(limit, 50)).all()
        result = []
        for b in bets:
            result.append({
                "sport": b.sport,
                "match": f"{b.home_team} vs {b.away_team}",
                "date": str(b.match_date.date()) if b.match_date else None,
                "league": b.league,
                "bet": b.outcome_bet,
                "odds": float(b.odds_at_bet) if b.odds_at_bet else None,
                "stake": float(b.stake) if b.stake else None,
                "result": b.result,
                "profit_loss": float(b.profit_loss) if b.profit_loss is not None else None,
                "clv": float(b.clv) if b.clv is not None else None,
            })
        return json.dumps({"bets": result, "count": len(result)}, ensure_ascii=False)
    finally:
        db.close()


def _tool_get_user_stats(user_id: int, days: int = 30) -> str:
    db: Session = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        q = db.query(Bet).filter(
            Bet.user_id == user_id,
            Bet.is_backtest == False,  # noqa: E712
            Bet.result.in_(["won", "lost"]),
            Bet.match_date >= cutoff,
        )
        bets = q.all()
        if not bets:
            return json.dumps({"message": f"Aucun pari settle sur les {days} derniers jours"})

        total = len(bets)
        wins = sum(1 for b in bets if b.result == "won")
        total_stake = sum(float(b.stake or 0) for b in bets)
        total_pl = sum(float(b.profit_loss or 0) for b in bets)
        roi = (total_pl / total_stake * 100) if total_stake > 0 else 0
        clvs = [float(b.clv) for b in bets if b.clv is not None]
        avg_clv = sum(clvs) / len(clvs) if clvs else 0

        # By sport
        by_sport: dict[str, dict] = {}
        for b in bets:
            s = b.sport or "unknown"
            if s not in by_sport:
                by_sport[s] = {"count": 0, "wins": 0, "stake": 0.0, "pl": 0.0}
            by_sport[s]["count"] += 1
            if b.result == "won":
                by_sport[s]["wins"] += 1
            by_sport[s]["stake"] += float(b.stake or 0)
            by_sport[s]["pl"] += float(b.profit_loss or 0)

        sport_stats = {}
        for s, d in by_sport.items():
            sport_stats[s] = {
                "count": d["count"],
                "win_rate": round(d["wins"] / d["count"] * 100, 1) if d["count"] > 0 else 0,
                "roi": round(d["pl"] / d["stake"] * 100, 1) if d["stake"] > 0 else 0,
                "pl": round(d["pl"], 2),
            }

        return json.dumps({
            "period_days": days,
            "total_bets": total,
            "wins": wins,
            "win_rate": round(wins / total * 100, 1),
            "total_stake": round(total_stake, 2),
            "total_pl": round(total_pl, 2),
            "roi": round(roi, 1),
            "avg_clv": round(avg_clv, 4),
            "by_sport": sport_stats,
        }, ensure_ascii=False)
    finally:
        db.close()


def _tool_get_today_scan(sport: str = "football") -> str:
    cache_key = f"scanner:{sport}:latest"
    data = cache_get(cache_key)
    if data and isinstance(data, dict) and "matches" in data:
        matches = data["matches"]
        summary = []
        for m in matches[:10]:
            summary.append({
                "match": f"{m.get('home_team', '?')} vs {m.get('away_team', '?')}",
                "league": m.get("league", ""),
                "date": m.get("match_date", ""),
                "best_edge": m.get("best_edge", 0),
                "best_outcome": m.get("best_outcome", ""),
                "best_odds": m.get("best_odds", 0),
                "model_prob": m.get("model_home_prob", 0),
            })
        return json.dumps({"sport": sport, "matches": summary, "count": len(summary)}, ensure_ascii=False)
    return json.dumps({"sport": sport, "matches": [], "count": 0, "message": "Aucun scan disponible pour le moment"})


def _tool_get_campaign_summary(user_id: int) -> str:
    db: Session = SessionLocal()
    try:
        campaigns = db.query(Campaign).filter(
            Campaign.user_id == user_id,
            Campaign.status == "active",
        ).all()
        result = []
        for c in campaigns:
            bet_count = db.query(sa_func.count(Bet.id)).filter(
                Bet.campaign_id == c.id,
                Bet.is_backtest == False,  # noqa: E712
            ).scalar() or 0
            total_pl = db.query(sa_func.sum(Bet.profit_loss)).filter(
                Bet.campaign_id == c.id,
                Bet.is_backtest == False,  # noqa: E712
                Bet.result.in_(["won", "lost"]),
            ).scalar() or 0
            total_stake = db.query(sa_func.sum(Bet.stake)).filter(
                Bet.campaign_id == c.id,
                Bet.is_backtest == False,  # noqa: E712
                Bet.result.in_(["won", "lost"]),
            ).scalar() or 0
            roi = (float(total_pl) / float(total_stake) * 100) if total_stake else 0
            result.append({
                "name": c.name,
                "status": c.status,
                "initial_bankroll": float(c.initial_bankroll) if c.initial_bankroll else 0,
                "target_bankroll": float(c.target_bankroll) if c.target_bankroll else None,
                "bet_count": bet_count,
                "total_pl": round(float(total_pl), 2),
                "roi": round(roi, 1),
            })
        return json.dumps({"campaigns": result, "count": len(result)}, ensure_ascii=False)
    finally:
        db.close()


TOOL_HANDLERS = {
    "get_recent_bets": _tool_get_recent_bets,
    "get_user_stats": _tool_get_user_stats,
    "get_today_scan": _tool_get_today_scan,
    "get_campaign_summary": _tool_get_campaign_summary,
}


def _execute_tool(name: str, args: dict, user_id: int) -> str:
    handler = TOOL_HANDLERS.get(name)
    if not handler:
        return json.dumps({"error": f"Tool {name} not found"})
    try:
        import inspect
        sig = inspect.signature(handler)
        if "user_id" in sig.parameters:
            args["user_id"] = user_id
        return handler(**args)
    except Exception as e:
        logger.exception("Tool %s error", name)
        return json.dumps({"error": str(e)})


def chat_stream(
    user_id: int,
    messages: list[dict],
    tier: str = "free",
) -> AsyncGenerator[str, None]:
    """Stream a chat response from Groq with tool use support.

    Yields SSE-formatted strings:
    - 'data: {"type":"token","text":"..."}\\n\\n'
    - 'data: {"type":"done","usage":{"prompt_tokens":N,"completion_tokens":N}}\\n\\n'
    - 'data: {"type":"error","message":"..."}\\n\\n'
    """
    import asyncio

    async def _stream():
        if not settings.GROQ_API_KEY:
            yield 'data: {"type":"error","message":"GROQ_API_KEY non configure"}\n\n'
            return

        try:
            from groq import Groq
        except ImportError:
            yield 'data: {"type":"error","message":"Package groq non installe"}\n\n'
            return

        client = Groq(api_key=settings.GROQ_API_KEY)

        # Build messages with system prompt
        full_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

        try:
            # First call — may trigger tool_calls
            response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=full_messages,
                tools=TOOLS,
                tool_choice="auto",
                max_tokens=2048,
                temperature=0.7,
                stream=False,
            )

            choice = response.choices[0]

            # Agentic loop: execute tool calls until the model produces a final text response
            max_tool_rounds = 3
            rounds = 0
            while choice.finish_reason == "tool_calls" and choice.message.tool_calls and rounds < max_tool_rounds:
                rounds += 1
                # Add assistant message with tool calls to history
                full_messages.append(choice.message.model_dump())

                # Execute each tool call and append results
                for tool_call in choice.message.tool_calls:
                    fn_name = tool_call.function.name
                    fn_args = json.loads(tool_call.function.arguments) if tool_call.function.arguments else {}
                    logger.info("Tool call: %s(%s)", fn_name, fn_args)
                    result = _execute_tool(fn_name, fn_args, user_id)
                    full_messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": result,
                    })

                # Call LLM again with tool results
                response = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=full_messages,
                    tools=TOOLS,
                    tool_choice="auto",
                    max_tokens=2048,
                    temperature=0.7,
                    stream=False,
                )
                choice = response.choices[0]

            # Stream final text response in small chunks for SSE effect
            if choice.message.content:
                content = choice.message.content
                chunk_size = 4
                for i in range(0, len(content), chunk_size):
                    chunk = content[i:i + chunk_size]
                    data = json.dumps({"type": "token", "text": chunk}, ensure_ascii=False)
                    yield f"data: {data}\n\n"
                    await asyncio.sleep(0.01)

            usage = {}
            if response.usage:
                usage = {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                }

            done_data = json.dumps({"type": "done", "usage": usage})
            yield f"data: {done_data}\n\n"

        except Exception as e:
            logger.exception("Groq API error")
            error_data = json.dumps({"type": "error", "message": str(e)}, ensure_ascii=False)
            yield f"data: {error_data}\n\n"

    return _stream()
