"""
Seed the database with ~35 realistic football + tennis bets + 2 campaigns for dashboard demo.
Creates a demo user (or reuses existing) and links all data to that user.
Cleans previous seed data first, then re-seeds.

Usage:
    uv run python scripts/seed_dashboard.py                    # uses default demo@bettracker.com
    uv run python scripts/seed_dashboard.py user@example.com   # seeds for specific user email
"""

import sys
import os
import random
import uuid
from datetime import datetime, timedelta

# Ensure project root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bcrypt
from sqlalchemy.orm import Session

from src.database import SessionLocal
from src.models.bet import Bet
from src.models.campaign import Campaign
from src.models.user import User

# ---------------------------------------------------------------------------
# Data pools
# ---------------------------------------------------------------------------

TEAMS_BY_LEAGUE = {
    "E0": [
        ("Arsenal", "Chelsea"),
        ("Liverpool", "Manchester Utd"),
        ("Manchester City", "Tottenham"),
        ("Newcastle", "Aston Villa"),
        ("Brighton", "West Ham"),
        ("Everton", "Wolves"),
        ("Fulham", "Crystal Palace"),
        ("Bournemouth", "Nottingham Forest"),
    ],
    "F1": [
        ("Paris SG", "Marseille"),
        ("Lyon", "Monaco"),
        ("Lille", "Lens"),
        ("Nice", "Rennes"),
        ("Strasbourg", "Nantes"),
        ("Toulouse", "Montpellier"),
    ],
    "SP1": [
        ("Barcelona", "Real Madrid"),
        ("Atletico Madrid", "Sevilla"),
        ("Real Sociedad", "Athletic Bilbao"),
        ("Villarreal", "Real Betis"),
        ("Valencia", "Girona"),
    ],
    "D1": [
        ("Bayern Munich", "Dortmund"),
        ("RB Leipzig", "Leverkusen"),
        ("Freiburg", "Frankfurt"),
        ("Stuttgart", "Wolfsburg"),
        ("Union Berlin", "Hoffenheim"),
    ],
    "I1": [
        ("Inter", "AC Milan"),
        ("Juventus", "Napoli"),
        ("Roma", "Lazio"),
        ("Atalanta", "Fiorentina"),
        ("Bologna", "Torino"),
    ],
}

TENNIS_MATCHUPS = [
    ("Sinner J.", "Djokovic N.", "ATP"),
    ("Alcaraz C.", "Medvedev D.", "ATP"),
    ("Zverev A.", "Rune H.", "ATP"),
    ("Fritz T.", "Ruud C.", "ATP"),
    ("Swiatek I.", "Sabalenka A.", "WTA"),
    ("Gauff C.", "Rybakina E.", "WTA"),
]

TODAY = datetime(2026, 3, 9)
random.seed(42)


def _random_odds() -> float:
    return round(random.uniform(1.40, 4.00), 2)


def _closing_odds(opening: float) -> float:
    drift = random.uniform(-0.15, 0.15)
    return round(max(1.05, opening + drift), 2)


def _random_stake() -> float:
    return float(random.choice([5, 10, 10, 10, 15, 15, 20]))


def build_football_bets() -> list[dict]:
    """Generate ~26 football bets spread over the last 60 days."""
    bets: list[dict] = []
    leagues = list(TEAMS_BY_LEAGUE.keys())

    for i in range(26):
        league = random.choice(leagues)
        home, away = random.choice(TEAMS_BY_LEAGUE[league])
        if random.random() < 0.5:
            home, away = away, home

        outcome = random.choice(["H", "H", "D", "A", "A"])
        odds = _random_odds()
        close = _closing_odds(odds)
        stake = _random_stake()
        days_ago = random.randint(1, 60)
        match_date = TODAY - timedelta(days=days_ago)

        bets.append(
            dict(
                sport="football",
                league=league,
                home_team=home,
                away_team=away,
                outcome_bet=outcome,
                odds_at_bet=odds,
                odds_at_close=close,
                stake=stake,
                match_date=match_date,
                is_settled=True,
                days_ago=days_ago,
                combo_group=None,
            )
        )
    return bets


def build_tennis_bets() -> list[dict]:
    """Generate 4 tennis bets."""
    bets: list[dict] = []
    for i in range(4):
        home, away, league = TENNIS_MATCHUPS[i]
        odds = _random_odds()
        close = _closing_odds(odds)
        stake = _random_stake()
        days_ago = random.randint(1, 45)
        bets.append(
            dict(
                sport="tennis",
                league=league,
                home_team=home,
                away_team=away,
                outcome_bet=random.choice(["H", "A"]),
                odds_at_bet=odds,
                odds_at_close=close,
                stake=stake,
                match_date=TODAY - timedelta(days=days_ago),
                is_settled=True,
                days_ago=days_ago,
                combo_group=None,
            )
        )
    return bets


