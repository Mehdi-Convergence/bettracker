"""Service for building detailed match analysis from historical data."""

from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import or_
from sqlalchemy.orm import Session

from src.api.schemas import (
    H2HMatch,
    H2HStats,
    HistoricalAverages,
    KeyFeature,
    MatchDetailResponse,
    ModelAnalysis,
    TeamFormEntry,
    TeamFormStats,
)
from src.ml.football_model import FootballModel, MODEL_FEATURES
from src.models.match import FootballMatch

# Feature descriptions for UI
FEATURE_LABELS: dict[str, tuple[str, str]] = {
    "elo_diff": ("Diff. ELO", "Ecart de force entre les deux equipes (ELO)"),
    "home_elo": ("ELO domicile", "Classement ELO de l'equipe a domicile"),
    "away_elo": ("ELO exterieur", "Classement ELO de l'equipe a l'exterieur"),
    "home_form_3": ("Forme dom. (3)", "Points par match sur les 3 derniers matchs"),
    "away_form_3": ("Forme ext. (3)", "Points par match sur les 3 derniers matchs"),
    "home_form_5": ("Forme dom. (5)", "Points par match sur les 5 derniers matchs"),
    "away_form_5": ("Forme ext. (5)", "Points par match sur les 5 derniers matchs"),
    "home_form_10": ("Forme dom. (10)", "Points par match sur les 10 derniers matchs"),
    "away_form_10": ("Forme ext. (10)", "Points par match sur les 10 derniers matchs"),
    "home_goals_scored_3": ("Buts dom. (3)", "Buts marques en moyenne (3 derniers)"),
    "home_goals_conceded_3": ("Encaisses dom. (3)", "Buts encaisses en moyenne (3 derniers)"),
    "away_goals_scored_3": ("Buts ext. (3)", "Buts marques en moyenne (3 derniers)"),
    "away_goals_conceded_3": ("Encaisses ext. (3)", "Buts encaisses en moyenne (3 derniers)"),
    "home_goal_diff_3": ("Diff. buts dom. (3)", "Difference de buts (3 derniers matchs)"),
    "away_goal_diff_3": ("Diff. buts ext. (3)", "Difference de buts (3 derniers matchs)"),
    "home_goal_diff_5": ("Diff. buts dom. (5)", "Difference de buts (5 derniers matchs)"),
    "away_goal_diff_5": ("Diff. buts ext. (5)", "Difference de buts (5 derniers matchs)"),
    "home_home_form_5": ("Forme a domicile", "PPG en matchs a domicile (5 derniers)"),
    "away_away_form_5": ("Forme a l'exterieur", "PPG en matchs a l'exterieur (5 derniers)"),
    "home_shots_avg_5": ("Tirs dom. (5)", "Moyenne de tirs par match (5 derniers)"),
    "away_shots_avg_5": ("Tirs ext. (5)", "Moyenne de tirs par match (5 derniers)"),
    "home_sot_avg_5": ("Tirs cadres dom.", "Moyenne de tirs cadres (5 derniers)"),
    "away_sot_avg_5": ("Tirs cadres ext.", "Moyenne de tirs cadres (5 derniers)"),
    "home_shot_accuracy_5": ("Precision tirs dom.", "Ratio tirs cadres / tirs totaux"),
    "h2h_home_win_rate": ("H2H % victoires", "Taux de victoires dans les confrontations directes"),
    "h2h_draw_rate": ("H2H % nuls", "Taux de nuls dans les confrontations directes"),
    "h2h_avg_goals": ("H2H buts/match", "Buts moyens par match en confrontations directes"),
    "h2h_count": ("H2H rencontres", "Nombre de confrontations directes"),
    "home_rest_days": ("Repos dom.", "Jours depuis le dernier match"),
    "away_rest_days": ("Repos ext.", "Jours depuis le dernier match"),
    "rest_diff": ("Diff. repos", "Avantage de repos (positif = domicile plus repose)"),
    "home_position": ("Classement dom.", "Position au classement"),
    "away_position": ("Classement ext.", "Position au classement"),
    "position_diff": ("Diff. classement", "Ecart de position (negatif = domicile mieux classe)"),
    "implied_home": ("Proba marche dom.", "Probabilite implicite des cotes pour domicile"),
    "implied_draw": ("Proba marche nul", "Probabilite implicite des cotes pour nul"),
    "implied_away": ("Proba marche ext.", "Probabilite implicite des cotes pour exterieur"),
}

