"""Backtest API: run parametric backtests, save/load results."""

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, require_tier
from src.api.schemas import (
    BacktestRequest,
    BacktestResponse,
    BacktestMetricsResponse,
    BacktestBetResponse,
    SaveBacktestRequest,
    SavedBacktestResponse,
    SavedBacktestSummary,
)
from src.backtest.engine import BacktestEngine
from src.backtest.metrics import BacktestMetrics
from src.database import get_db
from src.models.saved_backtest import SavedBacktest
from src.models.user import User

router = APIRouter(tags=["backtest"])


@router.post("/backtest/run", response_model=BacktestResponse, dependencies=[Depends(require_tier("pro"))])
def run_backtest(request: BacktestRequest):
    """Run a backtest with custom parameters. sport='football' or 'tennis'."""
    sport = (request.sport or "football").lower()

    if sport == "tennis":
        result = _run_tennis_backtest(request)
    else:
        result = _run_football_backtest(request)

    if not result["bets"]:
        raise HTTPException(status_code=404, detail="Aucun pari généré avec ces paramètres. Élargissez vos filtres.")

    metrics_calc = BacktestMetrics()
    metrics = metrics_calc.compute_all(result["bets"], request.initial_bankroll)

    bankroll_curve = [request.initial_bankroll]
    for b in result["bets"]:
        bankroll_curve.append(bankroll_curve[-1] + b["pnl"])

    bets_response = [
        BacktestBetResponse(
            date=str(b["date"])[:10],
            match=b["match"],
            league=b.get("league"),
            tournament=b.get("tournament"),
            surface=b.get("surface"),
            outcome_bet=b["outcome_bet"],
            model_prob=b["model_prob"],
            odds=b["odds"],
            stake=b["stake"],
            won=b["won"],
            pnl=b["pnl"],
            bankroll_after=b["bankroll_after"],
            edge=b.get("edge", 0.0),
            clv=b.get("clv"),
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
            avg_ev_per_bet=metrics.get("avg_ev_per_bet", 0.0),
        ),
        bets=bets_response,
        bankroll_curve=[round(b, 2) for b in bankroll_curve],
        config=result["config"],
    )


def _run_football_backtest(request: BacktestRequest) -> dict:
    import pandas as pd

    features_path = Path("data/processed/football_features.parquet")
    if not features_path.exists():
        raise HTTPException(status_code=503, detail="Features not found. Run build_features first.")
    try:
        df = pd.read_parquet(features_path)
    except Exception:
        raise HTTPException(status_code=503, detail="Fichier features corrompu. Relancez build_features.")

    engine = BacktestEngine(
        staking_strategy=request.staking_strategy,
        flat_stake_amount=request.flat_stake_amount,
        pct_bankroll=request.pct_bankroll,
        kelly_fraction=request.kelly_fraction,
        max_stake_pct=request.max_stake_pct,
        initial_bankroll=request.initial_bankroll,
        min_edge=request.min_edge,
        min_model_prob=request.min_model_prob,
        max_odds=request.max_odds,
        min_odds=request.min_odds,
        allowed_outcomes=request.allowed_outcomes,
        excluded_leagues=request.excluded_leagues,
        stop_loss_daily_pct=request.stop_loss_daily_pct,
        stop_loss_total_pct=request.stop_loss_total_pct,
        combo_mode=request.combo_mode,
        combo_max_legs=request.combo_max_legs,
        combo_min_odds=request.combo_min_odds,
        combo_max_odds=request.combo_max_odds,
        combo_top_n=request.combo_top_n,
    )
    return engine.run(df, request.test_seasons)