def build_combo_bets() -> list[dict]:
    """Generate 1 combo bet (3 legs) — all won, placed 5 days ago."""
    group_id = f"combo_{uuid.uuid4().hex[:8]}"
    legs = [
        ("football", "D1", "Bayern Munich", "Dortmund", "H", 1.55),
        ("football", "E0", "Arsenal", "Chelsea", "H", 1.72),
        ("football", "SP1", "Barcelona", "Real Madrid", "H", 2.10),
    ]
    bets = []
    for sport, league, home, away, outcome, odds in legs:
        close = _closing_odds(odds)
        bets.append(
            dict(
                sport=sport,
                league=league,
                home_team=home,
                away_team=away,
                outcome_bet=outcome,
                odds_at_bet=odds,
                odds_at_close=close,
                stake=10.0,  # combo stake on each leg (display only, counted once)
                match_date=TODAY - timedelta(days=5),
                is_settled=True,
                days_ago=5,
                combo_group=group_id,
            )
        )
    return bets


def build_pending_bets() -> list[dict]:
    """Generate 4 pending bets with future dates."""
    pending: list[dict] = []
    future_matchups = [
        ("football", "E0", "Arsenal", "Liverpool"),
        ("football", "SP1", "Barcelona", "Atletico Madrid"),
        ("football", "I1", "Inter", "Juventus"),
        ("tennis", "ATP", "Sinner J.", "Alcaraz C."),
    ]
    for sport, league, home, away in future_matchups:
        odds = _random_odds()
        stake = _random_stake()
        days_ahead = random.randint(1, 7)
        pending.append(
            dict(
                sport=sport,
                league=league,
                home_team=home,
                away_team=away,
                outcome_bet=random.choice(["H", "A"]),
                odds_at_bet=odds,
                odds_at_close=None,
                stake=stake,
                match_date=TODAY + timedelta(days=days_ahead),
                is_settled=False,
                days_ago=-days_ahead,
                combo_group=None,
            )
        )
    return pending


def assign_results(bets: list[dict], win_rate: float = 0.60) -> list[dict]:
    settled = [b for b in bets if b["is_settled"] and b.get("combo_group") is None]
    combo = [b for b in bets if b["is_settled"] and b.get("combo_group") is not None]
    pending = [b for b in bets if not b["is_settled"]]

    random.shuffle(settled)
    n_wins = round(len(settled) * win_rate)

    for i, bet in enumerate(settled):
        if i < n_wins:
            bet["result"] = "won"
            bet["profit_loss"] = round(bet["stake"] * (bet["odds_at_bet"] - 1), 2)
        else:
            bet["result"] = "lost"
            bet["profit_loss"] = -bet["stake"]
        if bet["odds_at_close"] is not None:
            bet["clv"] = round(
                (bet["odds_at_close"] - bet["odds_at_bet"]) / bet["odds_at_bet"], 4
            )
        else:
            bet["clv"] = None

    # Combo legs: all won (the combo won)
    combined_odds = 1.0
    for leg in combo:
        combined_odds *= leg["odds_at_bet"]
    for i, leg in enumerate(combo):
        leg["result"] = "won"
        if i == 0:
            # First leg carries the combo P&L
            leg["profit_loss"] = round(leg["stake"] * (combined_odds - 1), 2)
        else:
            leg["profit_loss"] = 0.0
        leg["clv"] = round(
            (leg["odds_at_close"] - leg["odds_at_bet"]) / leg["odds_at_bet"], 4
        ) if leg["odds_at_close"] else None

    for bet in pending:
        bet["result"] = "pending"
        bet["profit_loss"] = None
        bet["clv"] = None

    return settled + combo + pending


def _get_or_create_user(db: Session, email: str) -> User:
    """Get existing user or create a demo user."""
    user = db.query(User).filter(User.email == email).first()
    if user:
        print(f"Using existing user: {email} (id={user.id})")
        return user
    hashed = bcrypt.hashpw("DemoPass1".encode(), bcrypt.gensalt()).decode()
    user = User(
        email=email,
        hashed_password=hashed,
        display_name="Demo User",
        tier="premium",
        is_active=True,
        onboarding_completed=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"Created demo user: {email} / DemoPass1 (id={user.id}, tier=premium)")
    return user


