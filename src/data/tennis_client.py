"""Tennis data client using The Odds API.

Fetches active ATP/WTA tournaments and their odds.
Returns normalized match data compatible with _ai_scan_tennis().
"""

import json
import logging
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import httpx

from src.cache import cache_get, cache_set as _cache_set_global
from src.config import settings

logger = logging.getLogger(__name__)

CACHE_DIR = Path("data/cache/tennis")
CACHE_TTL = 1800  # 30 min

API_BASE = "https://api.the-odds-api.com/v4"

# Surface guesses based on tournament name patterns
_SURFACE_HINTS = {
    "clay": "Clay",
    "french": "Clay",
    "roland": "Clay",
    "wimbledon": "Grass",
    "grass": "Grass",
    "hard": "Hard",
    "australian": "Hard",
    "aus_open": "Hard",
    "us_open": "Hard",
    "indian_wells": "Hard",
    "miami": "Hard",
    "canada": "Hard",
    "cincinnati": "Hard",
    "madrid": "Clay",
    "rome": "Clay",
    "monte_carlo": "Clay",
    "hamburg": "Clay",
    "dubai": "Hard",
    "doha": "Hard",
    "shanghai": "Hard",
    "paris": "Hard",
    "vienna": "Hard",
    "toronto": "Hard",
}