def _run_tennis_backtest(request: BacktestRequest) -> dict:
    import pandas as pd
    from src.database import SessionLocal
    from src.models.tennis_match import TennisMatch
    from src.backtest.tennis_engine import TennisBacktestEngine

    db = SessionLocal()
    rows = db.query(TennisMatch).all()
    db.close()

    if not rows:
        raise HTTPException(status_code=503, detail="Aucune donnée tennis. Relancez la collecte tennis.")

    df = pd.DataFrame([{
        "id": r.id, "year": r.year, "date": r.date,
        "tournament": r.tournament, "surface": r.surface,
        "series": r.series, "round": r.round,
        "winner": r.winner, "loser": r.loser,
        "winner_rank": r.winner_rank, "loser_rank": r.loser_rank,
        "wsets": r.wsets, "lsets": r.lsets,
        "odds_winner": r.odds_winner, "odds_loser": r.odds_loser,
        "max_odds_winner": r.max_odds_winner, "max_odds_loser": r.max_odds_loser,
        "avg_odds_winner": r.avg_odds_winner, "avg_odds_loser": r.avg_odds_loser,
    } for r in rows])

    engine = TennisBacktestEngine(
        staking_strategy=request.staking_strategy,
        flat_stake_amount=request.flat_stake_amount,
        pct_bankroll=request.pct_bankroll,
        kelly_fraction=request.kelly_fraction,
        max_stake_pct=request.max_stake_pct,
        initial_bankroll=request.initial_bankroll,
        min_edge=request.min_edge,
        min_model_prob=request.min_model_prob,
        max_odds=request.max_odds,
        min_odds=request.min_odds,
        stop_loss_daily_pct=request.stop_loss_daily_pct,
        stop_loss_total_pct=request.stop_loss_total_pct,
    )
    return engine.run(df)


@router.post("/backtest/save", response_model=SavedBacktestSummary)
def save_backtest(
    request: SaveBacktestRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save a backtest result for later retrieval."""
    saved = SavedBacktest(
        user_id=user.id,
        name=request.name,
        sport=request.sport,
        params=json.dumps(request.params),
        metrics=json.dumps(request.metrics),
        bets=json.dumps(request.bets),
        bankroll_curve=json.dumps(request.bankroll_curve),
        config=json.dumps(request.config),
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)

    return SavedBacktestSummary(
        id=saved.id,
        name=saved.name,
        sport=saved.sport,
        roi_pct=request.metrics.get("roi_pct", 0.0),
        total_bets=request.metrics.get("total_bets", 0),
        created_at=str(saved.created_at),
    )


@router.get("/backtest/saved", response_model=list[SavedBacktestSummary])
def list_saved_backtests(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all saved backtests for the current user."""
    rows = (
        db.query(SavedBacktest)
        .filter(SavedBacktest.user_id == user.id)
        .order_by(SavedBacktest.created_at.desc())
        .all()
    )
    results = []
    for r in rows:
        metrics = json.loads(r.metrics)
        results.append(SavedBacktestSummary(
            id=r.id,
            name=r.name,
            sport=r.sport,
            roi_pct=metrics.get("roi_pct", 0.0),
            total_bets=metrics.get("total_bets", 0),
            created_at=str(r.created_at),
        ))
    return results


@router.get("/backtest/saved/{backtest_id}", response_model=SavedBacktestResponse)
def get_saved_backtest(
    backtest_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Load a saved backtest by ID."""
    row = (
        db.query(SavedBacktest)
        .filter(SavedBacktest.id == backtest_id, SavedBacktest.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Backtest introuvable")

    try:
        return SavedBacktestResponse(
            id=row.id,
            name=row.name,
            sport=row.sport,
            params=json.loads(row.params),
            metrics=json.loads(row.metrics),
            bets=json.loads(row.bets),
            bankroll_curve=json.loads(row.bankroll_curve),
            config=json.loads(row.config),
            created_at=str(row.created_at),
        )
    except (json.JSONDecodeError, KeyError):
        raise HTTPException(status_code=500, detail="Données du backtest corrompues")


@router.delete("/backtest/saved/{backtest_id}", status_code=204)
def delete_saved_backtest(
    backtest_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a saved backtest."""
    row = (
        db.query(SavedBacktest)
        .filter(SavedBacktest.id == backtest_id, SavedBacktest.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Backtest introuvable")
    db.delete(row)
    db.commit()
