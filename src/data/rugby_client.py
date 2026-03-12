"""Rugby live odds client using The Odds API.

Sport key: rugbyunion
Markets: h2h (1X2 moneyline), totals (over/under)

Rugby has draws unlike NBA — we fetch all three outcomes (H/D/A).
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
        regions: str = "eu,uk",
    ) -> list[dict]:
        """Return rugby matches with odds for the specified timeframe.

        Each dict:
            home_team, away_team, date, league,
            odds_home, odds_draw, odds_away,
            odds_over, odds_under, total_line
        """
        if not self.api_key:
            logger.warning("No ODDS_API_KEY configured — rugby live odds unavailable")
            return []

        # The Odds API may return multiple rugby competition keys
        # rugbyunion covers major competitions
        sport_keys = ["rugbyunion", "rugbyunion_championship_cup", "rugbyunion_united_rugby_championship"]

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

                    odds_home: float | None = None
                    odds_draw: float | None = None
                    odds_away: float | None = None
                    odds_over: float | None = None
                    odds_under: float | None = None
                    total_line: float | None = None

                    bookmakers = ev.get("bookmakers", [])
                    # Prefer Pinnacle, fallback to any bookmaker
                    _bk_order = sorted(
                        bookmakers,
                        key=lambda b: (0 if "pinnacle" in b.get("key", "").lower() else 1),
                    )

                    for bk in _bk_order:
                        for mkt in bk.get("markets", []):
                            if mkt["key"] == "h2h":
                                for outcome in mkt.get("outcomes", []):
                                    team = _normalize_team(outcome.get("name", ""))
                                    price = float(outcome.get("price", 0))
                                    if team == home and odds_home is None:
                                        odds_home = price
                                    elif team == away and odds_away is None:
                                        odds_away = price
                                    elif outcome.get("name", "").lower() == "draw" and odds_draw is None:
                                        odds_draw = price
                            elif mkt["key"] == "totals":
                                for outcome in mkt.get("outcomes", []):
                                    name = outcome.get("name", "").lower()
                                    price = float(outcome.get("price", 0))
                                    point = outcome.get("point")
                                    if "over" in name and odds_over is None:
                                        odds_over = price
                                        total_line = float(point) if point is not None else None
                                    elif "under" in name and odds_under is None:
                                        odds_under = price

                        if odds_home and odds_away:
                            break

                    if not odds_home or not odds_away:
                        continue

                    seen_event_ids.add(ev_id)
                    all_matches.append({
                        "home_team": home,
                        "away_team": away,
                        "date": commence,
                        "league": competition,
                        "odds_home": odds_home,
                        "odds_draw": odds_draw,
                        "odds_away": odds_away,
                        "odds_over": odds_over,
                        "odds_under": odds_under,
                        "total_line": total_line,
                    })
                except Exception as e:
                    logger.debug("Rugby event parse error: %s", e)
                    continue

        logger.info("Rugby: %d upcoming matches with odds", len(all_matches))
        return all_matches