def seed(email: str = "demo@bettracker.com"):
    db: Session = SessionLocal()
    try:
        user = _get_or_create_user(db, email)

        # Clean previous seed data for this user (non-backtest bets)
        db.query(Bet).filter(
            Bet.user_id == user.id,
            Bet.is_backtest == False,
        ).delete(synchronize_session=False)
        # Clean previous campaigns for this user
        db.query(Campaign).filter(Campaign.user_id == user.id).delete(synchronize_session=False)
        db.commit()

        # Create campaign 1: Value Bet Auto (active)
        campaign1 = Campaign(
            user_id=user.id,
            name="Value Bet Auto",
            status="active",
            initial_bankroll=500.0,
            flat_stake=0.05,
            min_edge=0.03,
            min_model_prob=0.55,
            min_odds=None,
            max_odds=None,
            allowed_outcomes="H,D,A",
            excluded_leagues=None,
            combo_mode=False,
            combo_max_legs=4,
            combo_min_odds=1.8,
            combo_max_odds=3.0,
            combo_top_n=3,
            target_bankroll=1000.0,
        )
        # Create campaign 2: Tennis Edge (active)
        campaign2 = Campaign(
            user_id=user.id,
            name="Tennis Edge ATP",
            status="active",
            initial_bankroll=300.0,
            flat_stake=0.04,
            min_edge=0.04,
            min_model_prob=0.58,
            min_odds=1.40,
            max_odds=3.00,
            allowed_outcomes="H,A",
            excluded_leagues=None,
            combo_mode=False,
            combo_max_legs=2,
            combo_min_odds=1.8,
            combo_max_odds=3.0,
            combo_top_n=2,
            target_bankroll=600.0,
        )
        db.add_all([campaign1, campaign2])
        db.commit()
        db.refresh(campaign1)
        db.refresh(campaign2)

        # Build and seed bets
        all_bets = (
            build_football_bets()
            + build_tennis_bets()
            + build_combo_bets()
            + build_pending_bets()
        )
        all_bets = assign_results(all_bets, win_rate=0.60)

        # Assign some settled bets to campaigns
        settled_football = [b for b in all_bets if b["result"] in ("won", "lost") and b.get("combo_group") is None and b["sport"] == "football"]
        settled_tennis = [b for b in all_bets if b["result"] in ("won", "lost") and b.get("combo_group") is None and b["sport"] == "tennis"]

        campaign1_ids = set(id(b) for b in settled_football[:8])
        campaign2_ids = set(id(b) for b in settled_tennis[:3])

        sources = ["scanner", "scanner", "scanner", "manual", "algo"]
        bookmakers = ["Betclic", "Winamax", "Unibet", "Pinnacle", "Bet365"]

        for b in all_bets:
            cid = None
            if id(b) in campaign1_ids:
                cid = campaign1.id
            elif id(b) in campaign2_ids:
                cid = campaign2.id

            bet = Bet(
                user_id=user.id,
                sport=b["sport"],
                match_date=b["match_date"],
                home_team=b["home_team"],
                away_team=b["away_team"],
                outcome_bet=b["outcome_bet"],
                odds_at_bet=b["odds_at_bet"],
                odds_at_close=b["odds_at_close"],
                stake=b["stake"],
                result=b["result"],
                profit_loss=b["profit_loss"],
                clv=b["clv"],
                league=b["league"],
                combo_group=b.get("combo_group"),
                campaign_id=cid,
                is_backtest=False,
                source=random.choice(sources),
                bookmaker=random.choice(bookmakers),
                edge_at_bet=round(random.uniform(0.02, 0.12), 3) if b["result"] != "pending" else None,
            )
            db.add(bet)

        db.commit()

        # Summary
        won = sum(1 for b in all_bets if b["result"] == "won")
        lost = sum(1 for b in all_bets if b["result"] == "lost")
        pending = sum(1 for b in all_bets if b["result"] == "pending")
        combo_count = sum(1 for b in all_bets if b.get("combo_group"))
        camp1_count = len(campaign1_ids)
        camp2_count = len(campaign2_ids)
        total_pl = sum(b["profit_loss"] for b in all_bets if b["profit_loss"] is not None)
        print(f"\nSeeded {len(all_bets)} bets (incl. {combo_count} combo legs)")
        print(f"  Won: {won}  |  Lost: {lost}  |  Pending: {pending}")
        print(f"  Total P/L: {total_pl:+.2f} EUR")
        print(f"  Campaign '{campaign1.name}' (id={campaign1.id}): {camp1_count} bets")
        print(f"  Campaign '{campaign2.name}' (id={campaign2.id}): {camp2_count} bets")
        print(f"\nAll data linked to user: {user.email} (id={user.id})")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "demo@bettracker.com"
    seed(email)
