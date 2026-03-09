"""Dashboard summary endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.api.deps import require_tier
from src.api.schemas import DashboardSummaryResponse
from src.database import get_db
from src.models.bet import Bet
from src.models.campaign import Campaign

router = APIRouter(tags=["dashboard"], dependencies=[Depends(require_tier("pro"))])


@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(db: Session = Depends(get_db)):
    """Return a high-level dashboard summary."""
    active_campaigns = db.query(Campaign).filter(Campaign.status == "active").count()

    pending_bets = (
        db.query(Bet)
        .filter(Bet.is_backtest == False, Bet.result == "pending")
        .count()
    )

    won = (
        db.query(Bet)
        .filter(Bet.is_backtest == False, Bet.result == "won")
        .count()
    )
    lost = (
        db.query(Bet)
        .filter(Bet.is_backtest == False, Bet.result == "lost")
        .count()
    )

    return DashboardSummaryResponse(
        active_campaigns=active_campaigns,
        pending_bets=pending_bets,
        recent_results={"won": won, "lost": lost},
    )
