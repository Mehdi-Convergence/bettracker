"""AI Analyste API — chat with streaming."""

import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from src.api.deps import get_current_user
from src.cache import cache_get
from src.database import get_db
from src.models.ai_conversation import AIConversation, AIMessage
from src.models.bet import Bet
from src.models.campaign import Campaign
from src.models.user import User
from src.rate_limit import limiter
from src.services.ai_analyste import chat_stream, check_rate_limit, increment_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ai"])


class ChatRequest(BaseModel):
    message: str
    conversation_id: int | None = None


class ConversationOut(BaseModel):
    id: int
    title: str | None
    created_at: str
    updated_at: str
    message_count: int


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: str


@router.post("/ai/chat")
@limiter.limit("20/minute")
async def ai_chat(
    request: Request,
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream a chat response from the AI Analyste."""
    # Rate limit check
    allowed, used, limit = check_rate_limit(user.id, user.tier)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Limite quotidienne atteinte ({used}/{limit} messages). Revenez demain.",
        )

    # Get or create conversation
    conversation: AIConversation | None = None
    if body.conversation_id:
        conversation = db.query(AIConversation).filter(
            AIConversation.id == body.conversation_id,
            AIConversation.user_id == user.id,
        ).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation introuvable")

    if not conversation:
        # Create new conversation with first message as title
        title = body.message[:100] if len(body.message) > 100 else body.message
        conversation = AIConversation(user_id=user.id, title=title)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    # Save user message
    user_msg = AIMessage(
        conversation_id=conversation.id,
        role="user",
        content=body.message,
    )
    db.add(user_msg)
    db.commit()

    # Load conversation history (last 20 messages for context)
    history = (
        db.query(AIMessage)
        .filter(AIMessage.conversation_id == conversation.id)
        .order_by(AIMessage.created_at.asc())
        .limit(20)
        .all()
    )
    messages = [{"role": m.role, "content": m.content} for m in history if m.role in ("user", "assistant")]

    # Increment rate limit
    increment_rate_limit(user.id)

    conv_id = conversation.id

    # Wrap stream to save assistant response at the end
    async def stream_and_save():
        full_response = []
        async for chunk in chat_stream(user.id, messages, user.tier):
            yield chunk
            # Parse chunk to accumulate response text
            if chunk.startswith("data: "):
                try:
                    data = json.loads(chunk[6:].strip())
                    if data.get("type") == "token":
                        full_response.append(data.get("text", ""))
                except (json.JSONDecodeError, KeyError):
                    pass

        # Save assistant message to DB
        if full_response:
            assistant_content = "".join(full_response)
            try:
                assistant_msg = AIMessage(
                    conversation_id=conv_id,
                    role="assistant",
                    content=assistant_content,
                )
                db.add(assistant_msg)
                db.commit()
            except Exception:
                logger.exception("Failed to save assistant message")

    headers = {
        "X-Conversation-Id": str(conv_id),
        "X-Rate-Limit-Used": str(used + 1),
        "X-Rate-Limit-Limit": str(limit),
    }

    return StreamingResponse(
        stream_and_save(),
        media_type="text/event-stream",
        headers=headers,
    )


@router.get("/ai/conversations")
def get_conversations(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List user's conversations."""
    conversations = (
        db.query(AIConversation)
        .filter(AIConversation.user_id == user.id)
        .order_by(AIConversation.updated_at.desc())
        .limit(50)
        .all()
    )
    result = []
    for c in conversations:
        msg_count = db.query(AIMessage).filter(AIMessage.conversation_id == c.id).count()
        result.append({
            "id": c.id,
            "title": c.title,
            "created_at": str(c.created_at),
            "updated_at": str(c.updated_at),
            "message_count": msg_count,
        })
    return result


@router.get("/ai/conversations/{conversation_id}/messages")
def get_conversation_messages(
    conversation_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all messages in a conversation."""
    conversation = db.query(AIConversation).filter(
        AIConversation.id == conversation_id,
        AIConversation.user_id == user.id,
    ).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation introuvable")

    messages = (
        db.query(AIMessage)
        .filter(AIMessage.conversation_id == conversation_id)
        .order_by(AIMessage.created_at.asc())
        .all()
    )
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "created_at": str(m.created_at),
        }
        for m in messages
    ]


@router.delete("/ai/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a conversation and all its messages."""
    conversation = db.query(AIConversation).filter(
        AIConversation.id == conversation_id,
        AIConversation.user_id == user.id,
    ).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation introuvable")

    db.query(AIMessage).filter(AIMessage.conversation_id == conversation_id).delete()
    db.delete(conversation)
    db.commit()
    return {"ok": True}


@router.get("/ai/rate-limit")
def get_rate_limit(
    user: User = Depends(get_current_user),
):
    """Get current rate limit status."""
    allowed, used, limit = check_rate_limit(user.id, user.tier)
    return {"used": used, "limit": limit, "remaining": limit - used}


@router.get("/ai/context")
def get_ai_context(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get context panel data: user performance, today's scans, active campaigns."""
    now = datetime.now(timezone.utc)
    cutoff_30d = now - timedelta(days=30)

    # --- Performance 30j ---
    settled_bets = (
        db.query(Bet)
        .filter(
            Bet.user_id == user.id,
            Bet.is_backtest == False,  # noqa: E712
            Bet.result.in_(["won", "lost"]),
            Bet.match_date >= cutoff_30d,
        )
        .all()
    )
    total_bets = len(settled_bets)
    wins = sum(1 for b in settled_bets if b.result == "won")
    total_stake = sum(float(b.stake or 0) for b in settled_bets)
    total_pl = sum(float(b.profit_loss or 0) for b in settled_bets)
    roi = round(total_pl / total_stake * 100, 1) if total_stake > 0 else 0
    win_rate = round(wins / total_bets * 100, 1) if total_bets > 0 else 0

    # By sport breakdown
    by_sport: dict[str, dict] = {}
    for b in settled_bets:
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
            "roi": round(d["pl"] / d["stake"] * 100, 1) if d["stake"] > 0 else 0,
            "pl": round(d["pl"], 2),
        }

    # --- P&L timeline (last 30 days, daily) ---
    pl_timeline: list[dict] = []
    day_pl: dict[str, float] = {}
    for b in settled_bets:
        day_key = str(b.match_date.date()) if b.match_date else "unknown"
        day_pl[day_key] = day_pl.get(day_key, 0) + float(b.profit_loss or 0)
    cumulative = 0.0
    for day_key in sorted(day_pl.keys()):
        cumulative += day_pl[day_key]
        pl_timeline.append({"date": day_key, "pl": round(cumulative, 2)})

    # --- Today's scans (top value bets across all sports) ---
    value_bets: list[dict] = []
    for sport in ["football", "tennis", "nba", "mlb", "rugby"]:
        cache_key = f"scanner:{sport}:latest"
        data = cache_get(cache_key)
        if data and isinstance(data, dict) and "matches" in data:
            for m in data["matches"][:5]:
                edge = m.get("best_edge", 0)
                if edge and edge > 0:
                    value_bets.append({
                        "sport": sport,
                        "match": f"{m.get('home_team', '?')} vs {m.get('away_team', '?')}",
                        "league": m.get("league", ""),
                        "date": m.get("match_date", ""),
                        "edge": round(edge * 100, 1) if edge < 1 else round(edge, 1),
                        "outcome": m.get("best_outcome", ""),
                        "odds": m.get("best_odds", 0),
                        "prob": round(m.get("model_home_prob", 0) * 100, 1) if m.get("model_home_prob", 0) < 1 else round(m.get("model_home_prob", 0), 1),
                    })
    value_bets.sort(key=lambda x: x["edge"], reverse=True)
    value_bets = value_bets[:7]

    # --- Active campaigns ---
    campaigns = (
        db.query(Campaign)
        .filter(Campaign.user_id == user.id, Campaign.status == "active")
        .all()
    )
    campaign_list = []
    for c in campaigns:
        bet_count = db.query(sa_func.count(Bet.id)).filter(
            Bet.campaign_id == c.id, Bet.is_backtest == False  # noqa: E712
        ).scalar() or 0
        c_pl = db.query(sa_func.sum(Bet.profit_loss)).filter(
            Bet.campaign_id == c.id,
            Bet.is_backtest == False,  # noqa: E712
            Bet.result.in_(["won", "lost"]),
        ).scalar() or 0
        campaign_list.append({
            "name": c.name,
            "bet_count": bet_count,
            "pl": round(float(c_pl), 2),
            "bankroll": float(c.initial_bankroll) if c.initial_bankroll else 0,
        })

    # --- Rate limit ---
    _, used, limit = check_rate_limit(user.id, user.tier)

    return {
        "performance": {
            "roi": roi,
            "total_bets": total_bets,
            "win_rate": win_rate,
            "total_stake": round(total_stake, 2),
            "total_pl": round(total_pl, 2),
            "by_sport": sport_stats,
            "timeline": pl_timeline,
        },
        "value_bets": value_bets,
        "campaigns": campaign_list,
        "rate_limit": {"used": used, "limit": limit, "remaining": limit - used},
    }
