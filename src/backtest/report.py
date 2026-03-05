"""Generate human-readable backtest reports."""

from rich.console import Console
from rich.table import Table

console = Console()


def print_report(metrics: dict):
    """Print a formatted backtest report."""
    console.print("\n[bold]" + "=" * 60 + "[/bold]")
    console.print("[bold]  BACKTEST REPORT: FOOTBALL[/bold]")
    console.print("[bold]" + "=" * 60 + "[/bold]")

    # Performance
    console.print("\n[bold]PERFORMANCE[/bold]")
    console.print(f"  Total Bets:     {metrics['total_bets']}")
    console.print(f"  Win Rate:       {metrics['win_rate']:.1%}")
    roi = metrics['roi_pct']
    roi_color = "green" if roi > 0 else "red"
    console.print(f"  ROI:            [{roi_color}]{roi:+.2f}%[/{roi_color}]")
    pnl = metrics['total_pnl']
    pnl_color = "green" if pnl > 0 else "red"
    console.print(f"  Total PnL:      [{pnl_color}]{pnl:+.2f}[/{pnl_color}]")
    console.print(f"  Final Bankroll: {metrics['final_bankroll']:.2f}")

    # Risk
    console.print("\n[bold]RISK[/bold]")
    console.print(f"  Max Drawdown:   {metrics['max_drawdown_pct']:.1f}%")
    console.print(f"  Longest Loss:   {metrics['longest_losing_streak']} bets")
    console.print(f"  Longest Win:    {metrics['longest_winning_streak']} bets")
    console.print(f"  Avg Stake:      {metrics['avg_stake_pct']:.2f}% of bankroll")

    # Calibration
    console.print("\n[bold]CALIBRATION (Gold Standard)[/bold]")
    if metrics.get("avg_clv") is not None:
        clv = metrics["avg_clv"]
        clv_color = "green" if clv > 0 else "red"
        console.print(f"  Avg CLV:        [{clv_color}]{clv:+.6f}[/{clv_color}]")
        console.print(f"  CLV+ Rate:      {metrics['clv_positive_pct']:.1f}%")
    else:
        console.print("  [dim]CLV data not available[/dim]")

    # Edge
    console.print("\n[bold]EDGE[/bold]")
    console.print(f"  Avg Edge:       {metrics['avg_edge']:.2f}%")
    console.print(f"  Median Edge:    {metrics['median_edge']:.2f}%")
    console.print(f"  Avg Odds:       {metrics['avg_odds']:.2f}")

    # Overfitting checks
    console.print("\n[bold]OVERFITTING CHECK[/bold]")
    warnings = []
    if metrics["avg_edge"] > 5:
        warnings.append("Edge > 5% - likely overfitting!")
    if metrics["roi_pct"] > 15:
        warnings.append("ROI > 15% - likely overfitting!")
    if metrics.get("avg_clv") is not None and metrics["avg_clv"] < 0:
        warnings.append("Negative CLV - model is slower than market")

    if warnings:
        for w in warnings:
            console.print(f"  [red bold]WARNING: {w}[/red bold]")
    else:
        console.print("  [green]All checks passed - results look realistic[/green]")

    console.print("[bold]" + "=" * 60 + "[/bold]")
