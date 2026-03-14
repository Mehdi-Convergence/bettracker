"""PMU (French horse racing) feature engineering.

CRITICAL: All features use only data BEFORE the race date. No look-ahead bias.

Structure:
  - Each row = one horse in one race (runner)
  - A race has 8-20 runners
  - Target: binary (win or top-3 place)

Features per horse (~30):
  - Horse form: win rate / place rate over last N races
  - Distance affinity: performance at similar distance (+/- 300m)
  - Surface/type affinity: performance on same race type
  - Hippodrome affinity: performance at same venue
  - Weight delta vs historical average
  - Jockey stats (win rate, place rate, combo with this horse)
  - Trainer stats (win rate, place rate)
  - Terrain affinity: performance on similar going
  - Race context: num_runners, age, post_position, rest_days, class_level
  - Market implied probability: 1/odds_final
  - is_quinteplus flag
"""

from collections import defaultdict

import numpy as np
import pandas as pd

_MIN_HISTORY = 1  # minimum runs needed before building features
_DISTANCE_TOLERANCE = 300  # metres — similar distance window


class PMUFeatureBuilder:
    """Build feature vectors for PMU horse racing prediction.

    Each call to build_dataset returns one row per runner (horse) per race,
    with features computed strictly from past races (no look-ahead).
    """

    def __init__(self):
        # Incremental caches — keyed by name, list of run dicts (chronological)
        self.horse_history: dict[str, list[dict]] = defaultdict(list)
        self.jockey_history: dict[str, list[dict]] = defaultdict(list)
        self.trainer_history: dict[str, list[dict]] = defaultdict(list)
        # Combo cache: (horse, jockey) -> list of run dicts
        self.combo_history: dict[tuple[str, str], list[dict]] = defaultdict(list)

    def build_dataset(
        self,
        races_df: pd.DataFrame,
        runners_df: pd.DataFrame,
        progress: bool = True,
    ) -> pd.DataFrame:
        """Build feature dataset chronologically (no look-ahead bias).

        Args:
            races_df: One row per race — columns: id, race_date, hippodrome,
                      race_type, distance, terrain, prize_pool, num_runners,
                      is_quinteplus, race_id (string id).
            runners_df: One row per runner — columns: race_id (FK to races.id),
                        number, horse_name, jockey_name, trainer_name, age,
                        weight, odds_final, finish_position, is_scratched.

        Returns:
            DataFrame with one row per runner, features + target columns.
        """
        # Reset caches for reproducibility
        self.horse_history = defaultdict(list)
        self.jockey_history = defaultdict(list)
        self.trainer_history = defaultdict(list)
        self.combo_history = defaultdict(list)

        # Merge runners with race metadata
        # Drop race_id from races_df to avoid duplicate column after merge
        merged = runners_df.merge(
            races_df.rename(columns={"id": "race_pk"}).drop(columns=["race_id"], errors="ignore"),
            left_on="race_id",
            right_on="race_pk",
            how="left",
        )
        # Sort chronologically, then by race, then by horse number
        merged = merged.sort_values(
            ["race_date", "race_id", "number"], na_position="last"
        ).reset_index(drop=True)

        features_list = []
        total = len(merged)
        log_interval = max(total // 20, 1)

        # Group by race to process all runners in a race together
        # We process races in chronological order, but within a race we build
        # features BEFORE updating caches (no same-race contamination).
        race_groups = merged.groupby("race_id", sort=False)
        race_ids_ordered = merged["race_id"].unique()  # preserves insertion order (sorted above)

        processed = 0
        for race_id in race_ids_ordered:
            race_runners = race_groups.get_group(race_id)
            if race_runners.empty:
                continue

            # Race-level metadata from first row
            first = race_runners.iloc[0]
            race_date = first.get("race_date")
            hippodrome = str(first.get("hippodrome") or "")
            race_type = str(first.get("race_type") or "")
            distance = _safe_float(first.get("distance")) or 0.0
            terrain = str(first.get("terrain") or "")
            prize_pool = _safe_float(first.get("prize_pool")) or 0.0
            num_runners_race = int(first.get("num_runners") or len(race_runners))
            is_quinteplus = int(bool(first.get("is_quinteplus")))

            # Build features for each runner BEFORE updating caches
            race_features = []
            for _, runner in race_runners.iterrows():
                if bool(runner.get("is_scratched")):
                    continue  # skip non-starters

                horse = str(runner.get("horse_name") or "")
                jockey = str(runner.get("jockey_name") or "")
                trainer = str(runner.get("trainer_name") or "")
                h_hist = self.horse_history[horse]
                j_hist = self.jockey_history[jockey]
                t_hist = self.trainer_history[trainer]
                combo_key = (horse, jockey)
                c_hist = self.combo_history[combo_key]

                # Only build features if the horse has some history
                if len(h_hist) < _MIN_HISTORY:
                    # Still update caches after the race
                    race_features.append(None)
                    continue

                f = self._build_features(
                    runner=runner,
                    horse=horse,
                    jockey=jockey,
                    trainer=trainer,
                    h_hist=h_hist,
                    j_hist=j_hist,
                    t_hist=t_hist,
                    c_hist=c_hist,
                    race_date=race_date,
                    hippodrome=hippodrome,
                    race_type=race_type,
                    distance=distance,
                    terrain=terrain,
                    prize_pool=prize_pool,
                    num_runners_race=num_runners_race,
                    is_quinteplus=is_quinteplus,
                )

                # Target columns
                finish = _safe_int(runner.get("finish_position"))
                f["target_win"] = 1 if (finish is not None and finish == 1) else 0
                place_threshold = 3 if num_runners_race <= 12 else max(3, num_runners_race // 4)
                f["target_place"] = (
                    1 if (finish is not None and finish <= place_threshold) else 0
                )

                # Metadata for train/test split
                f["race_date"] = race_date
                f["race_id"] = race_id
                f["horse_name"] = horse
                f["jockey_name"] = jockey
                f["trainer_name"] = trainer
                f["finish_position"] = finish
                f["_odds_final"] = _safe_float(runner.get("odds_final"))

                race_features.append(f)

                if progress and processed % log_interval == 0:
                    print(f"  Processing runner {processed}/{total} ({processed * 100 // total}%)")
                processed += 1

            # Collect valid feature rows
            for feat in race_features:
                if feat is not None:
                    features_list.append(feat)

            # Update caches AFTER processing all runners in this race
            for _, runner in race_runners.iterrows():
                if not bool(runner.get("is_scratched")):
                    self._update_cache(runner, race_date, hippodrome, race_type, distance, terrain, prize_pool)

        if progress:
            print(f"  Done: {len(features_list)} feature vectors built")

        return pd.DataFrame(features_list)

    # ------------------------------------------------------------------
    # Feature construction
    # ------------------------------------------------------------------

    def _build_features(
        self,
        runner,
        horse: str,
        jockey: str,
        trainer: str,
        h_hist: list[dict],
        j_hist: list[dict],
        t_hist: list[dict],
        c_hist: list[dict],
        race_date,
        hippodrome: str,
        race_type: str,
        distance: float,
        terrain: str,
        prize_pool: float,
        num_runners_race: int,
        is_quinteplus: int,
    ) -> dict:
        f: dict = {}

        # ---- Horse form ----
        f["horse_win_rate_5"] = self._win_rate(h_hist, 5)
        f["horse_win_rate_10"] = self._win_rate(h_hist, 10)
        f["horse_win_rate_20"] = self._win_rate(h_hist, 20)
        f["horse_place_rate_5"] = self._place_rate(h_hist, 5)
        f["horse_place_rate_10"] = self._place_rate(h_hist, 10)
        f["horse_avg_position_5"] = self._avg_position(h_hist, 5)

        # ---- Distance affinity ----
        dist_hist = [r for r in h_hist if abs(r.get("distance", 0) - distance) <= _DISTANCE_TOLERANCE]
        f["horse_win_rate_distance"] = self._win_rate(dist_hist, len(dist_hist))
        f["horse_avg_pos_distance"] = self._avg_position(dist_hist, len(dist_hist))

        # ---- Surface / race type affinity ----
        type_hist = [r for r in h_hist if r.get("race_type") == race_type]
        f["horse_win_rate_type"] = self._win_rate(type_hist, len(type_hist))
        f["horse_place_rate_type"] = self._place_rate(type_hist, len(type_hist))

        # ---- Hippodrome affinity ----
        hippo_hist = [r for r in h_hist if r.get("hippodrome") == hippodrome]
        f["horse_win_rate_hippo"] = self._win_rate(hippo_hist, len(hippo_hist))

        # ---- Terrain affinity ----
        terrain_key = _normalize_terrain(terrain)
        terrain_hist = [r for r in h_hist if _normalize_terrain(r.get("terrain", "")) == terrain_key]
        f["horse_win_rate_terrain"] = self._win_rate(terrain_hist, len(terrain_hist))

        # ---- Weight delta ----
        current_weight = _safe_float(runner.get("weight"))
        past_weights = [r["weight"] for r in h_hist if r.get("weight") is not None]
        if current_weight is not None and past_weights:
            f["weight_diff"] = current_weight - float(np.mean(past_weights))
        else:
            f["weight_diff"] = np.nan

        # ---- Jockey stats ----
        f["jockey_win_rate_20"] = self._win_rate(j_hist, 20)
        f["jockey_place_rate_20"] = self._place_rate(j_hist, 20)

        # ---- Combo: jockey + horse ----
        f["jockey_horse_combo_runs"] = float(len(c_hist))
        f["jockey_horse_combo_win_rate"] = self._win_rate(c_hist, len(c_hist))

        # ---- Trainer stats ----
        f["trainer_win_rate_20"] = self._win_rate(t_hist, 20)
        f["trainer_place_rate_20"] = self._place_rate(t_hist, 20)

        # ---- Race context ----
        f["num_runners"] = float(num_runners_race)
        f["age"] = float(_safe_float(runner.get("age")) or np.nan)
        f["post_position"] = float(_safe_float(runner.get("number")) or np.nan)

        rest = self._rest_days(h_hist, race_date)
        f["rest_days"] = float(rest) if rest is not None else np.nan

        f["class_level"] = float(prize_pool) if prize_pool else np.nan

        # ---- Market implied probability ----
        odds = _safe_float(runner.get("odds_final"))
        f["odds_implied_prob"] = (1.0 / odds) if (odds and odds > 1.0) else np.nan

        f["is_quinteplus"] = float(is_quinteplus)

        return f

    # ------------------------------------------------------------------
    # Cache update
    # ------------------------------------------------------------------

    def _update_cache(self, runner, race_date, hippodrome, race_type, distance, terrain, prize_pool):
        horse = str(runner.get("horse_name") or "")
        jockey = str(runner.get("jockey_name") or "")
        trainer = str(runner.get("trainer_name") or "")
        finish = _safe_int(runner.get("finish_position"))
        weight = _safe_float(runner.get("weight"))

        if finish is None:
            return  # no result yet — don't pollute history

        entry = {
            "date": race_date,
            "hippodrome": hippodrome,
            "race_type": race_type,
            "distance": distance,
            "terrain": terrain,
            "prize_pool": prize_pool,
            "finish_position": finish,
            "won": finish == 1,
            "placed": finish <= 3,
            "weight": weight,
        }
        self.horse_history[horse].append(entry)

        # Jockey and trainer entries carry just finish / won / placed
        jockey_entry = {
            "date": race_date,
            "finish_position": finish,
            "won": finish == 1,
            "placed": finish <= 3,
        }
        if jockey:
            self.jockey_history[jockey].append(jockey_entry)
        if trainer:
            self.trainer_history[trainer].append(jockey_entry.copy())

        # Combo
        if horse and jockey:
            self.combo_history[(horse, jockey)].append({
                "date": race_date,
                "won": finish == 1,
                "placed": finish <= 3,
            })

    # ------------------------------------------------------------------
    # Stat helpers
    # ------------------------------------------------------------------

    def _win_rate(self, history: list[dict], n: int) -> float:
        recent = history[-n:] if n > 0 else history
        if not recent:
            return np.nan
        return float(sum(1 for r in recent if r.get("won"))) / len(recent)

    def _place_rate(self, history: list[dict], n: int) -> float:
        recent = history[-n:] if n > 0 else history
        if not recent:
            return np.nan
        return float(sum(1 for r in recent if r.get("placed"))) / len(recent)

    def _avg_position(self, history: list[dict], n: int) -> float:
        recent = history[-n:] if n > 0 else history
        positions = [r["finish_position"] for r in recent if r.get("finish_position") is not None]
        if not positions:
            return np.nan
        return float(np.mean(positions))

    def _rest_days(self, history: list[dict], current_date) -> int | None:
        if not history:
            return None
        last_date = history[-1].get("date")
        if last_date is None:
            return None
        try:
            delta = (pd.Timestamp(current_date) - pd.Timestamp(last_date)).days
            return int(delta)
        except Exception:
            return None


# ------------------------------------------------------------------
# Terrain normalization helper
# ------------------------------------------------------------------

def _normalize_terrain(terrain: str) -> str:
    """Normalize terrain label to a coarse category."""
    t = (terrain or "").lower().strip()
    if t in ("bon", "bon souple", "tres bon"):
        return "bon"
    if t in ("souple", "assez souple"):
        return "souple"
    if t in ("lourd", "tres lourd"):
        return "lourd"
    return t or "inconnu"


# ------------------------------------------------------------------
# Safe coercion helpers
# ------------------------------------------------------------------

def _safe_float(val) -> float | None:
    try:
        v = float(val)
        return v if v == v else None  # NaN check
    except (TypeError, ValueError):
        return None


def _safe_int(val) -> int | None:
    try:
        return int(float(val)) if val is not None and str(val).strip() != "" else None
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------------------
# Feature column lists
# ------------------------------------------------------------------

PMU_FEATURE_COLUMNS: list[str] = [
    # Horse form
    "horse_win_rate_5",
    "horse_win_rate_10",
    "horse_win_rate_20",
    "horse_place_rate_5",
    "horse_place_rate_10",
    "horse_avg_position_5",
    # Distance affinity
    "horse_win_rate_distance",
    "horse_avg_pos_distance",
    # Type / surface
    "horse_win_rate_type",
    "horse_place_rate_type",
    # Hippodrome
    "horse_win_rate_hippo",
    # Terrain
    "horse_win_rate_terrain",
    # Weight
    "weight_diff",
    # Jockey
    "jockey_win_rate_20",
    "jockey_place_rate_20",
    "jockey_horse_combo_runs",
    "jockey_horse_combo_win_rate",
    # Trainer
    "trainer_win_rate_20",
    "trainer_place_rate_20",
    # Race context
    "num_runners",
    "age",
    "post_position",
    "rest_days",
    "class_level",
    "odds_implied_prob",
    "is_quinteplus",
]

# Aliases for explicit model selection
PMU_WIN_FEATURE_COLUMNS: list[str] = PMU_FEATURE_COLUMNS
PMU_PLACE_FEATURE_COLUMNS: list[str] = PMU_FEATURE_COLUMNS
