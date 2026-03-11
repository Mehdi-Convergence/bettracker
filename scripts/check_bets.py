"""Quick script to check bet data in DB."""
from sqlalchemy import create_engine, text
from src.config import settings

engine = create_engine(settings.DATABASE_URL)
with engine.connect() as conn:
    r = conn.execute(text(
        "SELECT id, home_team, away_team, odds_at_bet, stake, result, profit_loss, league "
        "FROM bets WHERE result IN ('won','lost') AND profit_loss IS NOT NULL AND profit_loss != 0 "
        "ORDER BY id DESC LIMIT 10"
    ))
    rows = r.fetchall()
    print(f"Paris avec resultat et P&L non-nul: {len(rows)}")
    for row in rows:
        print(f"  #{row[0]} {row[1]} vs {row[2]} | @{row[3]} | {row[4]}e | {row[5]} | P&L: {row[6]}e | {row[7]}")

    # Also count by result
    r2 = conn.execute(text("SELECT result, count(*) FROM bets GROUP BY result"))
    print("\nRepartition:")
    for row in r2.fetchall():
        print(f"  {row[0]}: {row[1]}")
