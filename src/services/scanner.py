"""Live value bet scanner: detect value bets on upcoming matches."""

from pathlib import Path

import numpy as np
import pandas as pd
from rich.console import Console
from rich.table import Table

from src.config import settings
from src.data.odds_collector import OddsCollector
from src.features.football_features import FootballFeatureBuilder, FEATURE_COLUMNS
from src.ml.football_model import FootballModel, MODEL_FEATURES, LABEL_MAP
from src.ml.value_detector import MatchOutcomes, ValueBet, ValueDetector

console = Console()


class Scanner:
    """Scan upcoming matches for value bets using trained model + live odds."""

    def __init__(self, model_path: Path = Path("models/football")):
        self.model = FootballModel()
        self.model.load(model_path)
        self.odds_collector = OddsCollector()
        self.value_detector = ValueDetector()

    def scan(self) -> list[ValueBet]:
        """Full scan pipeline: fetch odds -> build features -> detect value."""
        # 1. Fetch live odds
        active_leagues = [
            l for l in ["E0", "D1", "I1", "SP1", "N1"]
            if l not in (settings.EXCLUDED_LEAGUES or [])
        ]

        console.print(f"[bold]Fetching odds for {len(active_leagues)} leagues...[/bold]")
        matches_with_odds = self.odds_collector.get_upcoming_odds(leagues=active_leagues)

        if not matches_with_odds:
            console.print("[yellow]No upcoming matches found.[/yellow]")
            return []

        quota = self.odds_collector.get_quota()
        console.print(f"  Found {len(matches_with_odds)} upcoming matches")
        if quota["remaining"] is not None:
            console.print(f"  API quota: {quota['remaining']} requests remaining")

        # 2. Build features for each match
        console.print("\n[bold]Building features...[/bold]")
        features_path = Path("data/processed/football_features.parquet")
        if not features_path.exists():
            console.print("[red]Historical features not found. Run build_features.py first.[/red]")
            return []

        historical_df = pd.read_parquet(features_path)
        match_features, match_infos, odds_list = self._build_live_features(
            matches_with_odds, historical_df
        )

        if not match_features:
            console.print("[yellow]Could not build features for any match.[/yellow]")
            return []

        # 3. Predict probabilities
        console.print(f"\n[bold]Predicting {len(match_features)} matches...[/bold]")
        X = np.array(match_features)
        probas = self.model.predict_proba(X)

        # 4. Detect value bets
        value_bets = self.value_detector.detect_batch(match_infos, probas, odds_list)

        return value_bets

    def scan_matches(self) -> list[MatchOutcomes]:
        """Full scan pipeline returning all 3 outcomes per match."""
        active_leagues = [
            l for l in ["E0", "D1", "I1", "SP1", "N1"]
            if l not in (settings.EXCLUDED_LEAGUES or [])
        ]

        console.print(f"[bold]Fetching odds for {len(active_leagues)} leagues...[/bold]")
        matches_with_odds = self.odds_collector.get_upcoming_odds(leagues=active_leagues)

        if not matches_with_odds:
            console.print("[yellow]No upcoming matches found.[/yellow]")
            return []

        console.print(f"  Found {len(matches_with_odds)} upcoming matches")

        features_path = Path("data/processed/football_features.parquet")
        if not features_path.exists():
            console.print("[red]Historical features not found.[/red]")
            return []

        historical_df = pd.read_parquet(features_path)
        match_features, match_infos, odds_list = self._build_live_features(
            matches_with_odds, historical_df
        )

        if not match_features:
            return []

        X = np.array(match_features)
        probas = self.model.predict_proba(X)

        return self.value_detector.detect_all_batch(match_infos, probas, odds_list)

    def _build_live_features(
        self,
        matches_with_odds: list[dict],
        historical_df: pd.DataFrame,
    ) -> tuple[list, list, list]:
        """Build feature vectors for upcoming matches using historical data.

        Uses the most recent historical data to compute ELO, form, etc.
        For implied odds features, uses the current live Pinnacle odds.
        """
        match_features = []
        match_infos = []
        odds_list = []

        # Get the latest historical features per team for quick lookup
        latest_by_team = self._get_latest_team_stats(historical_df)

        for match in matches_with_odds:
            home = match["home_team"]
            away = match["away_team"]
            league = match["league"]

            # Find closest team name matches (handle API vs DB name differences)
            home_key = self._find_team(home, latest_by_team)
            away_key = self._find_team(away, latest_by_team)

            if home_key is None or away_key is None:
                continue

            home_stats = latest_by_team[home_key]
            away_stats = latest_by_team[away_key]

            # Build feature vector using latest known stats
            features = self._compose_features(home_stats, away_stats, match["odds"])

            if features is not None:
                match_features.append(features)
                match_infos.append({
                    "match_id": match.get("match_id"),
                    "home_team": home,
                    "away_team": away,
                    "league": league,
                    "date": match.get("date", ""),
                })
                odds_list.append(match["odds"])

        console.print(f"  Built features for {len(match_features)}/{len(matches_with_odds)} matches")
        return match_features, match_infos, odds_list

    def _get_latest_team_stats(self, df: pd.DataFrame) -> dict:
        """Extract latest feature values per team from historical data."""
        stats = {}

        # For each team, get their most recent match (as home or away)
        all_teams = set(df["home_team"].unique()) | set(df["away_team"].unique())

        for team in all_teams:
            # Most recent match as home
            home_matches = df[df["home_team"] == team].sort_values("date")
            # Most recent match as away
            away_matches = df[df["away_team"] == team].sort_values("date")

            if home_matches.empty and away_matches.empty:
                continue

            # Use whichever is more recent
            latest_home = home_matches.iloc[-1] if not home_matches.empty else None
            latest_away = away_matches.iloc[-1] if not away_matches.empty else None

            if latest_home is not None and latest_away is not None:
                if latest_home["date"] >= latest_away["date"]:
                    latest = latest_home
                    role = "home"
                else:
                    latest = latest_away
                    role = "away"
            elif latest_home is not None:
                latest = latest_home
                role = "home"
            else:
                latest = latest_away
                role = "away"

            stats[team] = {
                "latest": latest,
                "role": role,
                "elo": latest.get("home_elo") if role == "home" else latest.get("away_elo"),
            }

        return stats

    def _compose_features(
        self, home_stats: dict, away_stats: dict, odds: dict
    ) -> list | None:
        """Compose a feature vector for a live match from historical team stats."""
        home_latest = home_stats["latest"]
        away_latest = away_stats["latest"]
        home_role = home_stats["role"]
        away_role = away_stats["role"]

        try:
            features = {}

            # ELO
            home_elo = home_stats["elo"] or 1500.0
            away_elo = away_stats["elo"] or 1500.0
            features["elo_diff"] = home_elo - away_elo
            features["home_elo"] = home_elo
            features["away_elo"] = away_elo

            # Form features - map from the team's perspective
            form_cols = [
                "form_3", "form_5", "form_10",
                "goals_scored_3", "goals_conceded_3",
                "goal_diff_3", "goal_diff_5",
            ]
            for col in form_cols:
                h_col = f"home_{col}" if home_role == "home" else f"away_{col}"
                a_col = f"away_{col}" if away_role == "away" else f"home_{col}"
                features[f"home_{col}"] = home_latest.get(h_col, 0.0) or 0.0
                features[f"away_{col}"] = away_latest.get(a_col, 0.0) or 0.0

            # Home/away specific form
            features["home_home_form_5"] = home_latest.get("home_home_form_5", 0.0) or 0.0
            features["away_away_form_5"] = away_latest.get("away_away_form_5", 0.0) or 0.0

            # Shots
            for col in ["shots_avg_5", "sot_avg_5"]:
                h_col = f"home_{col}" if home_role == "home" else f"away_{col}"
                a_col = f"away_{col}" if away_role == "away" else f"home_{col}"
                features[f"home_{col}"] = home_latest.get(h_col, 0.0) or 0.0
                features[f"away_{col}"] = away_latest.get(a_col, 0.0) or 0.0

            features["home_shot_accuracy_5"] = home_latest.get("home_shot_accuracy_5", 0.0) or 0.0

            # H2H - use historical or zero
            features["h2h_home_win_rate"] = home_latest.get("h2h_home_win_rate", 0.0) or 0.0
            features["h2h_draw_rate"] = home_latest.get("h2h_draw_rate", 0.0) or 0.0
            features["h2h_avg_goals"] = home_latest.get("h2h_avg_goals", 0.0) or 0.0
            features["h2h_count"] = home_latest.get("h2h_count", 0.0) or 0.0

            # Rest days - default 7 if unknown
            features["home_rest_days"] = 7.0
            features["away_rest_days"] = 7.0
            features["rest_diff"] = 0.0

            # Position
            features["home_position"] = home_latest.get("home_position", 10) or 10
            features["away_position"] = away_latest.get("away_position", 10) or 10
            features["position_diff"] = features["home_position"] - features["away_position"]

            # Implied odds from live Pinnacle (or best available)
            for outcome, key in [("H", "implied_home"), ("D", "implied_draw"), ("A", "implied_away")]:
                outcome_odds = odds.get(outcome, {})
                pin_odds = outcome_odds.get("pinnacle")
                if pin_odds and pin_odds > 1:
                    features[key] = 1.0 / pin_odds
                else:
                    # Use average of available odds
                    valid = [o for o in outcome_odds.values() if o and o > 1]
                    if valid:
                        avg_odds = sum(valid) / len(valid)
                        features[key] = 1.0 / avg_odds
                    else:
                        features[key] = 0.33

            # Build feature vector in the right order
            return [features.get(col, 0.0) for col in MODEL_FEATURES]

        except Exception as e:
            return None

    def _find_team(self, api_name: str, known_teams: dict) -> str | None:
        """Find closest team name match between API and our DB.

        The Odds API uses English names, our DB uses football-data.co.uk names.
        """
        if api_name in known_teams:
            return api_name

        # Common mappings
        name_map = {
            "Arsenal": "Arsenal",
            "Manchester United": "Man United",
            "Manchester City": "Man City",
            "Tottenham Hotspur": "Tottenham",
            "Newcastle United": "Newcastle",
            "West Ham United": "West Ham",
            "Wolverhampton Wanderers": "Wolves",
            "Nottingham Forest": "Nott'm Forest",
            "Sheffield United": "Sheffield United",
            "Borussia Dortmund": "Dortmund",
            "Bayer Leverkusen": "Leverkusen",
            "Bayern Munich": "Bayern Munich",
            "RB Leipzig": "RB Leipzig",
            "Borussia Monchengladbach": "M'gladbach",
            "Eintracht Frankfurt": "Ein Frankfurt",
            "Atletico Madrid": "Ath Madrid",
            "Real Betis": "Betis",
            "Celta Vigo": "Celta",
            "Real Sociedad": "Sociedad",
            "Athletic Bilbao": "Ath Bilbao",
            "Paris Saint-Germain": "Paris SG",
            "Olympique Marseille": "Marseille",
            "Olympique Lyonnais": "Lyon",
            "AS Monaco": "Monaco",
            "AC Milan": "Milan",
            "Inter Milan": "Inter",
            "AS Roma": "Roma",
            "Hellas Verona": "Verona",
            "Ajax Amsterdam": "Ajax",
            "Feyenoord Rotterdam": "Feyenoord",
            "PSV Eindhoven": "PSV",
            "AZ Alkmaar": "AZ Alkmaar",
        }

        mapped = name_map.get(api_name)
        if mapped and mapped in known_teams:
            return mapped

        # Fuzzy: check if any known team is a substring or vice versa
        api_lower = api_name.lower()
        for team in known_teams:
            if team.lower() in api_lower or api_lower in team.lower():
                return team

        return None


def print_scan_results(value_bets: list[ValueBet]):
    """Print scan results as a rich table."""
    if not value_bets:
        console.print("[yellow]No value bets found.[/yellow]")
        return

    table = Table(title=f"VALUE BETS DETECTED: {len(value_bets)}")
    table.add_column("Match", style="bold")
    table.add_column("League")
    table.add_column("Bet", style="cyan")
    table.add_column("Model %", justify="right")
    table.add_column("Market %", justify="right")
    table.add_column("Edge", justify="right", style="green")
    table.add_column("Best Odds", justify="right", style="bold")
    table.add_column("Bookmaker")

    for vb in value_bets:
        edge_pct = f"{vb.edge * 100:.1f}%"
        table.add_row(
            f"{vb.home_team} vs {vb.away_team}",
            vb.league,
            vb.outcome,
            f"{vb.model_prob * 100:.1f}%",
            f"{vb.implied_prob * 100:.1f}%",
            edge_pct,
            f"{vb.best_odds:.2f}",
            vb.bookmaker,
        )

    console.print(table)
