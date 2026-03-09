"""Campaign management: autopilot-assisted betting strategy."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from src.api.schemas import (
    BankrollPointResponse,
    BetResponse,
    BetUpdateRequest,
    CampaignAcceptRequest,
    CampaignCreateRequest,
    CampaignDetailResponse,
    CampaignRecommendation,
    CampaignRecommendationsResponse,
    CampaignResponse,
    CampaignStatsResponse,
    CampaignUpdateRequest,
)
from src.api.deps import require_tier
from src.database import get_db
from src.models.bet import Bet
from src.models.campaign import Campaign

router = APIRouter(tags=["campaigns"], dependencies=[Depends(require_tier("premium"))])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _campaign_to_response(c: Campaign) -> CampaignResponse:
    return CampaignResponse(
        id=c.id,
        name=c.name,
        status=c.status,
        initial_bankroll=c.initial_bankroll,
        flat_stake=c.flat_stake,
        min_edge=c.min_edge,
        min_model_prob=c.min_model_prob,
        min_odds=c.min_odds,
        max_odds=c.max_odds,
        allowed_outcomes=c.allowed_outcomes.split(",") if c.allowed_outcomes else None,
        excluded_leagues=c.excluded_leagues.split(",") if c.excluded_leagues else None,
        combo_mode=c.combo_mode,
        combo_max_legs=c.combo_max_legs,
        combo_min_odds=c.combo_min_odds,
        combo_max_odds=c.combo_max_odds,
        combo_top_n=c.combo_top_n,
        target_bankroll=c.target_bankroll,
        created_at=c.created_at.isoformat() if c.created_at else "",
    )


def _compute_bet_stats(bets: list[Bet], initial_bankroll: float) -> CampaignStatsResponse:
    """Compute stats from a list of bets (shared by campaign and portfolio)."""
    if not bets:
        return CampaignStatsResponse(
            total_bets=0, pending_bets=0, won=0, lost=0, win_rate=0,
            total_staked=0, total_pnl=0, roi_pct=0,
            current_bankroll=initial_bankroll,
            longest_winning_streak=0, longest_losing_streak=0,
        )

    settled = [b for b in bets if b.result in ("won", "lost")]
    won = sum(1 for b in settled if b.result == "won")
    lost = sum(1 for b in settled if b.result == "lost")
    pending = sum(1 for b in bets if b.result == "pending")
    total_staked = sum(b.stake for b in settled)
    total_pnl = sum(b.profit_loss or 0 for b in settled)

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

    return CampaignStatsResponse(
        total_bets=len(bets),
        pending_bets=pending,
        won=won,
        lost=lost,
        win_rate=round(won / len(settled), 4) if settled else 0,
        total_staked=round(total_staked, 2),
        total_pnl=round(total_pnl, 2),
        roi_pct=round((total_pnl / total_staked * 100), 2) if total_staked > 0 else 0,
        current_bankroll=round(initial_bankroll + total_pnl, 2),
        longest_winning_streak=max_w,
        longest_losing_streak=max_l,
    )


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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/campaigns", response_model=CampaignResponse)
def create_campaign(request: CampaignCreateRequest, db: Session = Depends(get_db)):
    """Create a new campaign with strategy parameters."""
    campaign = Campaign(
        name=request.name,
        status="active",
        initial_bankroll=request.initial_bankroll,
        flat_stake=request.flat_stake,
        min_edge=request.min_edge,
        min_model_prob=request.min_model_prob,
        min_odds=request.min_odds,
        max_odds=request.max_odds,
        allowed_outcomes=",".join(request.allowed_outcomes) if request.allowed_outcomes else None,
        excluded_leagues=",".join(request.excluded_leagues) if request.excluded_leagues else None,
        combo_mode=request.combo_mode,
        combo_max_legs=request.combo_max_legs,
        combo_min_odds=request.combo_min_odds,
        combo_max_odds=request.combo_max_odds,
        combo_top_n=request.combo_top_n,
        target_bankroll=request.target_bankroll,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return _campaign_to_response(campaign)


@router.get("/campaigns", response_model=list[CampaignResponse])
def list_campaigns(db: Session = Depends(get_db)):
    """List all campaigns, newest first."""
    campaigns = db.query(Campaign).order_by(Campaign.created_at.desc()).all()
    return [_campaign_to_response(c) for c in campaigns]


@router.get("/campaigns/{campaign_id}", response_model=CampaignDetailResponse)
def get_campaign_detail(campaign_id: int, db: Session = Depends(get_db)):
    """Get campaign details with computed stats."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    bets = (
        db.query(Bet)
        .filter(Bet.campaign_id == campaign_id, Bet.is_backtest == False)
        .order_by(Bet.match_date)
        .all()
    )

    return CampaignDetailResponse(
        campaign=_campaign_to_response(campaign),
        stats=_compute_bet_stats(bets, campaign.initial_bankroll),
    )


