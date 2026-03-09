from typing import Optional

import typer
from rich.console import Console

app = typer.Typer(name="bettracker", help="BetTracker CLI - Value bet detection for football")
console = Console()


@app.command()
def collect(
    sport: str = typer.Option("football", help="Sport to collect data for"),
    seasons: Optional[str] = typer.Option(None, help="Comma-separated season codes (e.g., 2324,2425)"),
    leagues: Optional[str] = typer.Option(None, help="Comma-separated league codes (e.g., E0,F1)"),
):
    """Download and ingest historical data."""
    if sport == "football":
        from src.data.football_collector import FootballCollector

        collector = FootballCollector()
        season_list = seasons.split(",") if seasons else None
        league_list = leagues.split(",") if leagues else None
        collector.collect_and_ingest(seasons=season_list, leagues=league_list)
    else:
        console.print(f"[red]Sport '{sport}' not yet supported. Use 'football'.[/red]")


@app.command()
def build_features():
    """Build feature dataset from historical matches."""
    import subprocess
    import sys

    result = subprocess.run(
        [sys.executable, "scripts/build_features.py"],
        env={"PYTHONPATH": "."},
    )
    raise typer.Exit(result.returncode)


@app.command()
def train(
    sport: str = typer.Option("football", help="Sport to train model for"),
):
    """Train ML model with walk-forward validation and run backtesting."""
    import subprocess
    import sys

    result = subprocess.run(
        [sys.executable, "scripts/train_and_backtest.py"],
        env={"PYTHONPATH": "."},
    )
    raise typer.Exit(result.returncode)


@app.command()
def scan(
    sport: str = typer.Option("football", help="Sport to scan for value bets"),
):
    """Scan upcoming matches for value bets. Use the web UI or API instead."""
    console.print("[yellow]CLI scan is deprecated. Use the API endpoint instead:[/yellow]")
    console.print("  curl http://localhost:8000/api/scanner/ai-scan?sport=football")
    console.print("  curl http://localhost:8000/api/scanner/ai-scan?sport=tennis")


@app.command()
def dbinfo():
    """Show database statistics."""
    from sqlalchemy import func

    from src.database import SessionLocal
    from src.models.match import FootballMatch

    db = SessionLocal()

    total = db.query(FootballMatch).count()
    console.print("\n[bold]Database Statistics[/bold]")
    console.print(f"Total football matches: [green]{total}[/green]")

    if total > 0:
        breakdown = (
            db.query(
                FootballMatch.league,
                FootballMatch.season,
                func.count(FootballMatch.id),
            )
            .group_by(FootballMatch.league, FootballMatch.season)
            .order_by(FootballMatch.league, FootballMatch.season)
            .all()
        )
        console.print("\n[bold]By league and season:[/bold]")
        for league, season, count in breakdown:
            console.print(f"  {league} {season}: {count} matches")

        # Odds coverage
        with_odds = (
            db.query(FootballMatch)
            .filter(FootballMatch.odds_home.isnot(None))
            .count()
        )
        with_close = (
            db.query(FootballMatch)
            .filter(FootballMatch.odds_home_close.isnot(None))
            .count()
        )
        console.print("\n[bold]Odds coverage:[/bold]")
        console.print(f"  With opening odds: {with_odds}/{total} ({with_odds/total*100:.1f}%)")
        console.print(f"  With closing odds: {with_close}/{total} ({with_close/total*100:.1f}%)")

    db.close()


@app.command()
def serve(
    host: str = typer.Option("127.0.0.1", help="Host to bind"),
    port: int = typer.Option(8000, help="Port to bind"),
):
    """Start the FastAPI server."""
    import uvicorn

    uvicorn.run("src.main:app", host=host, port=port, reload=True)


if __name__ == "__main__":
    app()
