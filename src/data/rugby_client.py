"""Rugby live odds client using The Odds API.

Sport key: rugbyunion
Markets: h2h (1X2 moneyline), totals (over/under)

Rugby has draws unlike NBA — we fetch all three outcomes (H/D/A).

Each match dict returned by get_matches():
    home_team, away_team, date, league,
    bookmakers: {
        "h2h": {
            "Home": {"pinnacle": 1.55, "bet365": 1.52, ...},
            "Draw": {"pinnacle": 15.0, "bet365": 14.0, ...},
            "Away": {"pinnacle": 2.60, "bet365": 2.55, ...},
        },
        "totals": {
            "over": {"pinnacle": 1.91, ...},
            "under": {"pinnacle": 1.93, ...},
            "line": 45.5,
        }
    },
    best_odds_home, best_odds_draw, best_odds_away  (best across all bookmakers)
"""

import logging
from datetime import datetime, timezone

import httpx

from src.config import settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.the-odds-api.com/v4"

# Rugby team name normalization
_TEAM_ALIASES: dict[str, str] = {
    "La Rochelle": "Stade Rochelais",
}


def _normalize_team(name: str) -> str:
    return _TEAM_ALIASES.get(name, name)


class RugbyClient:
    """Fetch rugby union live odds from The Odds API."""

    SPORT_KEY = "rugbyunion"

    def __init__(self, api_key: str = settings.ODDS_API_KEY):
        self.api_key = api_key
        self.remaining_requests: int | None = None

    def _track_quota(self, resp: httpx.Response) -> None:
        remaining = resp.headers.get("x-requests-remaining")
        if remaining:
            self.remaining_requests = int(remaining)
            if self.remaining_requests < 50:
                logger.warning("Odds API quota low: %d requests remaining", self.remaining_requests)

    def get_matches(
        self,
        timeframe: str = "48h",
        markets: str = "h2h,totals",
        regions: str = "eu,uk,us,us2,au",
    ) -> list[dict]:
        """Return rugby matches with multi-bookmaker odds for the specified timeframe.

        Each dict:
            home_team, away_team, date, league,
            bookmakers: {
                "h2h": {
                    "Home": {bk_key: price, ...},
                    "Draw": {bk_key: price, ...},
                    "Away": {bk_key: price, ...},
                },
                "totals": {
                    "over": {bk_key: price, ...},
                    "under": {bk_key: price, ...},
                    "line": float | None,
                },
            },
            best_odds_home, best_odds_draw, best_odds_away,
            best_odds_over, best_odds_under, total_line
        """
        if not self.api_key:
            logger.warning("No ODDS_API_KEY configured — rugby live odds unavailable")
            return []

        # The Odds API may return multiple rugby competition keys
        # rugbyunion covers major competitions
        sport_keys = [
            "rugbyunion",
            "rugbyunion_championship_cup",
            "rugbyunion_united_rugby_championship",
        ]

        all_matches: list[dict] = []
        seen_event_ids: set[str] = set()

        for sport_key in sport_keys:
            try:
                resp = httpx.get(
                    f"{API_BASE}/sports/{sport_key}/odds/",
                    params={
                        "apiKey": self.api_key,
                        "regions": regions,
                        "markets": markets,
                        "oddsFormat": "decimal",
                        "dateFormat": "iso",
                    },
                    timeout=30,
                )
                self._track_quota(resp)
                if resp.status_code == 404:
                    # This sport key doesn't exist — skip silently
                    continue
                if resp.status_code == 401:
                    logger.error("Invalid Odds API key")
                    return []
                resp.raise_for_status()
                events = resp.json()
            except httpx.HTTPError as e:
                logger.debug("Rugby odds fetch failed for %s: %s", sport_key, e)
                continue

            now = datetime.now(timezone.utc)
            hours = int(timeframe.replace("h", "")) if "h" in timeframe else 48

            for ev in events:
                try:
                    ev_id = ev.get("id", "")
                    if ev_id in seen_event_ids:
                        continue

                    commence = ev.get("commence_time", "")
                    try:
                        ev_dt = datetime.fromisoformat(commence.replace("Z", "+00:00"))
                    except Exception:
                        continue

                    if (ev_dt - now).total_seconds() < -3600:
                        continue
                    if (ev_dt - now).total_seconds() > hours * 3600:
                        continue

                    home = _normalize_team(ev.get("home_team", ""))
                    away = _normalize_team(ev.get("away_team", ""))
                    competition = ev.get("sport_title", sport_key)

                    # Multi-bookmaker dicts: outcome -> {bk_key: price}
                    h2h_home: dict[str, float] = {}
                    h2h_draw: dict[str, float] = {}
                    h2h_away: dict[str, float] = {}
                    totals_over: dict[str, float] = {}
                    totals_under: dict[str, float] = {}
                    total_line: float | None = None

                    bookmakers = ev.get("bookmakers", [])

                    for bk in bookmakers:
                        bk_key = bk.get("key", "")
                        if not bk_key:
                            continue

                        for mkt in bk.get("markets", []):
                            if mkt["key"] == "h2h":
                                for outcome in mkt.get("outcomes", []):
                                    outcome_name = outcome.get("name", "")
                                    team = _normalize_team(outcome_name)
                                    price = outcome.get("price")
                                    if price is None:
                                        continue
                                    try:
                                        price = float(price)
                                    except (TypeError, ValueError):
                                        continue
                                    if price <= 1.0:
                                        continue

                                    if team == home:
                                        h2h_home[bk_key] = price
                                    elif team == away:
                                        h2h_away[bk_key] = price
                                    elif outcome_name.lower() == "draw":
                                        h2h_draw[bk_key] = price

                            elif mkt["key"] == "totals":
                                for outcome in mkt.get("outcomes", []):
                                    name = outcome.get("name", "").lower()
                                    price = outcome.get("price")
                                    point = outcome.get("point")
                                    if price is None:
                                        continue
                                    try:
                                        price = float(price)
                                    except (TypeError, ValueError):
                                        continue
                                    if price <= 1.0:
                                        continue

                                    if "over" in name:
                                        totals_over[bk_key] = price
                                        if point is not None and total_line is None:
                                            try:
                                                total_line = float(point)
                                            except (TypeError, ValueError):
                                                pass
                                    elif "under" in name:
                                        totals_under[bk_key] = price

                    # Require at least one bookmaker with h2h home + away
                    if not h2h_home or not h2h_away:
                        continue

                    # Best odds convenience fields
                    best_odds_home = max(h2h_home.values()) if h2h_home else None
                    best_odds_draw = max(h2h_draw.values()) if h2h_draw else None
                    best_odds_away = max(h2h_away.values()) if h2h_away else None
                    best_odds_over = max(totals_over.values()) if totals_over else None
                    best_odds_under = max(totals_under.values()) if totals_under else None

                    seen_event_ids.add(ev_id)
                    all_matches.append({
                        "home_team": home,
                        "away_team": away,
                        "date": commence,
                        "league": competition,
                        "bookmakers": {
                            "h2h": {
                                "Home": h2h_home,
                                "Draw": h2h_draw,
                                "Away": h2h_away,
                            },
                            "totals": {
                                "over": totals_over,
                                "under": totals_under,
                                "line": total_line,
                            },
                        },
                        # Convenience fields for backward-compatible consumers
                        "best_odds_home": best_odds_home,
                        "best_odds_draw": best_odds_draw,
                        "best_odds_away": best_odds_away,
                        "best_odds_over": best_odds_over,
                        "best_odds_under": best_odds_under,
                        "total_line": total_line,
                    })
                except Exception as e:
                    logger.debug("Rugby event parse error: %s", e)
                    continue

        logger.info("Rugby: %d upcoming matches with odds", len(all_matches))
        return all_matches