@router.patch("/campaigns/{campaign_id}", response_model=CampaignResponse)
def update_campaign(
    campaign_id: int,
    request: CampaignUpdateRequest,
    db: Session = Depends(get_db),
):
    """Update campaign parameters or status."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    update_data = request.model_dump(exclude_unset=True)

    # Convert list fields to CSV for storage
    if "allowed_outcomes" in update_data:
        v = update_data.pop("allowed_outcomes")
        campaign.allowed_outcomes = ",".join(v) if v else None
    if "excluded_leagues" in update_data:
        v = update_data.pop("excluded_leagues")
        campaign.excluded_leagues = ",".join(v) if v else None

    for field, value in update_data.items():
        setattr(campaign, field, value)

    db.commit()
    db.refresh(campaign)
    return _campaign_to_response(campaign)


@router.get("/campaigns/{campaign_id}/recommendations", response_model=CampaignRecommendationsResponse)
def get_campaign_recommendations(
    campaign_id: int,
    demo: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    """Get today's recommendations filtered by campaign strategy."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign.status != "active":
        return CampaignRecommendationsResponse(
            campaign_id=campaign_id,
            current_bankroll=campaign.initial_bankroll,
            recommendations=[],
            total_scanned=0,
        )

    # Compute current bankroll
    settled_bets = (
        db.query(Bet)
        .filter(
            Bet.campaign_id == campaign_id,
            Bet.is_backtest == False,
            Bet.result.in_(["won", "lost"]),
        )
        .all()
    )
    total_pnl = sum(b.profit_loss or 0 for b in settled_bets)
    current_bankroll = campaign.initial_bankroll + total_pnl

    # Parse campaign filters
    allowed = campaign.allowed_outcomes.split(",") if campaign.allowed_outcomes else None
    excluded = campaign.excluded_leagues.split(",") if campaign.excluded_leagues else None

    # Reuse scanner logic
    from src.api.scanner import get_scanned_matches

    filtered_matches, total_scanned, _, _, _ = get_scanned_matches(
        demo=demo,
        min_edge=campaign.min_edge,
        min_prob=campaign.min_model_prob,
        min_odds=campaign.min_odds,
        max_odds=campaign.max_odds,
        outcomes=allowed,
        excluded_leagues=excluded,
    )

    # Build recommendations: one per match (best edge outcome)
    suggested_stake = round(current_bankroll * campaign.flat_stake, 2)
    recommendations: list[CampaignRecommendation] = []

    for m in filtered_matches:
        # Find best value outcome from AIScanMatch fields
        edges = m.edges or {}
        odds_1x2 = m.odds.get("1x2", {}) if isinstance(m.odds, dict) else {}
        prob_map = {"H": m.model_prob_home, "D": m.model_prob_draw, "A": m.model_prob_away}

        best_outcome = None
        best_edge = 0.0
        best_odds_val = 0.0
        best_prob = 0.0
        best_bookmaker = ""

        for key in (allowed or ["H", "D", "A"]):
            edge = edges.get(key, 0)
            if edge <= 0:
                continue
            prob = prob_map.get(key, 0) or 0
            if campaign.min_model_prob and prob < campaign.min_model_prob:
                continue
            bk_odds = odds_1x2.get(key, {})
            if not isinstance(bk_odds, dict):
                continue
            # Find best bookmaker odds
            best_bk = ""
            best_o_val = 0.0
            for bk, val in bk_odds.items():
                fval = float(val) if val else 0
                if fval > best_o_val:
                    best_o_val = fval
                    best_bk = bk
            if best_o_val <= 1:
                continue
            if campaign.min_odds and best_o_val < campaign.min_odds:
                continue
            if campaign.max_odds and best_o_val > campaign.max_odds:
                continue
            if edge > best_edge:
                best_edge = edge
                best_outcome = key
                best_odds_val = best_o_val
                best_prob = prob
                best_bookmaker = best_bk

        if best_outcome is None:
            continue

        implied = round(1 / best_odds_val, 4) if best_odds_val > 0 else 0
        recommendations.append(
            CampaignRecommendation(
                home_team=m.home_team or "",
                away_team=m.away_team or "",
                league=m.league,
                date=m.date,
                outcome=best_outcome,
                model_prob=best_prob,
                implied_prob=implied,
                edge=best_edge,
                best_odds=best_odds_val,
                bookmaker=best_bookmaker,
                suggested_stake=suggested_stake,
            )
        )

    # Sort by edge desc
    recommendations.sort(key=lambda r: r.edge, reverse=True)

    return CampaignRecommendationsResponse(
        campaign_id=campaign_id,
        current_bankroll=round(current_bankroll, 2),
        recommendations=recommendations,
        total_scanned=total_scanned,
    )


