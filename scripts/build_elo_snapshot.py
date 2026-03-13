"""Build ELO snapshot from all historical football matches.

Reads all FootballMatch rows from the DB in chronological order, runs the
same iterative ELO algorithm used during backtest training, and saves the
final ratings to models/football/elo_ratings.json.

Usage:
    uv run python scripts/build_elo_snapshot.py
"""
import json
import math
import sys
from pathlib import Path

# Allow running from repo root without installing the package
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.config import settings
from src.database import SessionLocal
from src.models.match import FootballMatch


def main() -> None:
    print("Chargement des matchs depuis la DB...")
    db = SessionLocal()
    matches = db.query(FootballMatch).order_by(FootballMatch.date).all()
    db.close()
    print(f"  {len(matches)} matchs charges")

    # --- ELO parameters (same as EloRatingSystem in src/features/elo.py) ---
    k_factor: float = settings.ELO_K_FACTOR          # 32.0
    home_adv: float = settings.ELO_HOME_ADVANTAGE     # 65.0
    initial: float = settings.ELO_INITIAL             # 1500.0

    result_map = {"H": 1.0, "D": 0.5, "A": 0.0}
    ratings: dict[str, float] = {}

    def get_rating(team: str) -> float:
        return ratings.get(team, initial)

    def update(home: str, away: str, result: float, goal_diff: int) -> None:
        home_r = get_rating(home)
        away_r = get_rating(away)

        # Expected score with home advantage (mirrors EloRatingSystem.expected_score)
        diff = away_r - home_r - home_adv
        expected_home = 1.0 / (1.0 + 10 ** (diff / 400.0))

        margin_mult = max(1.0, math.sqrt(1 + abs(goal_diff)))

        ratings[home] = home_r + k_factor * margin_mult * (result - expected_home)
        ratings[away] = away_r + k_factor * margin_mult * ((1 - result) - (1 - expected_home))

    print("Calcul des ELO iteratifs...")
    for idx, m in enumerate(matches):
        result = result_map.get(m.ftr, 0.5)
        goal_diff = abs(m.fthg - m.ftag)
        update(m.home_team, m.away_team, result, goal_diff)

        if (idx + 1) % 5000 == 0:
            print(f"  {idx + 1}/{len(matches)} matchs traites...")

    print(f"ELO calcule pour {len(ratings)} equipes")

    if ratings:
        sorted_ratings = sorted(ratings.items(), key=lambda x: x[1], reverse=True)
        print(f"  Min ELO : {min(ratings.values()):.1f}")
        print(f"  Max ELO : {max(ratings.values()):.1f}")
        print(f"  Moyenne : {sum(ratings.values()) / len(ratings):.1f}")
        print("  Top 10 equipes :")
        for team, elo in sorted_ratings[:10]:
            print(f"    {team}: {elo:.1f}")

    # --- Sauvegarde ---
    output_path = Path("models/football/elo_ratings.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Arrondir a 2 decimales pour limiter la taille du fichier
    ratings_rounded = {team: round(elo, 2) for team, elo in ratings.items()}
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(ratings_rounded, f, ensure_ascii=False, indent=2, sort_keys=True)

    print(f"Snapshot ELO sauvegarde dans {output_path} ({len(ratings_rounded)} equipes)")


if __name__ == "__main__":
    main()
