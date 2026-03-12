"""Portfolio management: track bets, bankroll, stats."""

from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from src.api.schemas import (
    BetCreateRequest,
    BetNoteUpdateRequest,
    BetResponse,
    BetUpdateRequest,
    PortfolioHistoryPoint,
    PortfolioStatsResponse,
)
from src.api.deps import require_tier
from src.api.helpers import bet_to_response as _bet_to_response
from src.database import get_db
from src.models.bet import Bet
from src.models.user import User

router = APIRouter(tags=["portfolio"])


@router.get("/portfolio/bets", response_model=list[BetResponse])
def list_bets(
    status: str | None = None,
    campaign_id: int | None = Query(default=None, description="Filter by campaign ID. Use 0 for manual bets only."),
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    user: User = Depends(require_tier("pro")),
    db: Session = Depends(get_db),
):
    """List all placed bets, optionally filtered by status or campaign."""
    query = db.query(Bet).filter(Bet.is_backtest == False, Bet.user_id == user.id)
    if status:
        query = query.filter(Bet.result == status)
    if campaign_id is not None:
        if campaign_id == 0:
            query = query.filter(Bet.campaign_id == None)
        else:
            query = query.filter(Bet.campaign_id == campaign_id)
    bets = query.order_by(Bet.match_date.desc()).offset(offset).limit(limit).all()
    return [_bet_to_response(b) for b in bets]


@router.post("/portfolio/bets", response_model=BetResponse)
def create_bet(
    request: BetCreateRequest,
    user: User = Depends(require_tier("pro")),
    db: Session = Depends(get_db),
):
    """Record a new bet."""
    if request.campaign_id is not None:
        from src.models.campaign import Campaign
        campaign = db.query(Campaign).filter(
            Campaign.id == request.campaign_id, Campaign.user_id == user.id
        ).first()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")

    # Determine source: manual if in a campaign, scanner if standalone
    source = "manual" if request.campaign_id is not None else "scanner"

    bet = Bet(
        user_id=user.id,
        sport="football",
        match_date=datetime.fromisoformat(request.match_date),
        home_team=request.home_team,
        away_team=request.away_team,
        league=request.league,
        outcome_bet=request.outcome_bet,
        odds_at_bet=request.odds_at_bet,
        stake=request.stake,
        result="pending",
        campaign_id=request.campaign_id,
        source=source,
        bookmaker=request.bookmaker,
        note=request.note,
    )
    db.add(bet)
    db.commit()
    db.refresh(bet)
    return _bet_to_response(bet)


@router.patch("/portfolio/bets/{bet_id}", response_model=BetResponse)
def update_bet_result(
    bet_id: int,
    request: BetUpdateRequest,
    user: User = Depends(require_tier("pro")),
    db: Session = Depends(get_db),
):
    """Update a bet result (won/lost/void/pending)."""
    bet = db.query(Bet).filter(Bet.id == bet_id, Bet.user_id == user.id).first()
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found")

    bet.result = request.result
    if request.result == "won":
        bet.profit_loss = round(bet.stake * (bet.odds_at_bet - 1), 2)
    elif request.result == "lost":
        bet.profit_loss = round(-bet.stake, 2)
    elif request.result == "void":
        bet.profit_loss = 0.0
    else:  # pending
        bet.profit_loss = None

    db.commit()
    db.refresh(bet)

    # Trigger notifications on settled bets
    if request.result in ("won", "lost"):
        _check_notifications(db, user, request.result)

    return _bet_to_response(bet)


def _check_notifications(db: Session, user: User, result: str) -> None:
    """Check and create notifications after a bet is settled."""
    from src.models.user_preferences import UserPreferences
    from src.services.notifications import create_notification, check_smart_stop

    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == user.id).first()

    if result == "lost" and prefs:
        # Stop-loss: check daily loss
        if prefs.daily_stop_loss and prefs.daily_stop_loss > 0:
            today_losses = (
                db.query(Bet)
                .filter(
                    Bet.user_id == user.id,
                    Bet.is_backtest == False,
                    Bet.result == "lost",
                    Bet.match_date >= datetime.combine(date.today(), datetime.min.time()),
                )
                .all()
            )
            daily_loss = abs(sum(b.profit_loss or 0 for b in today_losses))
            if daily_loss >= prefs.daily_stop_loss:
                create_notification(
                    db, user.id, "stop_loss",
                    "Stop-loss atteint",
                    f"Votre perte du jour ({daily_loss:.2f}€) a atteint votre limite de {prefs.daily_stop_loss:.2f}€.",
                    {"daily_loss": daily_loss, "threshold": prefs.daily_stop_loss},
                )

        # Low bankroll
        if prefs.low_bankroll_alert and prefs.low_bankroll_alert > 0 and prefs.initial_bankroll:
            all_settled = (
                db.query(Bet)
                .filter(Bet.user_id == user.id, Bet.is_backtest == False, Bet.result.in_(["won", "lost"]))
                .all()
            )
            total_pnl = sum(b.profit_loss or 0 for b in all_settled)
            current_bankroll = prefs.initial_bankroll + total_pnl
            if current_bankroll <= prefs.low_bankroll_alert:
                create_notification(
                    db, user.id, "low_bankroll",
                    "Bankroll basse",
                    f"Votre bankroll est à {current_bankroll:.2f}€, sous votre seuil d'alerte de {prefs.low_bankroll_alert:.2f}€.",
                    {"current_bankroll": round(current_bankroll, 2), "threshold": prefs.low_bankroll_alert},
                )

    # Smart stop: check last 20 bets ROI
    check_smart_stop(db, user.id)
    db.commit()


