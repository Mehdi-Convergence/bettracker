"""Live odds collection from The Odds API."""

import httpx
from rich.console import Console

from src.config import settings

console = Console()

# Map The Odds API sport keys to our league codes
ODDS_API_SPORT_MAP = {
    # Top leagues
    "soccer_epl": "E0",            # Premier League
    "soccer_germany_bundesliga": "D1",  # Bundesliga
    "soccer_italy_serie_a": "I1",   # Serie A
    "soccer_spain_la_liga": "SP1",  # La Liga
    "soccer_netherlands_eredivisie": "N1",  # Eredivisie
    "soccer_france_ligue_one": "F1",  # Ligue 1
    # Second divisions
    "soccer_efl_champ": "E1",      # Championship
    "soccer_germany_bundesliga2": "D2",  # 2. Bundesliga
    "soccer_italy_serie_b": "I2",   # Serie B
    "soccer_spain_segunda_division": "SP2",  # Segunda Division
    "soccer_france_ligue_two": "F2",  # Ligue 2
    # Other top leagues
    "soccer_portugal_primeira_liga": "P1",  # Liga Portugal
    "soccer_belgium_first_div": "B1",  # Jupiler League
    "soccer_turkey_super_league": "T1",  # Super Lig
    "soccer_greece_super_league": "G1",  # Super League Greece
    "soccer_spl": "SC0",           # Scottish Premiership
}

# Reverse: our league code -> Odds API sport key
LEAGUE_TO_SPORT = {v: k for k, v in ODDS_API_SPORT_MAP.items()}

API_BASE = "https://api.the-odds-api.com/v4"


class OddsCollector:
    """Collect live odds from The Odds API (500 free requests/month)."""

    def __init__(self, api_key: str = settings.ODDS_API_KEY):
        self.api_key = api_key
        self.remaining_requests = None
        self.used_requests = None

    def get_upcoming_odds(
        self,
        leagues: list[str] | None = None,
        markets: str = "h2h",
        regions: str = "eu,uk",
    ) -> list[dict]:
        """Fetch upcoming match odds for specified leagues.

        Returns list of dicts with structure:
        {
            "match_id": "abc123",
            "home_team": "Arsenal",
            "away_team": "Chelsea",
            "league": "E0",
            "date": "2024-12-15T15:00:00Z",
            "odds": {
                "H": {"pinnacle": 1.85, "bet365": 1.90, ...},
                "D": {"pinnacle": 3.40, "bet365": 3.50, ...},
                "A": {"pinnacle": 4.20, "bet365": 4.00, ...},
            }
        }
        """
        if not self.api_key:
            console.print("[red]No ODDS_API_KEY configured. Set it in .env[/red]")
            return []

        if leagues is None:
            leagues = ["E0", "D1", "I1", "SP1", "N1"]

        all_matches = []
        for league in leagues:
            sport_key = LEAGUE_TO_SPORT.get(league)
            if not sport_key:
                console.print(f"[yellow]No sport key mapping for {league}[/yellow]")
                continue

            matches = self._fetch_sport_odds(sport_key, league, markets, regions)
            all_matches.extend(matches)

        return all_matches

    def _fetch_sport_odds(
        self, sport_key: str, league_code: str, markets: str, regions: str
    ) -> list[dict]:
        """Fetch odds for a single sport/league."""
        url = f"{API_BASE}/sports/{sport_key}/odds"
        params = {
            "apiKey": self.api_key,
            "regions": regions,
            "markets": markets,
            "oddsFormat": "decimal",
        }

        try:
            resp = httpx.get(url, params=params, timeout=30)
            self._track_quota(resp)

            if resp.status_code == 401:
                console.print("[red]Invalid API key for The Odds API[/red]")
                return []
            if resp.status_code == 429:
                console.print("[red]API rate limit reached (quota exhausted)[/red]")
                return []

            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as e:
            console.print(f"[red]API error for {sport_key}: {e}[/red]")
            return []

        matches = []
        for event in data:
            odds = self._parse_odds(event)
            matches.append({
                "match_id": event.get("id"),
                "home_team": event.get("home_team"),
                "away_team": event.get("away_team"),
                "league": league_code,
                "date": event.get("commence_time", ""),
                "odds": odds,
            })

        return matches

    def _parse_odds(self, event: dict) -> dict:
        """Parse bookmaker odds into {outcome: {bookmaker: odds}} format."""
        odds = {"H": {}, "D": {}, "A": {}}
        home_team = event.get("home_team", "")

        for bookmaker in event.get("bookmakers", []):
            bk_name = bookmaker.get("key", "unknown")
            for market in bookmaker.get("markets", []):
                if market.get("key") != "h2h":
                    continue
                for outcome in market.get("outcomes", []):
                    name = outcome.get("name", "")
                    price = outcome.get("price")
                    if price is None:
                        continue

                    if name == home_team:
                        odds["H"][bk_name] = price
                    elif name == "Draw":
                        odds["D"][bk_name] = price
                    else:
                        odds["A"][bk_name] = price

        return odds

    def _track_quota(self, response: httpx.Response):
        """Track API quota from response headers."""
        remaining = response.headers.get("x-requests-remaining")
        used = response.headers.get("x-requests-used")
        if remaining is not None:
            self.remaining_requests = int(remaining)
        if used is not None:
            self.used_requests = int(used)

    def get_quota(self) -> dict:
        """Return current quota usage."""
        return {
            "remaining": self.remaining_requests,
            "used": self.used_requests,
        }