LEAGUE_NAMES: dict[str, str] = {
    "E0": "Premier League",
    "F1": "Ligue 1",
    "I1": "Serie A",
    "D1": "Bundesliga",
    "SP1": "La Liga",
    "N1": "Eredivisie",
    "E1": "Championship",
    "D2": "2. Bundesliga",
    "I2": "Serie B",
    "SP2": "Segunda Division",
    "F2": "Ligue 2",
    "P1": "Liga Portugal",
    "B1": "Jupiler League",
    "T1": "Super Lig",
    "G1": "Super League",
    "SC0": "Scottish Premiership",
}

# Module-level cache for parquet
_cached_features_df: pd.DataFrame | None = None


def _get_features_df() -> pd.DataFrame:
    global _cached_features_df
    if _cached_features_df is None:
        path = Path("data/processed/football_features.parquet")
        if path.exists():
            _cached_features_df = pd.read_parquet(path)
    return _cached_features_df if _cached_features_df is not None else pd.DataFrame()


def _safe_mean(values: list[float | None]) -> float | None:
    clean = [v for v in values if v is not None]
    return round(sum(clean) / len(clean), 2) if clean else None


def _compute_streak(results: list[str]) -> str:
    """Compute streak string from list of W/D/L (most recent first)."""
    if not results:
        return "-"
    first = results[0]
    count = 0
    for r in results:
        if r == first:
            count += 1
        else:
            break
    return f"{first}{count}"


def _compute_unbeaten(results: list[str]) -> int:
    """Count matches since last loss (most recent first)."""
    count = 0
    for r in results:
        if r == "L":
            break
        count += 1
    return count


def _compute_win_streak(results: list[str]) -> int:
    count = 0
    for r in results:
        if r == "W":
            count += 1
        else:
            break
    return count


