# BetTracker - Claude Code Instructions

## Project
Sports betting value bet detection algorithm. Backend-only (no frontend). Python 3.12 + FastAPI + XGBoost.

## Commands
- Run server: `uv run uvicorn src.main:app --reload`
- Run CLI: `uv run python -m src.cli.main <command>`
- Run tests: `uv run pytest`
- Lint: `uv run ruff check src/`
- Migrations: `uv run alembic upgrade head`

## Architecture
- `src/data/` - Data collection pipeline (football-data.co.uk CSVs)
- `src/features/` - Feature engineering (ELO, form, H2H, shots, rest, standings)
- `src/ml/` - ML pipeline (XGBoost, calibration, SHAP, hypertuning)
- `src/backtest/` - Backtesting engine (chronological simulation, metrics, baselines)
- `src/api/` - FastAPI REST endpoints
- `src/cli/` - Typer CLI commands

## Key Rules
- **No look-ahead bias**: features must only use data BEFORE match date
- **Walk-forward validation**: never use standard CV for time series
- **Calibration > accuracy**: optimize log_loss, not accuracy
- **CLV is the gold standard metric**: model must beat closing line
- **Realistic expectations**: edge 2-5%, ROI 2-8%, accuracy 55-67%
- **Pinnacle odds** are the reference (sharpest market)
