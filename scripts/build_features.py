"""Build feature dataset from historical matches."""
import time

import pandas as pd

from src.database import SessionLocal
from src.features.football_features import FootballFeatureBuilder, FEATURE_COLUMNS
from src.models.match import FootballMatch


def main():
    print("Loading matches from DB...")
    db = SessionLocal()
    matches = db.query(FootballMatch).order_by(FootballMatch.date).all()
    db.close()

    data = []
    for m in matches:
        data.append({
            "id": m.id, "season": m.season, "league": m.league,
            "date": m.date, "home_team": m.home_team, "away_team": m.away_team,
            "fthg": m.fthg, "ftag": m.ftag, "ftr": m.ftr,
            "hthg": m.hthg, "htag": m.htag,
            "home_shots": m.home_shots, "away_shots": m.away_shots,
            "home_shots_target": m.home_shots_target, "away_shots_target": m.away_shots_target,
            "home_corners": m.home_corners, "away_corners": m.away_corners,
            "home_fouls": m.home_fouls, "away_fouls": m.away_fouls,
            "home_yellow": m.home_yellow, "away_yellow": m.away_yellow,
            "home_red": m.home_red, "away_red": m.away_red,
            "home_xg": m.home_xg, "away_xg": m.away_xg,
            "odds_home": m.odds_home, "odds_draw": m.odds_draw, "odds_away": m.odds_away,
            "odds_home_close": m.odds_home_close, "odds_draw_close": m.odds_draw_close,
            "odds_away_close": m.odds_away_close,
            "max_odds_home": m.max_odds_home, "max_odds_draw": m.max_odds_draw,
            "max_odds_away": m.max_odds_away,
            "avg_odds_home": m.avg_odds_home, "avg_odds_draw": m.avg_odds_draw,
            "avg_odds_away": m.avg_odds_away,
        })
    df = pd.DataFrame(data)
    print(f"Loaded {len(df)} matches")

    print("Building features...")
    start = time.time()
    builder = FootballFeatureBuilder()
    features_df = builder.build_dataset(df)
    elapsed = time.time() - start

    print(f"\nDone in {elapsed:.1f}s")
    print(f"Feature dataset: {len(features_df)} rows x {len(features_df.columns)} cols")
    print(f"\nTarget distribution:")
    print(features_df["ftr"].value_counts().to_string())

    # NaN analysis
    print(f"\nNaN % for key features:")
    for col in FEATURE_COLUMNS:
        if col in features_df.columns:
            pct = features_df[col].isna().mean() * 100
            if pct > 0:
                print(f"  {col}: {pct:.1f}%")

    # Sample
    print(f"\nSample features (row 100):")
    sample_cols = ["elo_diff", "home_form_5", "away_form_5", "home_goal_diff_3",
                   "h2h_home_win_rate", "home_position", "implied_home"]
    print(features_df.iloc[100][[c for c in sample_cols if c in features_df.columns]].to_string())

    # Remove xG features (100% NaN - no data available)
    xg_cols = [c for c in features_df.columns if "xg" in c]
    features_df = features_df.drop(columns=xg_cols)
    print(f"\nDropped xG features (no data): {xg_cols}")

    # Save
    import os
    os.makedirs("data/processed", exist_ok=True)
    features_df.to_parquet("data/processed/football_features.parquet", index=False)
    print(f"Saved to data/processed/football_features.parquet ({len(features_df)} rows)")


if __name__ == "__main__":
    main()
