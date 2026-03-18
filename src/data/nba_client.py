"""NBA live odds client using The Odds API.

Sport key: basketball_nba
Markets: h2h (moneyline), totals (over/under), spreads
"""

import logging
from datetime import datetime, timezone

import httpx

from src.config import settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.the-odds-api.com/v4"
ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
_CACHE_TTL = 3600  # 1h

# NBA team name normalization: Odds API may use different spellings
_TEAM_ALIASES: dict[str, str] = {
    "Los Angeles Clippers": "LA Clippers",
    "La Clippers": "LA Clippers",
}


def _normalize_team(name: str) -> str:
    return _TEAM_ALIASES.get(name, name)


class NBAClient:
    """Fetch NBA live odds from The Odds API, and fixtures/standings from ESPN."""

    SPORT_KEY = "basketball_nba"

    def __init__(self, api_key: str = settings.ODDS_API_KEY):
        self.api_key = api_key
        self.remaining_requests: int | None = None

    def _track_quota(self, resp: httpx.Response) -> None:
        remaining = resp.headers.get("x-requests-remaining")
        if remaining:
            self.remaining_requests = int(remaining)
            if self.remaining_requests < 50:
                logger.warning(
                    "Odds API quota low: %d requests remaining",
                    self.remaining_requests,
                )

    # ------------------------------------------------------------------
    # Odds API
    # ------------------------------------------------------------------

    def get_matches(
        self,
        timeframe: str = "48h",
        markets: str = "h2h,totals,spreads",
        regions: str = "eu,uk,us",
    ) -> list[dict]:
        """Return NBA games with multi-bookmaker odds for the next timeframe.

        Each dict contains:
            home_team, away_team, date,
            odds: {h2h, totals, spreads},
            best_odds_home, best_odds_away
        """
        if not self.api_key:
            logger.warning("No ODDS_API_KEY configured — NBA live odds unavailable")
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
            logger.error("NBA odds fetch failed: %s", e)
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

                # Only games within the timeframe window
                delta_seconds = (ev_dt - now).total_seconds()
                if delta_seconds < -3600:
                    continue  # already started/finished
                if delta_seconds > hours * 3600:
                    continue  # too far ahead

                home = _normalize_team(ev.get("home_team", ""))
                away = _normalize_team(ev.get("away_team", ""))

                odds = self._parse_nba_odds(ev, home, away)

                # Skip if no h2h odds available at all
                if not odds["h2h"]["Home"] and not odds["h2h"]["Away"]:
                    continue

                # Convenience fields: best (max) odds across all bookmakers
                home_prices = list(odds["h2h"]["Home"].values())
                away_prices = list(odds["h2h"]["Away"].values())
                best_odds_home = max(home_prices) if home_prices else None
                best_odds_away = max(away_prices) if away_prices else None

                matches.append({
                    "home_team": home,
                    "away_team": away,
                    "date": commence,
                    "odds": odds,
                    "best_odds_home": best_odds_home,
                    "best_odds_away": best_odds_away,
                })
            except Exception as e:
                logger.debug("NBA event parse error: %s", e)
                continue

        logger.info("NBA: %d upcoming games with odds", len(matches))
        return matches

    def _parse_nba_odds(self, event: dict, home: str, away: str) -> dict:
        """Parse all bookmakers into multi-bookmaker odds dict.

        Returns:
        {
            "h2h": {
                "Home": {"pinnacle": 1.55, "bet365": 1.52, ...},
                "Away": {"pinnacle": 2.60, "bet365": 2.55, ...},
            },
            "totals": {
                "over": {"pinnacle": 1.91, ...},
                "under": {"pinnacle": 1.93, ...},
                "line": 215.5,
            },
            "spreads": {
                "home": {"pinnacle": 1.91, ...},
                "away": {"pinnacle": 1.91, ...},
                "line": -5.5,
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
                        team = _normalize_team(outcome.get("name", ""))
                        price = outcome.get("price")
                        if price is None:
                            continue
                        price = float(price)
                        if team == home:
                            h2h_home[bk_key] = price
                        elif team == away:
                            h2h_away[bk_key] = price

                elif mkt_key == "totals":
                    for outcome in market.get("outcomes", []):
                        name = outcome.get("name", "").lower()
                        price = outcome.get("price")
                        point = outcome.get("point")
                        if price is None:
                            continue
                        price = float(price)
                        if "over" in name:
                            totals_over[bk_key] = price
                            if totals_line is None and point is not None:
                                totals_line = float(point)
                        elif "under" in name:
                            totals_under[bk_key] = price

                elif mkt_key == "spreads":
                    for outcome in market.get("outcomes", []):
                        team = _normalize_team(outcome.get("name", ""))
                        price = outcome.get("price")
                        point = outcome.get("point")
                        if price is None:
                            continue
                        price = float(price)
                        if team == home:
                            spreads_home[bk_key] = price
                            if spreads_line is None and point is not None:
                                spreads_line = float(point)
                        elif team == away:
                            spreads_away[bk_key] = price

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
    # ESPN public API (no auth)
    # ------------------------------------------------------------------

    def get_fixtures_espn(self) -> list[dict]:
        """Fetch today's NBA scoreboard from ESPN public API.

        Returns list of dicts:
            home_name, away_name, date, venue,
            home_id, away_id, game_id, league
        """
        try:
            resp = httpx.get(
                f"{ESPN_BASE}/scoreboard",
                timeout=20,
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as e:
            logger.error("ESPN NBA scoreboard fetch failed: %s", e)
            return []
        except Exception as e:
            logger.error("ESPN NBA scoreboard parse error: %s", e)
            return []

        fixtures: list[dict] = []
        events = data.get("events", [])

        for event in events:
            try:
                game_id = event.get("id", "")
                date = event.get("date", "")
                competitions = event.get("competitions", [])
                if not competitions:
                    continue
                comp = competitions[0]

                # Venue
                venue_data = comp.get("venue", {})
                venue = venue_data.get("fullName") or venue_data.get("shortName")

                # Teams
                competitors = comp.get("competitors", [])
                home_data = next(
                    (c for c in competitors if c.get("homeAway") == "home"), None
                )
                away_data = next(
                    (c for c in competitors if c.get("homeAway") == "away"), None
                )
                if not home_data or not away_data:
                    continue

                home_team = home_data.get("team", {})
                away_team = away_data.get("team", {})

                fixtures.append({
                    "home_name": home_team.get("displayName") or home_team.get("name", ""),
                    "away_name": away_team.get("displayName") or away_team.get("name", ""),
                    "date": date,
                    "venue": venue,
                    "home_id": home_team.get("id"),
                    "away_id": away_team.get("id"),
                    "game_id": game_id,
                    "league": "NBA",
                })
            except Exception as e:
                logger.debug("ESPN event parse error: %s", e)
                continue

        logger.info("ESPN NBA: %d fixtures fetched", len(fixtures))
        return fixtures

    def get_standings_espn(self) -> list[dict]:
        """Fetch NBA standings from ESPN public API.

        Returns list of dicts:
            team_name, wins, losses, conference, conference_rank, pct
        """
        try:
            resp = httpx.get(
                "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings",
                timeout=20,
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as e:
            logger.error("ESPN NBA standings fetch failed: %s", e)
            return []
        except Exception as e:
            logger.error("ESPN NBA standings parse error: %s", e)
            return []

        standings: list[dict] = []

        # ESPN standings are grouped by conference under data.children
        children = data.get("children", [])
        for conference_group in children:
            conference_name = conference_group.get("name", "")
            # Each group contains standings entries under standings.entries
            standings_data = conference_group.get("standings", {})
            entries = standings_data.get("entries", [])

            for rank, entry in enumerate(entries, start=1):
                try:
                    team_data = entry.get("team", {})
                    team_name = (
                        team_data.get("displayName")
                        or team_data.get("name", "")
                    )

                    # Stats are in a list of {name, value} dicts
                    stats: dict[str, float] = {}
                    for stat in entry.get("stats", []):
                        stat_name = stat.get("name", "")
                        stat_value = stat.get("value")
                        if stat_name and stat_value is not None:
                            try:
                                stats[stat_name] = float(stat_value)
                            except (TypeError, ValueError):
                                pass

                    wins = int(stats.get("wins", 0))
                    losses = int(stats.get("losses", 0))
                    pct = stats.get("winPercent") or stats.get("gamesBehind")

                    # winPercent key may vary; compute from wins/losses if absent
                    if "winPercent" in stats:
                        pct = stats["winPercent"]
                    elif wins + losses > 0:
                        pct = round(wins / (wins + losses), 3)
                    else:
                        pct = None

                    standings.append({
                        "team_name": team_name,
                        "wins": wins,
                        "losses": losses,
                        "conference": conference_name,
                        "conference_rank": rank,
                        "pct": pct,
                    })
                except Exception as e:
                    logger.debug("ESPN standings entry parse error: %s", e)
                    continue

        logger.info("ESPN NBA: %d standings entries fetched", len(standings))
        return standings
