"""MLB live odds client using The Odds API.

Sport key: baseball_mlb
Markets: h2h (moneyline), totals (over/under runs), spreads (run line)

Odds format: multi-bookmaker dict compatible with tennis_client pattern:
{
    "h2h": {
        "Home": {"pinnacle": 1.55, "bet365": 1.52, ...},
        "Away": {"pinnacle": 2.60, "bet365": 2.55, ...},
    },
    "totals": {
        "over": {"pinnacle": 1.91, ...},
        "under": {"pinnacle": 1.93, ...},
        "line": 8.5,
    },
    "spreads": {
        "home": {"pinnacle": 1.91, ...},
        "away": {"pinnacle": 1.91, ...},
        "line": -1.5,
    },
}

Backward-compatible fields: best_odds_home, best_odds_away (Pinnacle-first).
"""

import logging
from datetime import datetime, timedelta, timezone

import httpx
import statsapi

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


def _best_price(prices: dict[str, float]) -> float | None:
    """Return Pinnacle price if available, else the highest price across bookmakers."""
    if not prices:
        return None
    if "pinnacle" in prices:
        return prices["pinnacle"]
    return max(prices.values())


class MLBClient:
    """Fetch MLB live odds from The Odds API and schedule data via statsapi."""

    SPORT_KEY = "baseball_mlb"

    def __init__(self, api_key: str = settings.ODDS_API_KEY):
        self.api_key = api_key
        self.remaining_requests: int | None = None

    def _track_quota(self, resp: httpx.Response) -> None:
        remaining = resp.headers.get("x-requests-remaining")
        if remaining:
            try:
                self.remaining_requests = int(remaining)
                if self.remaining_requests < 50:
                    logger.warning("Odds API quota low: %d requests remaining", self.remaining_requests)
            except ValueError:
                pass

    def get_matches(
        self,
        timeframe: str = "48h",
        markets: str = "h2h,totals,spreads",
        regions: str = "eu,uk",
    ) -> list[dict]:
        """Return MLB games with multi-bookmaker odds for the next timeframe.

        Each dict contains:
            home_team, away_team, date,
            odds: {h2h, totals, spreads} — full multi-bookmaker dicts,
            best_odds_home, best_odds_away — backward-compat convenience fields.
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
        hours = int(timeframe.replace("h", "")) if "h" in timeframe else 48

        for ev in events:
            try:
                commence = ev.get("commence_time", "")
                try:
                    ev_dt = datetime.fromisoformat(commence.replace("Z", "+00:00"))
                except Exception:
                    continue

                if (ev_dt - now).total_seconds() < -3600:
                    continue  # already started/finished
                if (ev_dt - now).total_seconds() > hours * 3600:
                    continue  # too far ahead

                home = _normalize_team(ev.get("home_team", ""))
                away = _normalize_team(ev.get("away_team", ""))

                odds = self._parse_odds(ev, home, away)

                # Backward-compat convenience fields (Pinnacle-first)
                h2h = odds.get("h2h", {})
                best_odds_home = _best_price(h2h.get("Home", {}))
                best_odds_away = _best_price(h2h.get("Away", {}))

                if not best_odds_home or not best_odds_away:
                    continue

                matches.append({
                    "home_team": home,
                    "away_team": away,
                    "date": commence,
                    "odds": odds,
                    # Backward-compat fields
                    "best_odds_home": best_odds_home,
                    "best_odds_away": best_odds_away,
                    "odds_home": best_odds_home,
                    "odds_away": best_odds_away,
                    "odds_over": _best_price(odds.get("totals", {}).get("over", {})),
                    "odds_under": _best_price(odds.get("totals", {}).get("under", {})),
                    "total_line": odds.get("totals", {}).get("line"),
                })
            except Exception as e:
                logger.debug("MLB event parse error: %s", e)
                continue

        logger.info("MLB: %d upcoming games with odds", len(matches))
        return matches

    def _parse_odds(self, event: dict, home: str, away: str) -> dict:
        """Parse all bookmakers into a multi-bookmaker odds dict.

        Returns:
        {
            "h2h": {
                "Home": {bk_key: price, ...},
                "Away": {bk_key: price, ...},
            },
            "totals": {
                "over": {bk_key: price, ...},
                "under": {bk_key: price, ...},
                "line": float | None,
            },
            "spreads": {
                "home": {bk_key: price, ...},
                "away": {bk_key: price, ...},
                "line": float | None,
            },
        }
        """
        h2h_home: dict[str, float] = {}
        h2h_away: dict[str, float] = {}
        totals_over: dict[str, float] = {}
        totals_under: dict[str, float] = {}
        totals_line: float | None = None
        spreads_home: dict[str, float] = {}
        spreads_away: dict[str, float] = {}
        spreads_line: float | None = None

        for bookmaker in event.get("bookmakers", []):
            bk_key = bookmaker.get("key", "unknown")
            for market in bookmaker.get("markets", []):
                mkt_key = market.get("key", "")

                if mkt_key == "h2h":
                    for outcome in market.get("outcomes", []):
                        name = _normalize_team(outcome.get("name", ""))
                        price = outcome.get("price")
                        if price is None:
                            continue
                        if name == home:
                            h2h_home[bk_key] = float(price)
                        elif name == away:
                            h2h_away[bk_key] = float(price)

                elif mkt_key == "totals":
                    for outcome in market.get("outcomes", []):
                        name = outcome.get("name", "").lower()
                        price = outcome.get("price")
                        point = outcome.get("point")
                        if price is None:
                            continue
                        if "over" in name:
                            totals_over[bk_key] = float(price)
                            if totals_line is None and point is not None:
                                totals_line = float(point)
                        elif "under" in name:
                            totals_under[bk_key] = float(price)

                elif mkt_key == "spreads":
                    for outcome in market.get("outcomes", []):
                        name = _normalize_team(outcome.get("name", ""))
                        price = outcome.get("price")
                        point = outcome.get("point")
                        if price is None:
                            continue
                        if name == home:
                            spreads_home[bk_key] = float(price)
                            if spreads_line is None and point is not None:
                                spreads_line = float(point)
                        elif name == away:
                            spreads_away[bk_key] = float(price)

        return {
            "h2h": {
                "Home": h2h_home,
                "Away": h2h_away,
            },
            "totals": {
                "over": totals_over,
                "under": totals_under,
                "line": totals_line,
            },
            "spreads": {
                "home": spreads_home,
                "away": spreads_away,
                "line": spreads_line,
            },
        }

    # ------------------------------------------------------------------
    # statsapi fixtures
    # ------------------------------------------------------------------

    def get_fixtures_statsapi(self, days_ahead: int = 2) -> list[dict]:
        """Return upcoming MLB games via the statsapi library (free, no API key).

        Fetches from today to today + days_ahead days.

        Each dict:
            home_name, away_name, date, venue, game_id, league,
            home_probable_pitcher, away_probable_pitcher
        """
        today = datetime.now(timezone.utc)
        end = today + timedelta(days=days_ahead)
        start_str = today.strftime("%Y-%m-%d")
        end_str = end.strftime("%Y-%m-%d")

        try:
            raw: list[dict] = statsapi.schedule(
                start_date=start_str,
                end_date=end_str,
            )
        except Exception as exc:
            logger.error("statsapi.schedule fixtures failed: %s", exc)
            return []

        fixtures: list[dict] = []
        for g in raw:
            try:
                status = (g.get("status") or "").lower()
                # Include only scheduled / preview games (not already final)
                if "final" in status or "completed" in status:
                    continue

                fixtures.append({
                    "game_id": g.get("game_id"),
                    "date": g.get("game_date", ""),
                    "home_name": g.get("home_name", ""),
                    "away_name": g.get("away_name", ""),
                    "venue": g.get("venue_name"),
                    "league": "MLB",
                    "home_probable_pitcher": g.get("home_probable_pitcher"),
                    "away_probable_pitcher": g.get("away_probable_pitcher"),
                })
            except (KeyError, TypeError):
                continue

        logger.info("statsapi fixtures: %d upcoming MLB games (%s -> %s)", len(fixtures), start_str, end_str)
        return fixtures

    # ------------------------------------------------------------------
    # statsapi standings
    # ------------------------------------------------------------------

    def get_standings_statsapi(self, season: int | None = None) -> list[dict]:
        """Return MLB standings via the statsapi library (free, no API key).

        Each dict:
            team_name, wins, losses, division, division_rank,
            pct, runs_scored, runs_allowed
        """
        if season is None:
            season = datetime.now(timezone.utc).year

        try:
            raw: dict = statsapi.standings_data(leagueId="103,104", season=str(season))
        except Exception as exc:
            logger.error("statsapi.standings_data failed: %s", exc)
            return []

        standings: list[dict] = []
        for division_id, division_data in raw.items():
            division_name = division_data.get("div_name", str(division_id))
            for team in division_data.get("teams", []):
                try:
                    standings.append({
                        "team_name": team.get("name", ""),
                        "wins": int(team.get("w", 0)),
                        "losses": int(team.get("l", 0)),
                        "division": division_name,
                        "division_rank": int(team.get("div_rank", 0)),
                        "pct": team.get("winning_percentage", ""),
                        "runs_scored": team.get("runs", None),
                        "runs_allowed": team.get("runs_against", None),
                    })
                except (KeyError, TypeError, ValueError):
                    continue

        logger.info("statsapi standings: %d teams for season %d", len(standings), season)
        return standings
