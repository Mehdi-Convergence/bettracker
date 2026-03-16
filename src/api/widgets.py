"""Widget data endpoints for Dashboard V2."""

import json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.api.deps import get_current_user
from src.database import get_db
from src.models.user import User
from src.models.bet import Bet
from src.models.campaign import Campaign
from src.cache import cache_get

router = APIRouter(tags=["widgets"])


@router.get("/widgets/data")
def get_widget_data(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregate all data needed by dashboard v2 widgets."""
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)

    # --- Portfolio stats ---
    bets = (
        db.query(Bet)
        .filter(Bet.user_id == user.id, Bet.is_backtest == False)
        .all()
    )
    settled = [b for b in bets if b.result in ("won", "lost", "void")]
    recent_settled = [
        b for b in settled
        if b.match_date and b.match_date.replace(tzinfo=timezone.utc) >= thirty_days_ago
    ]

    total_staked = sum(b.stake for b in settled) if settled else 0
    total_pl = sum((b.profit_loss or 0) for b in settled)
    wins = [b for b in settled if (b.profit_loss or 0) > 0]
    win_rate = (len(wins) / len(settled) * 100) if settled else 0
    roi = (total_pl / total_staked * 100) if total_staked > 0 else 0

    # Recent P&L (30 days)
    recent_pl = sum((b.profit_loss or 0) for b in recent_settled)
    recent_staked = sum(b.stake for b in recent_settled) if recent_settled else 0
    recent_roi = (recent_pl / recent_staked * 100) if recent_staked > 0 else 0

    # P&L timeline (daily, last 30 days)
    timeline = []
    for i in range(30):
        day = (now - timedelta(days=29 - i)).date()
        day_bets = [
            b for b in settled
            if b.match_date and b.match_date.date() == day
        ]
        day_pl = sum((b.profit_loss or 0) for b in day_bets)
        timeline.append({"date": day.isoformat(), "pl": round(day_pl, 2)})

    # Cumulative P&L for timeline
    cumulative = 0.0
    for point in timeline:
        cumulative += point["pl"]
        point["cumulative"] = round(cumulative, 2)

    # By sport breakdown
    by_sport: dict[str, dict] = {}
    for b in settled:
        sport = b.sport or "football"
        if sport not in by_sport:
            by_sport[sport] = {"count": 0, "pl": 0.0, "staked": 0.0, "wins": 0}
        by_sport[sport]["count"] += 1
        by_sport[sport]["pl"] += b.profit_loss or 0
        by_sport[sport]["staked"] += b.stake
        if (b.profit_loss or 0) > 0:
            by_sport[sport]["wins"] += 1

    for sport, data in by_sport.items():
        data["roi"] = round(data["pl"] / data["staked"] * 100, 2) if data["staked"] > 0 else 0
        data["win_rate"] = round(data["wins"] / data["count"] * 100, 1) if data["count"] > 0 else 0
        data["pl"] = round(data["pl"], 2)

    # --- Active campaigns ---
    campaigns = db.query(Campaign).filter(
        Campaign.user_id == user.id,
        Campaign.status == "active",
    ).all()
    campaign_list = []
    for c in campaigns:
        c_bets = [b for b in bets if b.campaign_id == c.id and b.result in ("won", "lost", "void")]
        c_pl = sum((b.profit_loss or 0) for b in c_bets)
        campaign_list.append({
            "name": c.name,
            "bet_count": len(c_bets),
            "pl": round(c_pl, 2),
            "bankroll": c.initial_bankroll,
        })

    # --- Value bets from scanner cache ---
    value_bets = []
    for sport in ["football", "tennis", "nba", "mlb", "rugby"]:
        raw = cache_get(f"scanner:{sport}")
        if raw:
            try:
                matches = json.loads(raw) if isinstance(raw, str) else raw
                if isinstance(matches, list):
                    for m in matches[:3]:
                        edge = m.get("edge") or m.get("best_edge") or 0
                        if edge > 0:
                            home = m.get("home", "?")
                            away = m.get("away", "?")
                            value_bets.append({
                                "sport": sport,
                                "match": m.get("match", f"{home} vs {away}"),
                                "league": m.get("league", ""),
                                "edge": round(edge * 100, 1) if edge < 1 else round(edge, 1),
                                "odds": m.get("best_odds", 0),
                            })
            except Exception:
                pass

    value_bets.sort(key=lambda x: x["edge"], reverse=True)
    value_bets = value_bets[:10]

    # --- Recent bets (last 10) ---
    recent_bets_sorted = sorted(
        bets,
        key=lambda b: b.created_at or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )[:10]
    recent_bets_list = []
    for b in recent_bets_sorted:
        recent_bets_list.append({
            "id": b.id,
            "match": f"{b.home_team} vs {b.away_team}",
            "sport": b.sport or "football",
            "odds": b.odds_at_bet,
            "stake": b.stake,
            "pnl": round(b.profit_loss, 2) if b.profit_loss is not None else None,
            "status": b.result or "pending",
            "date": b.created_at.isoformat() if b.created_at else None,
            "clv": round(b.clv, 4) if b.clv is not None else None,
        })

    # --- Streaks ---
    sorted_settled = sorted(
        settled,
        key=lambda b: b.match_date or datetime.min,
    )
    current_streak = 0
    streak_type = "none"
    for b in reversed(sorted_settled):
        won = (b.profit_loss or 0) > 0
        if current_streak == 0:
            streak_type = "win" if won else "loss"
            current_streak = 1
        elif (streak_type == "win" and won) or (streak_type == "loss" and not won):
            current_streak += 1
        else:
            break

    return {
        "stats": {
            "total_bets": len(settled),
            "total_staked": round(total_staked, 2),
            "total_pl": round(total_pl, 2),
            "roi": round(roi, 2),
            "win_rate": round(win_rate, 1),
            "recent_roi": round(recent_roi, 2),
            "recent_pl": round(recent_pl, 2),
            "recent_bets_count": len(recent_settled),
        },
        "timeline": timeline,
        "by_sport": by_sport,
        "campaigns": campaign_list,
        "value_bets": value_bets,
        "recent_bets": recent_bets_list,
        "streak": {
            "type": streak_type,
            "count": current_streak,
        },
    }