class TennisClient:
    """Fetch tennis odds from The Odds API and return normalized match data."""

    def __init__(self, api_key: str = settings.ODDS_API_KEY):
        self.api_key = api_key
        self.remaining_requests: int | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_active_tournaments(self) -> list[dict]:
        """Fetch active tennis sport keys from The Odds API.

        Returns list of sport dicts with keys: key, title, description, active.
        """
        if not self.api_key:
            logger.warning("No ODDS_API_KEY configured")
            return []

        try:
            resp = httpx.get(
                f"{API_BASE}/sports/",
                params={"apiKey": self.api_key},
                timeout=30,
            )
            self._track_quota(resp)
            if resp.status_code == 401:
                logger.error("Invalid Odds API key")
                return []
            resp.raise_for_status()
            sports = resp.json()
        except httpx.HTTPError as e:
            logger.error("Error fetching sports list: %s", e)
            return []

        active = [
            s for s in sports
            if s.get("key", "").startswith("tennis_") and s.get("active")
        ]
        logger.info("Active tennis tournaments: %d", len(active))
        return active

    def get_matches(
        self,
        timeframe: str = "48h",
        force: bool = False,
        markets: str = "h2h",
        regions: str = "eu,uk",
    ) -> dict:
        """Return normalized tennis matches dict with odds.

        Dict format:
        {
            "matches": [...],
            "_cached_at": float,
            "_from_cache": bool,
            "_duration_seconds": float,
        }

        Each match dict is compatible with _ai_scan_tennis() expectations:
        {
            "player1", "player2", "tournament", "date", "venue",
            "weather", "surface", "round", "odds": {"winner": {"P1": {...}, "P2": {...}}},
            "p1_form", "p2_form", "p1_ranking", "p2_ranking",
            "p1_injuries", "p2_injuries", "h2h", "h2h_surface", "h2h_last3",
            "motivation", "context", ...
        }
        """
        if not self.api_key:
            return {"matches": [], "_from_cache": False, "_cached_at": time.time(), "_duration_seconds": 0.0}

        # --- Cache check (unified: Redis → in-memory) ---
        today = datetime.now().strftime("%Y%m%d")
        redis_cache_key = f"tennis:scan:{timeframe}:{today}"

        if not force:
            cached = cache_get(redis_cache_key)
            if cached:
                logger.info("Tennis cache hit: %s", redis_cache_key)
                cached["_from_cache"] = True
                return cached

        start = time.time()

        # Compute time window for filtering
        now_utc = datetime.now(timezone.utc)
        hours = self._timeframe_to_hours(timeframe)
        cutoff_utc = now_utc + timedelta(hours=hours)

        # --- Fetch active tournaments ---
        tournaments = self.get_active_tournaments()
        if not tournaments:
            result = {
                "matches": [],
                "_error": "no_active_tournaments",
                "_cached_at": time.time(),
                "_from_cache": False,
                "_duration_seconds": round(time.time() - start, 2),
            }
            return result

        # --- Fetch odds per tournament ---
        all_matches: list[dict] = []
        for t in tournaments:
            sport_key = t["key"]
            tournament_name = t.get("title", sport_key)
            matches = self._fetch_tournament_odds(
                sport_key, tournament_name, markets, regions,
                commence_from=now_utc, commence_to=cutoff_utc,
            )
            all_matches.extend(matches)
            # Small delay to be polite (still counts 1 req per tournament)
            time.sleep(0.05)

        # --- Enrich with Sofascore stats ---
        try:
            from src.data.sofascore_client import SofascoreClient
            logger.info("Starting Sofascore enrichment for %d matches...", len(all_matches))
            sofa = SofascoreClient()
            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            sofa.enrich_matches(all_matches, date_str=today_str)
            sofa.close()
            enriched_count = sum(1 for m in all_matches if m.get("p1_ranking"))
            logger.info("Sofascore enrichment done: %d/%d enriched", enriched_count, len(all_matches))
        except Exception as e:
            import traceback
            logger.warning("Sofascore enrichment failed (non-blocking): %s\n%s", e, traceback.format_exc())

        duration = round(time.time() - start, 2)
        logger.info("Tennis scan complete: %d matches from %d tournaments in %.1fs",
                    len(all_matches), len(tournaments), duration)

        result = {
            "matches": all_matches,
            "_cached_at": time.time(),
            "_from_cache": False,
            "_duration_seconds": duration,
        }

        # Write to unified cache (Redis + in-memory)
        _cache_set_global(redis_cache_key, result, ttl=CACHE_TTL)
        return result

    def get_cached_result(self) -> dict | None:
        """Return the most recent cached result, regardless of TTL."""
        # Try unified cache first (worker stores under scan:tennis:all)
        cached = cache_get("scan:tennis:all")
        if cached:
            cached["_from_cache"] = True
            return cached

        # File fallback for graceful degradation
        if not CACHE_DIR.exists():
            return None
        best_file = None
        best_ts = 0.0
        for f in CACHE_DIR.glob("scan_*.json"):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                ts = data.get("_cached_at", 0)
                if ts > best_ts:
                    best_ts = ts
                    best_file = data
            except Exception:
                pass
        if best_file:
            best_file["_from_cache"] = True
        return best_file

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _fetch_tournament_odds(
        self,
        sport_key: str,
        tournament_name: str,
        markets: str,
        regions: str,
        commence_from: datetime | None = None,
        commence_to: datetime | None = None,
    ) -> list[dict]:
        """Fetch odds for one tournament and return normalized match dicts."""
        params: dict = {
            "apiKey": self.api_key,
            "regions": regions,
            "markets": markets,
            "oddsFormat": "decimal",
        }
        if commence_from:
            params["commenceTimeFrom"] = commence_from.strftime("%Y-%m-%dT%H:%M:%SZ")
        if commence_to:
            params["commenceTimeTo"] = commence_to.strftime("%Y-%m-%dT%H:%M:%SZ")

        try:
            resp = httpx.get(
                f"{API_BASE}/sports/{sport_key}/odds/",
                params=params,
                timeout=30,
            )
            self._track_quota(resp)
            if resp.status_code in (401, 422):
                return []
            if resp.status_code == 429:
                logger.warning("Odds API quota exhausted")
                return []
            resp.raise_for_status()
            events = resp.json()
        except httpx.HTTPError as e:
            logger.error("Error fetching %s: %s", sport_key, e)
            return []

        surface = self._guess_surface(sport_key)
        matches = []
        for event in events:
            p1 = event.get("home_team", "")
            p2 = event.get("away_team", "")
            if not p1 or not p2:
                continue
            odds = self._parse_tennis_odds(event, p1, p2)
            matches.append({
                "player1": p1,
                "player2": p2,
                "tournament": tournament_name,
                "date": event.get("commence_time", ""),
                "venue": None,
                "weather": None,
                "surface": surface,
                "round": None,
                "odds": odds,
                # Stats — not available from Odds API, will be null
                "p1_form": None,
                "p2_form": None,
                "p1_form_detail": [],
                "p2_form_detail": [],
                "p1_ranking": None,
                "p2_ranking": None,
                "p1_age": None,
                "p2_age": None,
                "p1_season_record": None,
                "p2_season_record": None,
                "p1_surface_record": None,
                "p2_surface_record": None,
                "p1_serve_pct": None,
                "p2_serve_pct": None,
                "p1_return_pct": None,
                "p2_return_pct": None,
                "p1_aces_avg": None,
                "p2_aces_avg": None,
                "p1_rest_days": None,
                "p2_rest_days": None,
                "p1_injuries": "RAS",
                "p2_injuries": "RAS",
                "h2h": None,
                "h2h_surface": None,
                "h2h_last3": [],
                "motivation": None,
                "context": None,
            })

        return matches

    def _parse_tennis_odds(self, event: dict, p1: str, p2: str) -> dict:
        """Parse bookmaker odds into {winner: {P1: {bk: odds}, P2: {bk: odds}}} format."""
        odds_p1: dict[str, float] = {}
        odds_p2: dict[str, float] = {}

        for bookmaker in event.get("bookmakers", []):
            bk_key = bookmaker.get("key", "unknown")
            for market in bookmaker.get("markets", []):
                if market.get("key") != "h2h":
                    continue
                for outcome in market.get("outcomes", []):
                    name = outcome.get("name", "")
                    price = outcome.get("price")
                    if price is None:
                        continue
                    if name == p1:
                        odds_p1[bk_key] = float(price)
                    elif name == p2:
                        odds_p2[bk_key] = float(price)

        return {
            "winner": {
                "P1": odds_p1,
                "P2": odds_p2,
            }
        }

    def _guess_surface(self, sport_key: str) -> str | None:
        """Guess court surface from sport key."""
        key_lower = sport_key.lower()
        for hint, surface in _SURFACE_HINTS.items():
            if hint in key_lower:
                return surface
        return None

    def _timeframe_to_hours(self, timeframe: str) -> int:
        """Convert timeframe string to hours."""
        mapping = {"24h": 24, "48h": 48, "72h": 72, "1w": 168}
        return mapping.get(timeframe, 48)

    def _track_quota(self, response: httpx.Response) -> None:
        """Track API quota from response headers."""
        remaining = response.headers.get("x-requests-remaining")
        if remaining is not None:
            try:
                self.remaining_requests = int(remaining)
                logger.debug("Odds API remaining requests: %d", self.remaining_requests)
            except ValueError:
                pass