@router.post("/campaigns/{campaign_id}/accept", response_model=BetResponse)
def accept_recommendation(
    campaign_id: int,
    request: CampaignAcceptRequest,
    db: Session = Depends(get_db),
):
    """Accept a recommendation — creates a bet linked to the campaign."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status != "active":
        raise HTTPException(status_code=400, detail="Campaign is not active")

    bet = Bet(
        sport="football",
        match_date=datetime.fromisoformat(request.match_date),
        home_team=request.home_team,
        away_team=request.away_team,
        league=request.league,
        outcome_bet=request.outcome,
        odds_at_bet=request.odds,
        stake=request.stake,
        result="pending",
        campaign_id=campaign_id,
    )
    db.add(bet)
    db.commit()
    db.refresh(bet)
    return _bet_to_response(bet)


@router.get("/campaigns/{campaign_id}/bets", response_model=list[BetResponse])
def list_campaign_bets(campaign_id: int, db: Session = Depends(get_db)):
    """List all bets for a campaign: pending first, then settled (newest first)."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    bets = (
        db.query(Bet)
        .filter(Bet.campaign_id == campaign_id, Bet.is_backtest == False)
        .order_by(Bet.match_date.desc())
        .all()
    )
    # pending first
    bets.sort(key=lambda b: (0 if b.result == "pending" else 1, b.match_date))
    return [_bet_to_response(b) for b in bets]


@router.patch("/campaigns/{campaign_id}/bets/{bet_id}", response_model=BetResponse)
def update_bet_result(
    campaign_id: int,
    bet_id: int,
    request: BetUpdateRequest,
    db: Session = Depends(get_db),
):
    """Update the result of a bet and recompute profit/loss."""
    bet = (
        db.query(Bet)
        .filter(Bet.id == bet_id, Bet.campaign_id == campaign_id, Bet.is_backtest == False)
        .first()
    )
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found")

    valid = {"won", "lost", "void", "pending"}
    if request.result not in valid:
        raise HTTPException(status_code=400, detail=f"result must be one of {valid}")

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
    return _bet_to_response(bet)


@router.delete("/campaigns/{campaign_id}/bets/{bet_id}", status_code=204)
def delete_bet(campaign_id: int, bet_id: int, db: Session = Depends(get_db)):
    """Delete a bet from a campaign."""
    bet = (
        db.query(Bet)
        .filter(Bet.id == bet_id, Bet.campaign_id == campaign_id, Bet.is_backtest == False)
        .first()
    )
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found")
    db.delete(bet)
    db.commit()


@router.get("/campaigns/{campaign_id}/history", response_model=list[BankrollPointResponse])
def get_campaign_history(campaign_id: int, db: Session = Depends(get_db)):
    """Get bankroll evolution for a campaign."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    bets = (
        db.query(Bet)
        .filter(
            Bet.campaign_id == campaign_id,
            Bet.is_backtest == False,
            Bet.result.in_(["won", "lost"]),
        )
        .order_by(Bet.match_date)
        .all()
    )

    bankroll = campaign.initial_bankroll
    points = [BankrollPointResponse(date="start", bankroll=bankroll)]

    for bet in bets:
        bankroll += bet.profit_loss or 0
        points.append(BankrollPointResponse(
            date=bet.match_date.strftime("%Y-%m-%d"),
            bankroll=round(bankroll, 2),
        ))

    return points