class MatchDetailService:
    def __init__(self, model_path: Path = Path("models/football")):
        self.model: FootballModel | None = None
        if (model_path / "model.joblib").exists():
            self.model = FootballModel()
            self.model.load(model_path)

    def get_match_detail(
        self,
        home_team: str,
        away_team: str,
        league: str,
        date: str,
        db: Session,
    ) -> MatchDetailResponse:
        home_form = self._get_team_form(home_team, "home", db)
        away_form = self._get_team_form(away_team, "away", db)
        h2h = self._get_h2h(home_team, away_team, db)
        model_analysis = self._get_model_analysis(home_team, away_team, league)
        historical = self._get_historical_averages(home_team, away_team, db)

        return MatchDetailResponse(
            home_team=home_team,
            away_team=away_team,
            league=league,
            league_name=LEAGUE_NAMES.get(league, league),
            date=date,
            home_form=home_form,
            away_form=away_form,
            h2h=h2h,
            model=model_analysis,
            historical=historical,
        )

    def _get_team_form(self, team: str, venue: str, db: Session) -> TeamFormStats:
        """Get form stats for a team from DB + parquet."""
        # Query last 6 matches
        matches = (
            db.query(FootballMatch)
            .filter(or_(FootballMatch.home_team == team, FootballMatch.away_team == team))
            .order_by(FootballMatch.date.desc())
            .limit(6)
            .all()
        )

        recent: list[TeamFormEntry] = []
        results: list[str] = []
        goals_for_list: list[int] = []
        goals_against_list: list[int] = []

        for m in matches:
            is_home = m.home_team == team
            gf = m.fthg if is_home else m.ftag
            ga = m.ftag if is_home else m.fthg
            if m.ftr == "D":
                result = "D"
            elif (m.ftr == "H" and is_home) or (m.ftr == "A" and not is_home):
                result = "W"
            else:
                result = "L"

            recent.append(TeamFormEntry(
                date=m.date.strftime("%Y-%m-%d"),
                opponent=m.away_team if is_home else m.home_team,
                venue="home" if is_home else "away",
                goals_for=gf,
                goals_against=ga,
                result=result,
                league=m.league,
            ))
            results.append(result)
            goals_for_list.append(gf)
            goals_against_list.append(ga)

        # Compute derived stats
        ppg_results = results[:5]
        ppg_5 = sum(3 if r == "W" else 1 if r == "D" else 0 for r in ppg_results) / max(len(ppg_results), 1)
        ppg_10_results = results[:10] if len(results) >= 10 else results
        ppg_10 = sum(3 if r == "W" else 1 if r == "D" else 0 for r in ppg_10_results) / max(len(ppg_10_results), 1)

        gs_5 = goals_for_list[:5]
        gc_5 = goals_against_list[:5]
        clean_sheets = sum(1 for g in gc_5 if g == 0)
        failed_to_score = sum(1 for g in gs_5 if g == 0)

        # Get feature values from parquet
        df = _get_features_df()
        elo = 1500.0
        position = 10
        home_away_form = 0.0
        shots_avg = None
        sot_avg = None
        shot_acc = None
        rest_days = None

        if not df.empty:
            team_rows = df[(df["home_team"] == team) | (df["away_team"] == team)]
            if not team_rows.empty:
                latest = team_rows.sort_values("date").iloc[-1]
                is_home_latest = latest["home_team"] == team
                elo = float(latest.get("home_elo" if is_home_latest else "away_elo", 1500))
                position = int(latest.get("home_position" if is_home_latest else "away_position", 10))
                if venue == "home":
                    home_away_form = float(latest.get("home_home_form_5", 0))
                    shots_avg = latest.get("home_shots_avg_5")
                    sot_avg = latest.get("home_sot_avg_5")
                    shot_acc = latest.get("home_shot_accuracy_5")
                    rest_days = latest.get("home_rest_days")
                else:
                    home_away_form = float(latest.get("away_away_form_5", 0))
                    shots_avg = latest.get("away_shots_avg_5")
                    sot_avg = latest.get("away_sot_avg_5")
                    rest_days = latest.get("away_rest_days")

                # Convert numpy types
                shots_avg = float(shots_avg) if pd.notna(shots_avg) else None
                sot_avg = float(sot_avg) if pd.notna(sot_avg) else None
                shot_acc = float(shot_acc) if pd.notna(shot_acc) else None
                rest_days = float(rest_days) if pd.notna(rest_days) else None

        return TeamFormStats(
            team_name=team,
            elo_rating=round(elo, 1),
            league_position=position,
            recent_matches=recent,
            ppg_5=round(ppg_5, 2),
            ppg_10=round(ppg_10, 2),
            goals_scored_avg_5=round(sum(gs_5) / max(len(gs_5), 1), 2),
            goals_conceded_avg_5=round(sum(gc_5) / max(len(gc_5), 1), 2),
            goal_diff_avg_5=round((sum(gs_5) - sum(gc_5)) / max(len(gs_5), 1), 2),
            home_or_away_form_5=round(home_away_form, 2),
            current_streak=_compute_streak(results),
            win_streak=_compute_win_streak(results),
            unbeaten_run=_compute_unbeaten(results),
            clean_sheets_5=clean_sheets,
            failed_to_score_5=failed_to_score,
            shots_avg_5=shots_avg,
            shots_on_target_avg_5=sot_avg,
            shot_accuracy_5=shot_acc,
            rest_days=rest_days,
        )

    def _get_h2h(self, home_team: str, away_team: str, db: Session) -> H2HStats:
        """Get head-to-head stats from DB."""
        matches = (
            db.query(FootballMatch)
            .filter(
                or_(
                    (FootballMatch.home_team == home_team) & (FootballMatch.away_team == away_team),
                    (FootballMatch.home_team == away_team) & (FootballMatch.away_team == home_team),
                )
            )
            .order_by(FootballMatch.date.desc())
            .limit(10)
            .all()
        )

        h2h_matches: list[H2HMatch] = []
        home_wins = 0
        draws = 0
        away_wins = 0
        total_goals = 0

        for m in matches:
            h2h_matches.append(H2HMatch(
                date=m.date.strftime("%Y-%m-%d"),
                home_team=m.home_team,
                away_team=m.away_team,
                fthg=m.fthg,
                ftag=m.ftag,
                ftr=m.ftr,
                league=m.league,
                season=m.season,
            ))
            total_goals += m.fthg + m.ftag

            # Count wins relative to the current home_team
            if m.ftr == "D":
                draws += 1
            elif (m.home_team == home_team and m.ftr == "H") or (m.away_team == home_team and m.ftr == "A"):
                home_wins += 1
            else:
                away_wins += 1

        total = len(matches)
        return H2HStats(
            total_meetings=total,
            home_team_wins=home_wins,
            draws=draws,
            away_team_wins=away_wins,
            avg_goals=round(total_goals / max(total, 1), 2),
            home_win_rate=round(home_wins / max(total, 1), 3),
            draw_rate=round(draws / max(total, 1), 3),
            recent_matches=h2h_matches[:6],
        )

    def _get_historical_averages(self, home_team: str, away_team: str, db: Session) -> HistoricalAverages:
        """Get average match stats from last 10 matches for each team."""
        # Home team's last 10 HOME matches
        home_matches = (
            db.query(FootballMatch)
            .filter(FootballMatch.home_team == home_team)
            .order_by(FootballMatch.date.desc())
            .limit(10)
            .all()
        )

        # Away team's last 10 AWAY matches
        away_matches = (
            db.query(FootballMatch)
            .filter(FootballMatch.away_team == away_team)
            .order_by(FootballMatch.date.desc())
            .limit(10)
            .all()
        )

        return HistoricalAverages(
            home_shots_avg=_safe_mean([m.home_shots for m in home_matches]),
            home_shots_target_avg=_safe_mean([m.home_shots_target for m in home_matches]),
            home_corners_avg=_safe_mean([m.home_corners for m in home_matches]),
            home_fouls_avg=_safe_mean([m.home_fouls for m in home_matches]),
            home_yellow_avg=_safe_mean([m.home_yellow for m in home_matches]),
            away_shots_avg=_safe_mean([m.away_shots for m in away_matches]),
            away_shots_target_avg=_safe_mean([m.away_shots_target for m in away_matches]),
            away_corners_avg=_safe_mean([m.away_corners for m in away_matches]),
            away_fouls_avg=_safe_mean([m.away_fouls for m in away_matches]),
            away_yellow_avg=_safe_mean([m.away_yellow for m in away_matches]),
        )

    def _get_model_analysis(self, home_team: str, away_team: str, league: str) -> ModelAnalysis:
        """Run model prediction and extract key features."""
        df = _get_features_df()

        prob_home = 0.33
        prob_draw = 0.33
        prob_away = 0.34
        features_dict: dict[str, float] = {}

        if not df.empty and self.model is not None:
            # Find latest row where these teams appear
            home_rows = df[df["home_team"] == home_team].sort_values("date")
            away_rows = df[df["away_team"] == away_team].sort_values("date")

            if not home_rows.empty and not away_rows.empty:
                latest_home = home_rows.iloc[-1]
                latest_away = away_rows.iloc[-1]

                # Build feature vector from latest available data
                feature_values = {}
                for feat in MODEL_FEATURES:
                    if feat.startswith("home_") or feat.startswith("h2h_") or feat == "elo_diff" or feat == "rest_diff" or feat == "position_diff":
                        val = latest_home.get(feat)
                    elif feat.startswith("away_"):
                        val = latest_away.get(feat)
                    elif feat.startswith("implied_"):
                        val = latest_home.get(feat)
                    else:
                        val = latest_home.get(feat)

                    feature_values[feat] = float(val) if pd.notna(val) else 0.0

                # Predict
                X = np.array([[feature_values.get(f, 0.0) for f in MODEL_FEATURES]])
                probas = self.model.predict_proba(X)[0]
                prob_home = float(probas[0])
                prob_draw = float(probas[1])
                prob_away = float(probas[2])
                features_dict = feature_values

        predicted = "H" if prob_home >= prob_draw and prob_home >= prob_away else "D" if prob_draw >= prob_away else "A"
        confidence = max(prob_home, prob_draw, prob_away)

        # Compute edges vs implied probabilities
        implied_h = features_dict.get("implied_home", 0.33)
        implied_d = features_dict.get("implied_draw", 0.33)
        implied_a = features_dict.get("implied_away", 0.34)

        # Select top 8 most informative features (by absolute deviation from neutral)
        key_features: list[KeyFeature] = []
        scored_features: list[tuple[str, float, float]] = []
        for feat, val in features_dict.items():
            if feat in FEATURE_LABELS:
                # Score by how much it deviates from a neutral baseline
                if "form" in feat or "ppg" in feat:
                    deviation = abs(val - 1.0)  # neutral PPG ~1.0
                elif "elo_diff" in feat or "position_diff" in feat or "rest_diff" in feat or "goal_diff" in feat:
                    deviation = abs(val)  # neutral = 0
                elif "implied" in feat:
                    deviation = abs(val - 0.33)  # neutral = 1/3
                else:
                    deviation = abs(val)
                scored_features.append((feat, val, deviation))

        scored_features.sort(key=lambda x: x[2], reverse=True)
        for feat, val, _ in scored_features[:8]:
            label, description = FEATURE_LABELS[feat]
            # Determine direction
            if "diff" in feat:
                direction = "positive" if val > 0 else "negative" if val < 0 else "neutral"
            elif feat.startswith("home_"):
                direction = "positive" if val > 1.0 else "negative" if val < 0.8 else "neutral"
            elif feat.startswith("away_"):
                direction = "negative" if val > 1.0 else "positive" if val < 0.8 else "neutral"
            else:
                direction = "neutral"

            key_features.append(KeyFeature(
                name=label,
                value=round(val, 3),
                description=description,
                direction=direction,
            ))

        return ModelAnalysis(
            prob_home=round(prob_home, 4),
            prob_draw=round(prob_draw, 4),
            prob_away=round(prob_away, 4),
            predicted_outcome=predicted,
            confidence=round(confidence, 4),
            key_features=key_features,
            edge_home=round(prob_home - implied_h, 4) if implied_h else None,
            edge_draw=round(prob_draw - implied_d, 4) if implied_d else None,
            edge_away=round(prob_away - implied_a, 4) if implied_a else None,
        )
