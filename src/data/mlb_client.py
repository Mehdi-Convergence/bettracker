"""MLB live odds client using The Odds API.

Sport key: baseball_mlb
Markets: h2h (moneyline), totals (over/under runs)
"""

import logging
from datetime import datetime, timezone

import httpx

from src.config import settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.the-odds-api.com/v4"

# MLB team name normalization: Odds API may use different spellings
_TEAM_ALIASES: dict[str, str] = {
    "Athletics": "Oakland Athletics",
    "Cleveland Indians": "Cleveland Guardians",
}


def _normalize_team(name: str) -> str:
    return _TEAM_ALIASES.get(name, name)


class MLBClient:
    """Fetch MLB live odds from The Odds API."""

    SPORT_KEY = "baseball_mlb"

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
        """Return MLB games with odds for the next 48h.

        Each dict:
            home_team, away_team, date, odds_home, odds_away,
            odds_over, odds_under, total_line
        """
        if not self.api_key:
            logger.warning("No ODDS_API_KEY configured — MLB live odds unavailable")
            return []

        try:
            resp = httpx.get(
                f"{API_BASE}/sports/{self.SPORT_KEY}/odds/",
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
            if resp.status_code == 401:
                logger.error("Invalid Odds API key")
                return []
            resp.raise_for_status()
            events = resp.json()
        except httpx.HTTPError as e:
            logger.error("MLB odds fetch failed: %s", e)
            return []

        matches = []
        now = datetime.now(timezone.utc)

        for ev in events:
            try:
                commence = ev.get("commence_time", "")
                try:
                    ev_dt = datetime.fromisoformat(commence.replace("Z", "+00:00"))
                except Exception:
                    continue

                # Only games within the timeframe
                hours = int(timeframe.replace("h", "")) if "h" in timeframe else 48
                if (ev_dt - now).total_seconds() < -3600:
                    continue  # already started/finished
                if (ev_dt - now).total_seconds() > hours * 3600:
                    continue  # too far ahead

                home = _normalize_team(ev.get("home_team", ""))
                away = _normalize_team(ev.get("away_team", ""))

                odds_home: float | None = None
                odds_away: float | None = None
                odds_over: float | None = None
                odds_under: float | None = None
                total_line: float | None = None

                bookmakers = ev.get("bookmakers", [])
                # Prefer Pinnacle, fallback to any bookmaker
                _bk_order = sorted(bookmakers, key=lambda b: (0 if "pinnacle" in b.get("key", "").lower() else 1))

                for bk in _bk_order:
                    for mkt in bk.get("markets", []):
                        if mkt["key"] == "h2h":
                            for outcome in mkt.get("outcomes", []):
                                team = _normalize_team(outcome.get("name", ""))
                                price = float(outcome.get("price", 0))
                                if team == home and (odds_home is None or bk == _bk_order[0]):
                                    odds_home = price
                                elif team == away and (odds_away is None or bk == _bk_order[0]):
                                    odds_away = price
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

                    # Stop after first bookmaker that gives h2h (prefer Pinnacle)
                    if odds_home and odds_away:
                        break

                if not odds_home or not odds_away:
                    continue

                matches.append({
                    "home_team": home,
                    "away_team": away,
                    "date": commence,
                    "odds_home": odds_home,
                    "odds_away": odds_away,
                    "odds_over": odds_over,
                    "odds_under": odds_under,
                    "total_line": total_line,
                })
            except Exception as e:
                logger.debug("MLB event parse error: %s", e)
                continue

        logger.info("MLB: %d upcoming games with odds", len(matches))
        return matches
