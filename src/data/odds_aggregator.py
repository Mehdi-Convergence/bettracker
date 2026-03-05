"""Aggregate odds from Betclic (scraping) + The Odds API."""

import logging

from src.data.betclic_scraper import (
    get_betclic_matches,
    get_betclic_match_detail,
    get_betclic_live,
    get_cached_at,
)
from src.data.odds_collector import OddsCollector

logger = logging.getLogger(__name__)


class OddsAggregator:
    """Merge Betclic (primary, free) with The Odds API (fallback, multi-bookmaker)."""

    def __init__(self):
        self.odds_collector = OddsCollector()

    async def get_matches(
        self,
        leagues: list[str] | None = None,
        live: bool = False,
        force: bool = False,
    ) -> tuple[list[dict], str]:
        """Get matches with odds from best available source.

        Returns (matches, source) where source is "betclic", "odds_api", or "merged".
        Each match dict has:
            match_id, home_team, away_team, league, league_name, date_str,
            is_live, score, timer, url, odds_1x2, markets (if detail scraped).
        """
        if live:
            return await self._get_live(force=force)

        # Try Betclic first (free, unlimited)
        betclic_matches = []
        try:
            betclic_matches = await get_betclic_matches(
                leagues=leagues, force=force
            )
        except Exception as e:
            logger.warning("Betclic scrape failed: %s", e)

        if betclic_matches:
            # Convert Betclic format to standard format
            matches = self._normalize_betclic(betclic_matches)
            return matches, "betclic"

        # Fallback to The Odds API
        logger.info("Betclic unavailable, falling back to The Odds API")
        try:
            odds_api_matches = self.odds_collector.get_upcoming_odds(
                leagues=leagues
            )
            if odds_api_matches:
                return odds_api_matches, "odds_api"
        except Exception as e:
            logger.warning("Odds API fallback also failed: %s", e)

        return [], "none"

    async def get_match_detail(
        self, match_url: str, force: bool = False
    ) -> dict:
        """Get all markets for a specific match (Betclic only)."""
        try:
            return await get_betclic_match_detail(match_url, force=force)
        except Exception as e:
            logger.error("Match detail scrape failed: %s", e)
            return {"home_team": "", "away_team": "", "markets": []}

    async def _get_live(
        self, force: bool = False
    ) -> tuple[list[dict], str]:
        """Get live matches (Betclic only - Odds API doesn't support live)."""
        try:
            live_matches = await get_betclic_live(force=force)
            matches = self._normalize_betclic(live_matches)
            return matches, "betclic"
        except Exception as e:
            logger.warning("Betclic live scrape failed: %s", e)
            return [], "none"

    def _normalize_betclic(self, betclic_matches: list[dict]) -> list[dict]:
        """Convert Betclic scraper format to standard match format.

        Standard format matches the existing OddsCollector output structure
        but with additional fields (is_live, score, url, etc.).
        """
        normalized = []
        for m in betclic_matches:
            odds_1x2 = m.get("odds_1x2", {})

            # Build odds dict in OddsCollector-compatible format
            # {outcome: {bookmaker: odds}}
            odds = {"H": {}, "D": {}, "A": {}}
            if odds_1x2.get("H"):
                odds["H"]["betclic"] = odds_1x2["H"]
            if odds_1x2.get("D"):
                odds["D"]["betclic"] = odds_1x2["D"]
            if odds_1x2.get("A"):
                odds["A"]["betclic"] = odds_1x2["A"]

            normalized.append({
                "match_id": m.get("match_id"),
                "home_team": m["home_team"],
                "away_team": m["away_team"],
                "league": m.get("league", ""),
                "league_name": m.get("league_name", ""),
                "date": m.get("date_str", ""),
                "is_live": m.get("is_live", False),
                "score": m.get("score"),
                "timer": m.get("timer", ""),
                "url": m.get("url", ""),
                "odds": odds,
            })
        return normalized

    def get_quota(self) -> dict:
        """Return Odds API quota (None if using Betclic)."""
        return self.odds_collector.get_quota()

    def get_cached_at(self) -> str | None:
        """Return latest Betclic cache timestamp."""
        return get_cached_at()
