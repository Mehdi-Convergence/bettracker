"""Dashboard summary endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.api.deps import require_tier
from src.api.schemas import CampaignSummaryItem, DashboardSummaryResponse
from src.database import get_db
from src.models.bet import Bet
from src.models.campaign import Campaign
from src.models.user import User

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(
    user: User = Depends(require_tier("pro")),
    db: Session = Depends(get_db),
):
    """Return a high-level dashboard summary with campaign details."""
    active_campaigns_list = (
        db.query(Campaign)
        .filter(Campaign.status == "active", Campaign.user_id == user.id)
        .all()
    )

    pending_bets = (
        db.query(Bet)
        .filter(Bet.is_backtest == False, Bet.result == "pending", Bet.user_id == user.id)
        .count()
    )

    won = (
        db.query(Bet)
        .filter(Bet.is_backtest == False, Bet.result == "won", Bet.user_id == user.id)
        .count()
    )
    lost = (
        db.query(Bet)
        .filter(Bet.is_backtest == False, Bet.result == "lost", Bet.user_id == user.id)
        .count()
    )

    # Build per-campaign summaries
    campaign_summaries = []
    for camp in active_campaigns_list:
        camp_bets = db.query(Bet).filter(
            Bet.campaign_id == camp.id,
            Bet.is_backtest == False,
        ).all()
        c_won = sum(1 for b in camp_bets if b.result == "won")
        c_lost = sum(1 for b in camp_bets if b.result == "lost")
        c_pending = sum(1 for b in camp_bets if b.result == "pending")
        c_settled = [b for b in camp_bets if b.result in ("won", "lost")]
        c_staked = sum(b.stake for b in c_settled)
        c_pnl = sum(b.profit_loss or 0 for b in c_settled)
        c_roi = round((c_pnl / c_staked * 100), 2) if c_staked > 0 else 0.0

        campaign_summaries.append(CampaignSummaryItem(
            id=camp.id,
            name=camp.name,
            total_bets=len(camp_bets),
            won=c_won,
            lost=c_lost,
            pending=c_pending,
            roi_pct=c_roi,
        ))

    return DashboardSummaryResponse(
        active_campaigns=len(active_campaigns_list),
        pending_bets=pending_bets,
        recent_results={"won": won, "lost": lost},
        campaign_summaries=campaign_summaries,
    )
