"""Campaign management: autopilot-assisted betting strategy."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func as sa_func
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
    CampaignVersionResponse,
    CampaignVersionListResponse,
)
from src.api.deps import require_tier
from src.api.helpers import bet_to_response as _bet_to_response
from src.database import get_db
from src.models.bet import Bet
from src.models.campaign import Campaign
from src.models.campaign_version import CampaignVersion
from src.models.user import User

router = APIRouter(tags=["campaigns"])


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
    """Compute stats from a list of bets."""
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
            w_streak += 1; l_streak = 0; max_w = max(max_w, w_streak)
        else:
            l_streak += 1; w_streak = 0; max_l = max(max_l, l_streak)

    clv_values = [b.clv for b in settled if b.clv is not None]
    avg_clv = round(sum(clv_values) / len(clv_values), 4) if clv_values else None

    bankroll = initial_bankroll
    peak = initial_bankroll
    max_dd_pct = 0.0
    max_dd_amt = 0.0
    for b in sorted(settled, key=lambda b: b.match_date):
        bankroll += b.profit_loss or 0
        if bankroll > peak:
            peak = bankroll
        dd_amt = peak - bankroll
        dd_pct = (dd_amt / peak * 100) if peak > 0 else 0
        if dd_pct > max_dd_pct:
            max_dd_pct = dd_pct
            max_dd_amt = dd_amt

    ev_expected = sum((b.edge_at_bet or 0) * b.stake for b in settled)

    def _sub_stats(sub_bets: list[Bet]) -> dict | None:
        if not sub_bets:
            return None
        s_settled = [b for b in sub_bets if b.result in ("won", "lost")]
        s_won = sum(1 for b in s_settled if b.result == "won")
        s_staked = sum(b.stake for b in s_settled)
        s_pnl = sum(b.profit_loss or 0 for b in s_settled)
        s_clvs = [b.clv for b in s_settled if b.clv is not None]
        return {
            "roi_pct": round((s_pnl / s_staked * 100), 2) if s_staked > 0 else 0,
            "total_bets": len(sub_bets),
            "win_rate": round(s_won / len(s_settled), 4) if s_settled else 0,
            "avg_clv": round(sum(s_clvs) / len(s_clvs), 4) if s_clvs else None,
            "total_staked": round(s_staked, 2),
            "total_pnl": round(s_pnl, 2),
        }

    return CampaignStatsResponse(
        total_bets=len(bets), pending_bets=pending, won=won, lost=lost,
        win_rate=round(won / len(settled), 4) if settled else 0,
        total_staked=round(total_staked, 2), total_pnl=round(total_pnl, 2),
        roi_pct=round((total_pnl / total_staked * 100), 2) if total_staked > 0 else 0,
        current_bankroll=round(initial_bankroll + total_pnl, 2),
        longest_winning_streak=max_w, longest_losing_streak=max_l,
        avg_clv=avg_clv, max_drawdown_pct=round(max_dd_pct, 2),
        max_drawdown_amount=round(max_dd_amt, 2), ev_expected=round(ev_expected, 2),
        algo_stats=_sub_stats([b for b in bets if b.source == "algo"]),
        manual_stats=_sub_stats([b for b in bets if b.source == "manual"]),
    )


def _campaign_snapshot(c: Campaign) -> dict:
    return {
        "name": c.name, "status": c.status, "initial_bankroll": c.initial_bankroll,
        "flat_stake": c.flat_stake, "min_edge": c.min_edge, "min_model_prob": c.min_model_prob,
        "min_odds": c.min_odds, "max_odds": c.max_odds,
        "allowed_outcomes": c.allowed_outcomes, "excluded_leagues": c.excluded_leagues,
        "combo_mode": c.combo_mode, "combo_max_legs": c.combo_max_legs,
        "combo_min_odds": c.combo_min_odds, "combo_max_odds": c.combo_max_odds,
        "combo_top_n": c.combo_top_n, "target_bankroll": c.target_bankroll,
    }


def _compute_change_summary(old: dict, new: dict) -> str:
    changes = []
    for key in new:
        if key in ("name", "status"):
            continue
        if old.get(key) != new.get(key):
            changes.append(f"{key}: {old.get(key)} → {new.get(key)}")
    return "; ".join(changes[:5])


def _get_current_version(db: Session, campaign_id: int) -> int:
    result = db.query(sa_func.max(CampaignVersion.version)).filter(
        CampaignVersion.campaign_id == campaign_id
    ).scalar()
    return result or 0


def _create_version(db: Session, campaign_id: int, snapshot: dict, summary: str) -> CampaignVersion:
    current = _get_current_version(db, campaign_id)
    version = CampaignVersion(
        campaign_id=campaign_id, version=current + 1,
        snapshot=snapshot, changed_at=datetime.now(timezone.utc), change_summary=summary,
    )
    db.add(version)
    return version


def _get_user_campaign(db: Session, campaign_id: int, user: User) -> Campaign:
    """Get a campaign belonging to the user, or raise 404."""
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id, Campaign.user_id == user.id
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/campaigns", response_model=CampaignResponse)
def create_campaign(
    request: CampaignCreateRequest,
    user: User = Depends(require_tier("premium")),
    db: Session = Depends(get_db),
):
    campaign = Campaign(
        user_id=user.id, name=request.name, status="active",
        initial_bankroll=request.initial_bankroll, flat_stake=request.flat_stake,
        min_edge=request.min_edge, min_model_prob=request.min_model_prob,
        min_odds=request.min_odds, max_odds=request.max_odds,
        allowed_outcomes=",".join(request.allowed_outcomes) if request.allowed_outcomes else None,
        excluded_leagues=",".join(request.excluded_leagues) if request.excluded_leagues else None,
        combo_mode=request.combo_mode, combo_max_legs=request.combo_max_legs,
        combo_min_odds=request.combo_min_odds, combo_max_odds=request.combo_max_odds,
        combo_top_n=request.combo_top_n, target_bankroll=request.target_bankroll,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    _create_version(db, campaign.id, _campaign_snapshot(campaign), "Création")
    db.commit()
    return _campaign_to_response(campaign)


@router.get("/campaigns", response_model=list[CampaignResponse])
def list_campaigns(user: User = Depends(require_tier("premium")), db: Session = Depends(get_db)):
    campaigns = db.query(Campaign).filter(Campaign.user_id == user.id).order_by(Campaign.created_at.desc()).all()
    return [_campaign_to_response(c) for c in campaigns]


@router.get("/campaigns/{campaign_id}", response_model=CampaignDetailResponse)
def get_campaign_detail(campaign_id: int, user: User = Depends(require_tier("premium")), db: Session = Depends(get_db)):
    campaign = _get_user_campaign(db, campaign_id, user)
    bets = db.query(Bet).filter(Bet.campaign_id == campaign_id, Bet.user_id == user.id, Bet.is_backtest == False).order_by(Bet.match_date).all()
    return CampaignDetailResponse(campaign=_campaign_to_response(campaign), stats=_compute_bet_stats(bets, campaign.initial_bankroll))


@router.patch("/campaigns/{campaign_id}", response_model=CampaignResponse)
def update_campaign(campaign_id: int, request: CampaignUpdateRequest, user: User = Depends(require_tier("premium")), db: Session = Depends(get_db)):
    campaign = _get_user_campaign(db, campaign_id, user)
    old_snapshot = _campaign_snapshot(campaign)
    update_data = request.model_dump(exclude_unset=True)
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
    new_snapshot = _campaign_snapshot(campaign)
    summary = _compute_change_summary(old_snapshot, new_snapshot)
    if summary:
        _create_version(db, campaign.id, new_snapshot, summary)
        db.commit()
    return _campaign_to_response(campaign)


@router.delete("/campaigns/{campaign_id}", status_code=204)
def delete_campaign(campaign_id: int, user: User = Depends(require_tier("premium")), db: Session = Depends(get_db)):
    """Delete a campaign and its associated versions and bets."""
    campaign = _get_user_campaign(db, campaign_id, user)
    db.query(CampaignVersion).filter(CampaignVersion.campaign_id == campaign_id).delete()
    db.query(Bet).filter(Bet.campaign_id == campaign_id, Bet.is_backtest == False).delete()
    db.delete(campaign)
    db.commit()


@router.get("/campaigns/{campaign_id}/recommendations", response_model=CampaignRecommendationsResponse)
def get_campaign_recommendations(campaign_id: int, demo: bool = Query(default=False), user: User = Depends(require_tier("premium")), db: Session = Depends(get_db)):
    campaign = _get_user_campaign(db, campaign_id, user)
    if campaign.status != "active":
        return CampaignRecommendationsResponse(campaign_id=campaign_id, current_bankroll=campaign.initial_bankroll, recommendations=[], total_scanned=0)

    settled_bets = db.query(Bet).filter(Bet.campaign_id == campaign_id, Bet.is_backtest == False, Bet.result.in_(["won", "lost"])).all()
    total_pnl = sum(b.profit_loss or 0 for b in settled_bets)
    current_bankroll = campaign.initial_bankroll + total_pnl

    allowed = campaign.allowed_outcomes.split(",") if campaign.allowed_outcomes else None
    excluded = campaign.excluded_leagues.split(",") if campaign.excluded_leagues else None

    from src.api.scanner import get_scanned_matches
    filtered_matches, total_scanned, _, _, _ = get_scanned_matches(
        demo=demo, min_edge=campaign.min_edge, min_prob=campaign.min_model_prob,
        min_odds=campaign.min_odds, max_odds=campaign.max_odds,
        outcomes=allowed, excluded_leagues=excluded,
    )

    suggested_stake = round(current_bankroll * campaign.flat_stake, 2)
    recommendations: list[CampaignRecommendation] = []
    for m in filtered_matches:
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
        recommendations.append(CampaignRecommendation(
            home_team=m.home_team or "", away_team=m.away_team or "",
            league=m.league, date=m.date, outcome=best_outcome,
            model_prob=best_prob, implied_prob=implied, edge=best_edge,
            best_odds=best_odds_val, bookmaker=best_bookmaker, suggested_stake=suggested_stake,
        ))
    recommendations.sort(key=lambda r: r.edge, reverse=True)
    return CampaignRecommendationsResponse(campaign_id=campaign_id, current_bankroll=round(current_bankroll, 2), recommendations=recommendations, total_scanned=total_scanned)


@router.post("/campaigns/{campaign_id}/accept", response_model=BetResponse)
def accept_recommendation(campaign_id: int, request: CampaignAcceptRequest, user: User = Depends(require_tier("premium")), db: Session = Depends(get_db)):
    campaign = _get_user_campaign(db, campaign_id, user)
    if campaign.status != "active":
        raise HTTPException(status_code=400, detail="Campaign is not active")
    current_ver = _get_current_version(db, campaign_id)
    bet = Bet(
        user_id=user.id, sport="football",
        match_date=datetime.fromisoformat(request.match_date),
        home_team=request.home_team, away_team=request.away_team, league=request.league,
        outcome_bet=request.outcome, odds_at_bet=request.odds, stake=request.stake,
        result="pending", campaign_id=campaign_id, source="algo",
        campaign_version=current_ver if current_ver > 0 else None,
    )
    db.add(bet)
    db.commit()
    db.refresh(bet)
    return _bet_to_response(bet)


@router.get("/campaigns/{campaign_id}/bets", response_model=list[BetResponse])
def list_campaign_bets(campaign_id: int, user: User = Depends(require_tier("premium")), db: Session = Depends(get_db)):
    _get_user_campaign(db, campaign_id, user)
    bets = db.query(Bet).filter(Bet.campaign_id == campaign_id, Bet.is_backtest == False).order_by(Bet.match_date.desc()).all()
    bets.sort(key=lambda b: (0 if b.result == "pending" else 1, b.match_date))
    return [_bet_to_response(b) for b in bets]


@router.patch("/campaigns/{campaign_id}/bets/{bet_id}", response_model=BetResponse)
def update_bet_result(campaign_id: int, bet_id: int, request: BetUpdateRequest, user: User = Depends(require_tier("premium")), db: Session = Depends(get_db)):
    _get_user_campaign(db, campaign_id, user)
    bet = db.query(Bet).filter(Bet.id == bet_id, Bet.campaign_id == campaign_id, Bet.is_backtest == False).first()
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found")
    bet.result = request.result
    if request.result == "won":
        bet.profit_loss = round(bet.stake * (bet.odds_at_bet - 1), 2)
    elif request.result == "lost":
        bet.profit_loss = round(-bet.stake, 2)
    elif request.result == "void":
        bet.profit_loss = 0.0
    else:
        bet.profit_loss = None
    db.commit()
    db.refresh(bet)

    # Trigger smart stop check on settled bets
    if request.result in ("won", "lost"):
        from src.services.notifications import check_smart_stop
        check_smart_stop(db, user.id)
        db.commit()

    return _bet_to_response(bet)


@router.delete("/campaigns/{campaign_id}/bets/{bet_id}", status_code=204)
def delete_bet(campaign_id: int, bet_id: int, user: User = Depends(require_tier("premium")), db: Session = Depends(get_db)):
    _get_user_campaign(db, campaign_id, user)
    bet = db.query(Bet).filter(Bet.id == bet_id, Bet.campaign_id == campaign_id, Bet.is_backtest == False).first()
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found")
    db.delete(bet)
    db.commit()


@router.get("/campaigns/{campaign_id}/history", response_model=list[BankrollPointResponse])
def get_campaign_history(campaign_id: int, user: User = Depends(require_tier("premium")), db: Session = Depends(get_db)):
    campaign = _get_user_campaign(db, campaign_id, user)
    bets = db.query(Bet).filter(Bet.campaign_id == campaign_id, Bet.is_backtest == False, Bet.result.in_(["won", "lost"])).order_by(Bet.match_date).all()
    bankroll = campaign.initial_bankroll
    points = [BankrollPointResponse(date="start", bankroll=bankroll)]
    for bet in bets:
        bankroll += bet.profit_loss or 0
        points.append(BankrollPointResponse(date=bet.match_date.strftime("%Y-%m-%d"), bankroll=round(bankroll, 2)))
    return points


# ---------------------------------------------------------------------------
# Campaign Versions
# ---------------------------------------------------------------------------


@router.get("/campaigns/{campaign_id}/versions", response_model=CampaignVersionListResponse)
def list_campaign_versions(campaign_id: int, user: User = Depends(require_tier("premium")), db: Session = Depends(get_db)):
    _get_user_campaign(db, campaign_id, user)
    versions = db.query(CampaignVersion).filter(CampaignVersion.campaign_id == campaign_id).order_by(CampaignVersion.version.desc()).all()
    current = versions[0].version if versions else 0
    return CampaignVersionListResponse(
        versions=[CampaignVersionResponse(id=v.id, campaign_id=v.campaign_id, version=v.version, snapshot=v.snapshot, changed_at=v.changed_at.isoformat() if v.changed_at else "", change_summary=v.change_summary or "") for v in versions],
        current_version=current,
    )


@router.get("/campaigns/{campaign_id}/versions/{version}", response_model=CampaignVersionResponse)
def get_campaign_version(campaign_id: int, version: int, user: User = Depends(require_tier("premium")), db: Session = Depends(get_db)):
    _get_user_campaign(db, campaign_id, user)
    v = db.query(CampaignVersion).filter(CampaignVersion.campaign_id == campaign_id, CampaignVersion.version == version).first()
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    return CampaignVersionResponse(id=v.id, campaign_id=v.campaign_id, version=v.version, snapshot=v.snapshot, changed_at=v.changed_at.isoformat() if v.changed_at else "", change_summary=v.change_summary or "")
