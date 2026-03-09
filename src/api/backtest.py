"""Backtest API: run parametric backtests via the API."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from src.api.deps import require_tier
from src.api.schemas import (
    BacktestRequest,
    BacktestResponse,
    BacktestMetricsResponse,
    BacktestBetResponse,
)
from src.backtest.engine import BacktestEngine
from src.backtest.metrics import BacktestMetrics

router = APIRouter(tags=["backtest"], dependencies=[Depends(require_tier("premium"))])


@router.post("/backtest/run", response_model=BacktestResponse)
def run_backtest(request: BacktestRequest):
    """Run a backtest with custom parameters."""
    import pandas as pd

    features_path = Path("data/processed/football_features.parquet")
    if not features_path.exists():
        raise HTTPException(status_code=503, detail="Features not found. Run build_features first.")

    df = pd.read_parquet(features_path)

    engine = BacktestEngine(
        initial_bankroll=request.initial_bankroll,
        flat_stake=request.flat_stake,
        min_edge=request.min_edge,
        min_model_prob=request.min_model_prob,
        max_odds=request.max_odds,
        min_odds=request.min_odds,
        allowed_outcomes=request.allowed_outcomes,
        excluded_leagues=request.excluded_leagues,
        combo_mode=request.combo_mode,
        combo_max_legs=request.combo_max_legs,
        combo_min_odds=request.combo_min_odds,
        combo_max_odds=request.combo_max_odds,
        combo_top_n=request.combo_top_n,
    )

    result = engine.run(df, request.test_seasons)

    if not result["bets"]:
        raise HTTPException(status_code=404, detail="No bets placed with these parameters.")

    metrics_calc = BacktestMetrics()
    metrics = metrics_calc.compute_all(result["bets"], request.initial_bankroll)

    # Build bankroll curve
    bankroll_curve = [request.initial_bankroll]
    for b in result["bets"]:
        bankroll_curve.append(bankroll_curve[-1] + b["pnl"])

    bets_response = [
        BacktestBetResponse(
            date=str(b["date"])[:10],
            match=b["match"],
            league=b["league"],
            outcome_bet=b["outcome_bet"],
            model_prob=b["model_prob"],
            odds=b["odds"],
            stake=b["stake"],
            won=b["won"],
            pnl=b["pnl"],
            bankroll_after=b["bankroll_after"],
            num_legs=b.get("num_legs"),
        )
        for b in result["bets"]
    ]

    return BacktestResponse(
        metrics=BacktestMetricsResponse(
            total_bets=metrics["total_bets"],
            wins=metrics["wins"],
            losses=metrics["losses"],
            win_rate=metrics["win_rate"],
            total_staked=metrics["total_staked"],
            total_pnl=metrics["total_pnl"],
            roi_pct=metrics["roi_pct"],
            final_bankroll=metrics["final_bankroll"],
            bankroll_growth_pct=metrics["bankroll_growth_pct"],
            max_drawdown_pct=metrics["max_drawdown_pct"],
            longest_losing_streak=metrics["longest_losing_streak"],
            longest_winning_streak=metrics["longest_winning_streak"],
            avg_edge=metrics["avg_edge"],
            avg_odds=metrics["avg_odds"],
            avg_clv=metrics.get("avg_clv"),
        ),
        bets=bets_response,
        bankroll_curve=[round(b, 2) for b in bankroll_curve],
        config=result["config"],
    )


@router.get("/backtest/results")
def list_backtest_results():
    """List available backtest configurations."""
    return {
        "message": "Use POST /api/backtest/run with parameters to run a backtest.",
        "example": {
            "initial_bankroll": 200,
            "flat_stake": 0.05,
            "min_edge": 0.02,
            "min_model_prob": 0.55,
            "combo_mode": True,
            "combo_max_legs": 2,
            "combo_min_odds": 1.8,
            "combo_max_odds": 3.0,
        },
    }