@router.patch("/portfolio/bets/{bet_id}/note", response_model=BetResponse)
def update_bet_note(
    bet_id: int,
    request: BetNoteUpdateRequest,
    user: User = Depends(require_tier("pro")),
    db: Session = Depends(get_db),
):
    """Update a bet's personal note."""
    bet = db.query(Bet).filter(Bet.id == bet_id, Bet.user_id == user.id).first()
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found")
    bet.note = request.note
    db.commit()
    db.refresh(bet)
    return _bet_to_response(bet)


@router.get("/portfolio/stats", response_model=PortfolioStatsResponse)
def get_portfolio_stats(
    from_date: date | None = Query(default=None, description="Filter bets from this date (inclusive)"),
    to_date: date | None = Query(default=None, description="Filter bets up to this date (inclusive)"),
    user: User = Depends(require_tier("pro")),
    db: Session = Depends(get_db),
):
    """Get portfolio statistics, optionally filtered by date range."""
    query = db.query(Bet).filter(Bet.is_backtest == False, Bet.user_id == user.id)
    if from_date:
        query = query.filter(Bet.match_date >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        query = query.filter(Bet.match_date <= datetime.combine(to_date, datetime.max.time()))
    bets = query.order_by(Bet.match_date).all()

    if not bets:
        return PortfolioStatsResponse(
            total_bets=0, pending_bets=0, won=0, lost=0, win_rate=0,
            total_staked=0, total_pnl=0, roi_pct=0,
            longest_winning_streak=0, longest_losing_streak=0,
        )

    settled = [b for b in bets if b.result in ("won", "lost")]
    won = sum(1 for b in settled if b.result == "won")
    lost = sum(1 for b in settled if b.result == "lost")
    pending = sum(1 for b in bets if b.result == "pending")
    total_staked = sum(b.stake for b in settled)
    total_pnl = sum(b.profit_loss or 0 for b in settled)

    # Streaks
    w_streak = l_streak = max_w = max_l = 0
    for b in settled:
        if b.result == "won":
            w_streak += 1
            l_streak = 0
            max_w = max(max_w, w_streak)
        else:
            l_streak += 1
            w_streak = 0
            max_l = max(max_l, l_streak)

    roi_pct = round((total_pnl / total_staked * 100), 2) if total_staked > 0 else 0

    # Compute prev period deltas when date range is provided
    prev_roi_pct = None
    prev_total_staked = None
    prev_win_rate = None
    prev_total_bets = None
    if from_date and to_date:
        period_days = (to_date - from_date).days
        if period_days > 0:
            prev_from = from_date - timedelta(days=period_days)
            prev_to = from_date - timedelta(days=1)
            prev_query = db.query(Bet).filter(
                Bet.is_backtest == False,
                Bet.user_id == user.id,
                Bet.match_date >= datetime.combine(prev_from, datetime.min.time()),
                Bet.match_date <= datetime.combine(prev_to, datetime.max.time()),
            )
            prev_all = prev_query.all()
            prev_settled = [b for b in prev_all if b.result in ("won", "lost")]
            prev_won_count = sum(1 for b in prev_settled if b.result == "won")
            prev_staked = sum(b.stake for b in prev_settled)
            prev_pnl = sum(b.profit_loss or 0 for b in prev_settled)
            prev_roi_pct = round((prev_pnl / prev_staked * 100), 2) if prev_staked > 0 else 0.0
            prev_total_staked = round(prev_staked, 2)
            prev_win_rate = round(prev_won_count / len(prev_settled), 4) if prev_settled else 0.0
            prev_total_bets = len(prev_all)

    # Sport breakdown
    sport_map: dict[str, dict] = defaultdict(lambda: {"won": 0, "lost": 0, "pnl": 0.0, "staked": 0.0})
    for b in settled:
        sport_name = b.sport or "football"
        sport_map[sport_name]["staked"] += b.stake
        sport_map[sport_name]["pnl"] += b.profit_loss or 0
        if b.result == "won":
            sport_map[sport_name]["won"] += 1
        else:
            sport_map[sport_name]["lost"] += 1

    sport_breakdown = []
    for sname, sdata in sport_map.items():
        s_roi = round((sdata["pnl"] / sdata["staked"] * 100), 2) if sdata["staked"] > 0 else 0.0
        sport_breakdown.append({
            "sport": sname,
            "won": sdata["won"],
            "lost": sdata["lost"],
            "pnl": round(sdata["pnl"], 2),
            "staked": round(sdata["staked"], 2),
            "roi_pct": s_roi,
        })

    # Bookmaker breakdown
    bk_map: dict[str, dict] = defaultdict(lambda: {"won": 0, "lost": 0, "pnl": 0.0, "staked": 0.0})
    for b in settled:
        bk = b.bookmaker or "Inconnu"
        bk_map[bk]["staked"] += b.stake
        bk_map[bk]["pnl"] += b.profit_loss or 0
        if b.result == "won":
            bk_map[bk]["won"] += 1
        else:
            bk_map[bk]["lost"] += 1

    bookmaker_breakdown = []
    for bk_name, bk_data in bk_map.items():
        total = bk_data["won"] + bk_data["lost"]
        bk_roi = round((bk_data["pnl"] / bk_data["staked"] * 100), 2) if bk_data["staked"] > 0 else 0.0
        bookmaker_breakdown.append({
            "bookmaker": bk_name,
            "total_bets": total,
            "won": bk_data["won"],
            "lost": bk_data["lost"],
            "roi_pct": bk_roi,
            "total_pnl": round(bk_data["pnl"], 2),
        })
    bookmaker_breakdown.sort(key=lambda x: x["total_bets"], reverse=True)

    # League breakdown (top 10)
    lg_map: dict[str, dict] = defaultdict(lambda: {"won": 0, "lost": 0, "pnl": 0.0, "staked": 0.0})
    for b in settled:
        lg = b.league or "Inconnue"
        lg_map[lg]["staked"] += b.stake
        lg_map[lg]["pnl"] += b.profit_loss or 0
        if b.result == "won":
            lg_map[lg]["won"] += 1
        else:
            lg_map[lg]["lost"] += 1

    league_breakdown = []
    for lg_name, lg_data in lg_map.items():
        total = lg_data["won"] + lg_data["lost"]
        lg_roi = round((lg_data["pnl"] / lg_data["staked"] * 100), 2) if lg_data["staked"] > 0 else 0.0
        league_breakdown.append({
            "league": lg_name,
            "total_bets": total,
            "won": lg_data["won"],
            "lost": lg_data["lost"],
            "roi_pct": lg_roi,
            "total_pnl": round(lg_data["pnl"], 2),
        })
    league_breakdown.sort(key=lambda x: x["total_bets"], reverse=True)
    league_breakdown = league_breakdown[:10]

    # Market breakdown
    def _normalize_market(outcome: str | None) -> str:
        if outcome in ("H", "D", "A"):
            return "1x2"
        return outcome or "Inconnu"

    mk_map: dict[str, dict] = defaultdict(lambda: {"won": 0, "lost": 0, "pnl": 0.0, "staked": 0.0})
    for b in settled:
        mk = _normalize_market(b.outcome_bet)
        mk_map[mk]["staked"] += b.stake
        mk_map[mk]["pnl"] += b.profit_loss or 0
        if b.result == "won":
            mk_map[mk]["won"] += 1
        else:
            mk_map[mk]["lost"] += 1

    market_breakdown = []
    for mk_name, mk_data in mk_map.items():
        total = mk_data["won"] + mk_data["lost"]
        mk_roi = round((mk_data["pnl"] / mk_data["staked"] * 100), 2) if mk_data["staked"] > 0 else 0.0
        market_breakdown.append({
            "market": mk_name,
            "total_bets": total,
            "won": mk_data["won"],
            "lost": mk_data["lost"],
            "roi_pct": mk_roi,
        })
    market_breakdown.sort(key=lambda x: x["total_bets"], reverse=True)

    return PortfolioStatsResponse(
        total_bets=len(bets),
        pending_bets=pending,
        won=won,
        lost=lost,
        win_rate=round(won / len(settled), 4) if settled else 0,
        total_staked=round(total_staked, 2),
        total_pnl=round(total_pnl, 2),
        roi_pct=roi_pct,
        longest_winning_streak=max_w,
        longest_losing_streak=max_l,
        prev_roi_pct=prev_roi_pct,
        prev_total_staked=prev_total_staked,
        prev_win_rate=prev_win_rate,
        prev_total_bets=prev_total_bets,
        sport_breakdown=sport_breakdown,
        bookmaker_breakdown=bookmaker_breakdown,
        league_breakdown=league_breakdown,
        market_breakdown=market_breakdown,
    )


@router.get("/portfolio/history", response_model=list[PortfolioHistoryPoint])
def get_portfolio_history(
    from_date: date | None = Query(default=None, description="Filter from this date"),
    to_date: date | None = Query(default=None, description="Filter up to this date"),
    user: User = Depends(require_tier("pro")),
    db: Session = Depends(get_db),
):
    """Get P&L history as cumulative points grouped by date."""
    query = db.query(Bet).filter(
        Bet.is_backtest == False,
        Bet.user_id == user.id,
        Bet.result.in_(["won", "lost"]),
    )
    if from_date:
        query = query.filter(Bet.match_date >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        query = query.filter(Bet.match_date <= datetime.combine(to_date, datetime.max.time()))

    bets = query.order_by(Bet.match_date).all()

    if not bets:
        return []

    # Group by date
    daily: dict[str, dict] = defaultdict(lambda: {"pnl": 0.0, "staked": 0.0})
    for b in bets:
        d = b.match_date.strftime("%Y-%m-%d")
        daily[d]["pnl"] += b.profit_loss or 0
        daily[d]["staked"] += b.stake

    # Build cumulative series
    points: list[PortfolioHistoryPoint] = []
    cum_pnl = 0.0
    cum_staked = 0.0
    for d in sorted(daily.keys()):
        cum_pnl += daily[d]["pnl"]
        cum_staked += daily[d]["staked"]
        roi = round((cum_pnl / cum_staked * 100), 2) if cum_staked > 0 else 0.0
        points.append(PortfolioHistoryPoint(
            date=d,
            cumulative_pnl=round(cum_pnl, 2),
            roi_pct=roi,
        ))

    return points


@router.get("/portfolio/bets/{bet_id}/odds-history")
def get_bet_odds_history(
    bet_id: int,
    user: User = Depends(require_tier("pro")),
    db: Session = Depends(get_db),
):
    """Return odds evolution snapshots for the match linked to a bet."""
    bet = db.query(Bet).filter(Bet.id == bet_id, Bet.user_id == user.id).first()
    if not bet:
        raise HTTPException(status_code=404, detail="Pari non trouve")

    from src.models.odds_snapshot import OddsSnapshot

    snaps = (
        db.query(OddsSnapshot)
        .filter(
            OddsSnapshot.sport == bet.sport,
            OddsSnapshot.home_team == bet.home_team,
            OddsSnapshot.away_team == bet.away_team,
            OddsSnapshot.match_date >= bet.match_date - timedelta(days=2),
            OddsSnapshot.match_date <= bet.match_date + timedelta(days=2),
        )
        .order_by(OddsSnapshot.snapshot_time)
        .all()
    )

    # Select the relevant odds column based on outcome_bet
    result = []
    for s in snaps:
        if bet.outcome_bet == "H":
            odds = s.odds_home
        elif bet.outcome_bet == "A":
            odds = s.odds_away
        else:
            odds = s.odds_draw
        if odds and odds > 1.0:
            result.append({
                "time": s.snapshot_time.isoformat(),
                "odds": round(odds, 3),
            })

    # Anchor point: bet placement
    points: list[dict] = [{"time": bet.created_at.isoformat(), "odds": bet.odds_at_bet, "event": "bet"}]
    points += result
    # Closing odds if available
    if bet.odds_at_close and bet.odds_at_close > 1.0:
        points.append({"time": bet.match_date.isoformat(), "odds": bet.odds_at_close, "event": "close"})

    # Deduplicate and sort chronologically
    seen: set = set()
    deduped = []
    for p in sorted(points, key=lambda x: x["time"]):
        if p["time"] not in seen:
            seen.add(p["time"])
            deduped.append(p)

    return deduped


@router.delete("/portfolio/bets/{bet_id}", status_code=204)
def delete_bet(
    bet_id: int,
    user: User = Depends(require_tier("pro")),
    db: Session = Depends(get_db),
):
    """Delete a bet (mistake, duplicate, etc.)."""
    bet = db.query(Bet).filter(Bet.id == bet_id, Bet.user_id == user.id).first()
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found")
    db.delete(bet)
    db.commit()
