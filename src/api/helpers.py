"""Shared API helpers."""

from src.api.schemas import BetResponse
from src.models.bet import Bet


def bet_to_response(b: Bet) -> BetResponse:
    """Convert a Bet ORM instance to a BetResponse schema."""
    return BetResponse(
        id=b.id,
        sport=b.sport or "football",
        home_team=b.home_team,
        away_team=b.away_team,
        league=b.league or "",
        match_date=b.match_date.isoformat(),
        outcome_bet=b.outcome_bet,
        odds_at_bet=b.odds_at_bet,
        odds_at_close=b.odds_at_close,
        stake=b.stake,
        result=b.result or "pending",
        profit_loss=b.profit_loss,
        clv=b.clv,
        campaign_id=b.campaign_id,
        combo_group=b.combo_group,
        source=b.source,
        bookmaker=b.bookmaker,
        edge_at_bet=b.edge_at_bet,
        note=b.note,
        campaign_version=b.campaign_version,
        created_at=b.created_at.isoformat() if b.created_at else "",
    )
