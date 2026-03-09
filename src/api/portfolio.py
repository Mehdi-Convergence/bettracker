"""Portfolio management: track bets, bankroll, stats."""

from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from src.api.schemas import (
    BetCreateRequest,
    BetResponse,
    PortfolioHistoryPoint,
    PortfolioStatsResponse,
)
from src.api.deps import require_tier
from src.database import get_db
from src.models.bet import Bet

router = APIRouter(tags=["portfolio"], dependencies=[Depends(require_tier("pro"))])


@router.get("/portfolio/bets", response_model=list[BetResponse])
def list_bets(
    status: str | None = None,
    campaign_id: int | None = Query(default=None, description="Filter by campaign ID. Use 0 for manual bets only."),
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """List all placed bets, optionally filtered by status or campaign."""
    query = db.query(Bet).filter(Bet.is_backtest == False)
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
def create_bet(request: BetCreateRequest, db: Session = Depends(get_db)):
    """Record a new bet."""
    if request.campaign_id is not None:
        from src.models.campaign import Campaign
        campaign = db.query(Campaign).filter(Campaign.id == request.campaign_id).first()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")

    bet = Bet(
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
    )
    db.add(bet)
    db.commit()
    db.refresh(bet)
    return _bet_to_response(bet)


@router.patch("/portfolio/bets/{bet_id}")
def update_bet_result(
    bet_id: int,
    result: str,
    db: Session = Depends(get_db),
):
    """Update a bet result (won/lost)."""
    bet = db.query(Bet).filter(Bet.id == bet_id).first()
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found")

    bet.result = result
    if result == "won":
        bet.profit_loss = round(bet.stake * (bet.odds_at_bet - 1), 2)
    elif result == "lost":
        bet.profit_loss = round(-bet.stake, 2)
    else:
        bet.profit_loss = None

    db.commit()
    db.refresh(bet)
    return _bet_to_response(bet)


@router.get("/portfolio/stats", response_model=PortfolioStatsResponse)
def get_portfolio_stats(
    from_date: date | None = Query(default=None, description="Filter bets from this date (inclusive)"),
    to_date: date | None = Query(default=None, description="Filter bets up to this date (inclusive)"),
    db: Session = Depends(get_db),
):
    """Get portfolio statistics, optionally filtered by date range."""
    query = db.query(Bet).filter(Bet.is_backtest == False)
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

    # Compute prev_roi_pct for delta display when date range is provided
    prev_roi_pct = None
    if from_date and to_date:
        period_days = (to_date - from_date).days
        if period_days > 0:
            prev_from = from_date - timedelta(days=period_days)
            prev_to = from_date - timedelta(days=1)
            prev_query = db.query(Bet).filter(
                Bet.is_backtest == False,
                Bet.match_date >= datetime.combine(prev_from, datetime.min.time()),
                Bet.match_date <= datetime.combine(prev_to, datetime.max.time()),
                Bet.result.in_(["won", "lost"]),
            )
            prev_bets = prev_query.all()
            prev_staked = sum(b.stake for b in prev_bets)
            prev_pnl = sum(b.profit_loss or 0 for b in prev_bets)
            prev_roi_pct = round((prev_pnl / prev_staked * 100), 2) if prev_staked > 0 else 0.0

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
    )


@router.get("/portfolio/history", response_model=list[PortfolioHistoryPoint])
def get_portfolio_history(
    from_date: date | None = Query(default=None, description="Filter from this date"),
    to_date: date | None = Query(default=None, description="Filter up to this date"),
    db: Session = Depends(get_db),
):
    """Get P&L history as cumulative points grouped by date."""
    query = db.query(Bet).filter(
        Bet.is_backtest == False,
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



def _bet_to_response(b: Bet) -> BetResponse:
    return BetResponse(
        id=b.id,
        sport=b.sport or "football",
        home_team=b.home_team,
        away_team=b.away_team,
        league=b.league or "",
        match_date=b.match_date.isoformat(),
        outcome_bet=b.outcome_bet,
        odds_at_bet=b.odds_at_bet,
        stake=b.stake,
        result=b.result or "pending",
        profit_loss=b.profit_loss,
        campaign_id=b.campaign_id,
        created_at=b.created_at.isoformat() if b.created_at else "",
    )
