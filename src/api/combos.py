"""Combo bet generation and simulation endpoints."""

from fastapi import APIRouter

from src.api.schemas import (
    ComboGenerateRequest,
    ComboResponse,
    ComboLegResponse,
    ComboSimulateRequest,
    ComboSimulateResponse,
)
from src.ml.combo_engine import ComboEngine, ComboLeg

router = APIRouter(tags=["combos"])


@router.post("/combos/generate", response_model=list[ComboResponse])
def generate_combos(request: ComboGenerateRequest):
    """Generate optimal combos from selected legs."""
    legs = [
        ComboLeg(
            match=f"{l.home_team} vs {l.away_team}",
            league=l.league,
            date=l.date,
            outcome=l.outcome,
            odds=l.odds,
            model_prob=l.model_prob,
            implied_prob=round(1.0 / l.odds, 4),
            edge=round(l.model_prob - 1.0 / l.odds, 4),
        )
        for l in request.legs
    ]

    engine = ComboEngine(
        max_legs=request.max_legs,
        min_combo_odds=request.min_combo_odds,
        max_combo_odds=request.max_combo_odds,
        min_leg_prob=request.min_leg_prob,
    )

    combos = engine.generate_combos(legs)
    ranked = engine.rank_combos(combos, top_n=request.top_n)

    return [
        ComboResponse(
            legs=[
                ComboLegResponse(
                    match=l.match,
                    league=l.league,
                    outcome=l.outcome,
                    odds=l.odds,
                    model_prob=l.model_prob,
                )
                for l in c.legs
            ],
            num_legs=c.num_legs,
            combined_odds=c.combined_odds,
            combined_prob=c.combined_prob,
            ev=c.ev,
            potential_gain_per_unit=round(c.combined_odds - 1, 3),
        )
        for c in ranked
    ]


@router.post("/combos/simulate", response_model=ComboSimulateResponse)
def simulate_combo(request: ComboSimulateRequest):
    """Simulate a specific combo bet."""
    combined_odds = 1.0
    combined_prob = 1.0

    for leg in request.legs:
        combined_odds *= leg.odds
        combined_prob *= leg.model_prob

    ev = combined_prob * combined_odds - 1.0
    potential_gain = request.stake * (combined_odds - 1)

    return ComboSimulateResponse(
        combined_odds=round(combined_odds, 3),
        combined_prob=round(combined_prob, 4),
        ev=round(ev, 4),
        stake=request.stake,
        potential_gain=round(potential_gain, 2),
        num_legs=len(request.legs),
    )
