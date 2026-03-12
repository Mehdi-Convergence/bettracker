"""FBref xG client — scrape expected goals via soccerdata library.

Fetches real xG (expected goals) per match from FBref for the Big 5 leagues.
Results are cached locally in data/xg/ as CSV files to avoid re-scraping.

Supported leagues: E0 (PL), SP1 (La Liga), D1 (Bundesliga), I1 (Serie A), F1 (Ligue 1)

Rate limiting: soccerdata handles FBref scraping with built-in delays.
Cache: local CSV per league/season, valid for 24h (mtime check).

Usage:
    client = FBrefClient()
    xg_df = client.get_xg("E0", "2324")  # returns DataFrame or None
    client.enrich_all()  # scrape all Big 5 x 7 seasons
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

# Local cache directory
XG_DIR = Path("data/xg")
XG_DIR.mkdir(parents=True, exist_ok=True)

# Cache TTL: 24 hours (stale OK since historical data doesn't change)
CACHE_TTL_HOURS = 24

# FBref league slugs used by soccerdata
# Only Big 5 leagues have xG on FBref
FBREF_LEAGUES: dict[str, str] = {
    "E0":  "ENG-Premier League",
    "SP1": "ESP-La Liga",
    "D1":  "GER-Bundesliga",
    "I1":  "ITA-Serie A",
    "F1":  "FRA-Ligue 1",
}

# Season code (BetTracker format) -> FBref season year (start year)
SEASON_TO_YEAR: dict[str, int] = {
    "1819": 2018,
    "1920": 2019,
    "2021": 2020,
    "2122": 2021,
    "2223": 2022,
    "2324": 2023,
    "2425": 2024,
}

# Delay between FBref requests (seconds) — respect robots.txt
REQUEST_DELAY_S = 5


def _cache_path(league: str, season: str) -> Path:
    return XG_DIR / f"xg_{league}_{season}.csv"


def _is_cache_fresh(path: Path) -> bool:
    """Return True if cache file exists and is less than CACHE_TTL_HOURS old."""
    if not path.exists():
        return False
    age = datetime.now() - datetime.fromtimestamp(path.stat().st_mtime)
    return age < timedelta(hours=CACHE_TTL_HOURS)


def _normalize_team_name(name: str) -> str:
    """Lowercase + strip for fuzzy match."""
    return name.lower().strip()


class FBrefClient:
    """Scrape xG data from FBref via soccerdata and cache locally.

    soccerdata must be installed: add 'soccerdata' to pyproject.toml.
    Falls back gracefully if soccerdata not available or FBref unreachable.
    """

    def __init__(self):
        self._soccerdata_ok = self._check_soccerdata()

    def _check_soccerdata(self) -> bool:
        """Check if soccerdata is available."""
        try:
            import soccerdata  # noqa: F401
            return True
        except ImportError:
            logger.warning(
                "soccerdata not installed. xG enrichment disabled. "
                "Install with: uv add soccerdata"
            )
            return False

    def get_xg(self, league: str, season: str) -> pd.DataFrame | None:
        """Return xG DataFrame for a league/season, using cache when possible.

        Returns DataFrame with columns:
            date (datetime), home_team (str), away_team (str),
            home_xg (float), away_xg (float)

        Returns None if data unavailable.
        """
        cache = _cache_path(league, season)
        if _is_cache_fresh(cache):
            try:
                df = pd.read_csv(cache, parse_dates=["date"])
                logger.debug("xG cache hit: %s %s (%d rows)", league, season, len(df))
                return df
            except Exception as exc:
                logger.warning("xG cache read failed %s %s: %s", league, season, exc)

        if not self._soccerdata_ok:
            return self._load_stale_cache(cache, league, season)

        return self._scrape_xg(league, season, cache)

    def _scrape_xg(self, league: str, season: str, cache: Path) -> pd.DataFrame | None:
        """Scrape xG from FBref via soccerdata."""
        if league not in FBREF_LEAGUES:
            logger.debug("League %s not in FBref Big 5 — skipping xG", league)
            return None

        year = SEASON_TO_YEAR.get(season)
        if year is None:
            logger.warning("Unknown season code: %s", season)
            return None

        fbref_league = FBREF_LEAGUES[league]
        logger.info("Scraping FBref xG: %s %s (year=%d)...", league, season, year)

        try:
            import soccerdata as sd  # noqa: F401 — import inside to stay optional

            # FBref scraper with no_cache=True since we handle our own caching
            fbref = sd.FBref(leagues=fbref_league, seasons=year)

            # schedule() returns a DataFrame with xG columns (xg, xga)
            # Each row = one match
            time.sleep(REQUEST_DELAY_S)
            schedule = fbref.read_schedule()

            if schedule is None or schedule.empty:
                logger.warning("FBref returned empty schedule for %s %s", league, season)
                return None

            df = self._parse_fbref_schedule(schedule, league, season)
            if df is not None and not df.empty:
                df.to_csv(cache, index=False)
                logger.info(
                    "FBref xG scraped: %s %s — %d matches saved to %s",
                    league, season, len(df), cache
                )
            return df

        except Exception as exc:
            logger.error("FBref scraping failed for %s %s: %s", league, season, exc)
            return self._load_stale_cache(cache, league, season)

    def _parse_fbref_schedule(
        self,
        schedule: "pd.DataFrame",
        league: str,
        season: str,
    ) -> pd.DataFrame | None:
        """Parse soccerdata FBref schedule into our normalized format.

        soccerdata columns vary by version but typically include:
        - date / game_date
        - home_team / home
        - away_team / away
        - xg (home xg) / xga (away xg) OR home_xg / away_xg
        """
        try:
            df = schedule.reset_index() if hasattr(schedule.index, "names") else schedule.copy()

            # Normalize column names to lowercase
            df.columns = [c.lower().replace(" ", "_") for c in df.columns]

            # --- Date column ---
            date_candidates = ["date", "game_date", "match_date"]
            date_col = next((c for c in date_candidates if c in df.columns), None)
            if date_col is None:
                logger.error("No date column in FBref schedule: %s", list(df.columns))
                return None
            df["date"] = pd.to_datetime(df[date_col], errors="coerce")
            df = df.dropna(subset=["date"])

            # --- Team columns ---
            # soccerdata uses MultiIndex sometimes; after reset_index common names are:
            # 'home_team', 'away_team' or 'home', 'away'
            home_candidates = ["home_team", "home", "squad"]
            away_candidates = ["away_team", "away", "opponent"]
            home_col = next((c for c in home_candidates if c in df.columns), None)
            away_col = next((c for c in away_candidates if c in df.columns), None)
            if home_col is None or away_col is None:
                logger.error(
                    "Cannot find team columns in FBref schedule. Available: %s",
                    list(df.columns)
                )
                return None
            df["home_team"] = df[home_col].astype(str).str.strip()
            df["away_team"] = df[away_col].astype(str).str.strip()

            # --- xG columns ---
            # soccerdata may name them: xg/xga, home_xg/away_xg, xgoals/xgoals_against
            xg_h_candidates = ["xg", "home_xg", "xgoals", "home_xgoals", "xgf"]
            xg_a_candidates = ["xga", "away_xg", "xgoals_against", "away_xgoals", "xga_"]
            xg_h_col = next((c for c in xg_h_candidates if c in df.columns), None)
            xg_a_col = next((c for c in xg_a_candidates if c in df.columns), None)

            if xg_h_col is None or xg_a_col is None:
                logger.warning(
                    "No xG columns found in FBref data. Available: %s",
                    list(df.columns)
                )
                return None

            df["home_xg"] = pd.to_numeric(df[xg_h_col], errors="coerce")
            df["away_xg"] = pd.to_numeric(df[xg_a_col], errors="coerce")

            # Drop matches with missing xG (pre-season friendlies, unplayed matches)
            df = df.dropna(subset=["home_xg", "away_xg"])

            # Filter out future matches (only keep played ones with xG > 0 possible)
            df = df[df["date"] <= pd.Timestamp.now()]

            result = df[["date", "home_team", "away_team", "home_xg", "away_xg"]].copy()
            result = result.reset_index(drop=True)
            logger.debug(
                "Parsed %d xG rows for %s %s", len(result), league, season
            )
            return result

        except Exception as exc:
            logger.error("FBref schedule parse error for %s %s: %s", league, season, exc)
            return None

    def _load_stale_cache(self, cache: Path, league: str, season: str) -> pd.DataFrame | None:
        """Load stale cache as fallback (better than nothing)."""
        if cache.exists():
            try:
                df = pd.read_csv(cache, parse_dates=["date"])
                logger.info(
                    "xG stale cache fallback: %s %s (%d rows)", league, season, len(df)
                )
                return df
            except Exception:
                pass
        return None

    def enrich_all(
        self,
        leagues: list[str] | None = None,
        seasons: list[str] | None = None,
        force: bool = False,
    ) -> dict[str, int]:
        """Scrape xG for all Big 5 leagues x all seasons.

        Args:
            leagues: subset of league codes (default: all Big 5)
            seasons: subset of season codes (default: all 7 seasons)
            force: force re-scrape even if cache is fresh

        Returns:
            dict {league_season: n_rows}
        """
        leagues = leagues or list(FBREF_LEAGUES.keys())
        seasons = seasons or list(SEASON_TO_YEAR.keys())

        results: dict[str, int] = {}
        total = len(leagues) * len(seasons)
        done = 0

        for league in leagues:
            for season in seasons:
                done += 1
                key = f"{league}_{season}"
                cache = _cache_path(league, season)

                if force and cache.exists():
                    cache.unlink()

                logger.info("[%d/%d] Processing %s...", done, total, key)
                df = self.get_xg(league, season)
                results[key] = len(df) if df is not None else 0

                if df is not None:
                    logger.info("  -> %d rows", len(df))
                else:
                    logger.warning("  -> No xG data for %s", key)

                # Delay between calls (only if we actually scraped, not cache hit)
                if not _is_cache_fresh(cache):
                    time.sleep(REQUEST_DELAY_S)

        return results

    def build_lookup(
        self,
        leagues: list[str] | None = None,
        seasons: list[str] | None = None,
    ) -> pd.DataFrame:
        """Build a single lookup DataFrame from all cached xG data.

        Returns DataFrame with columns:
            date, home_team, away_team, home_xg, away_xg, league, season

        Used by enrich_xg.py to match against DB records.
        """
        leagues = leagues or list(FBREF_LEAGUES.keys())
        seasons = seasons or list(SEASON_TO_YEAR.keys())

        parts: list[pd.DataFrame] = []
        for league in leagues:
            for season in seasons:
                df = self.get_xg(league, season)
                if df is not None and not df.empty:
                    df = df.copy()
                    df["league"] = league
                    df["season"] = season
                    parts.append(df)

        if not parts:
            logger.warning("No xG data available for any league/season")
            return pd.DataFrame(columns=["date", "home_team", "away_team",
                                          "home_xg", "away_xg", "league", "season"])

        combined = pd.concat(parts, ignore_index=True)
        combined["date"] = pd.to_datetime(combined["date"])
        combined["_home_norm"] = combined["home_team"].str.lower().str.strip()
        combined["_away_norm"] = combined["away_team"].str.lower().str.strip()
        logger.info("xG lookup built: %d rows across %d files", len(combined), len(parts))
        return combined
