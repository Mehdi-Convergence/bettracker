"""Scanner API endpoints — reads pre-computed scans from cache (worker does the heavy lifting)."""

import hashlib
import json as _json
import logging
import time as _time
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query

from src.api.deps import require_tier
from src.api.schemas import (
    AIResearchResponse,
    AIScanMatch,
    AIScanResponse,
)
from src.cache import cache_get

router = APIRouter(tags=["scanner"], dependencies=[Depends(require_tier("pro"))])

# File fallback directory (same as worker writes to)
_AF_CACHE_DIR = Path("data/cache/api_football")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _read_cached_scan(cache_key: str, file_pattern: str | None = None) -> dict | None:
    """Read scan result from Redis, falling back to file cache."""
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    # File fallback
    if file_pattern:
        cache_file = _AF_CACHE_DIR / file_pattern
        if cache_file.exists():
            try:
                data = _json.loads(cache_file.read_text(encoding="utf-8"))
                # Accept file cache up to 30 min old
                age = _time.time() - data.get("_cached_at", 0)
                if age < 1800:
                    return data
            except Exception:
                pass
    return None


def _filter_matches(
    matches: list[dict],
    league_list: list[str] | None = None,
) -> list[dict]:
    """Filter matches by league codes (case-insensitive substring match)."""
    if not league_list:
        return matches
    filtered = []
    for m in matches:
        league = (m.get("league") or "").lower()
        if any(lg.lower() in league for lg in league_list):
            filtered.append(m)
    return filtered


# ---------------------------------------------------------------------------
# AI Scanner endpoints — cache-only reads
# ---------------------------------------------------------------------------


@router.get("/scanner/ai-scan", response_model=AIScanResponse)
async def ai_scan(
    sport: str = Query(default="football", description="football or tennis"),
    leagues: str = Query(default="", description="Comma-separated league codes"),
    timeframe: str = Query(default="48h", description="24h, 48h, 72h, or 1w"),
    force: bool = Query(default=False, description="Force refresh — triggers worker re-scan"),
    cache_only: bool = Query(default=False, description="Only return cached data"),
):
    """Read pre-computed scan results from cache. The background worker handles scanning."""
    league_list = [lg.strip() for lg in leagues.split(",") if lg.strip()]

    if sport == "tennis":
        return _read_tennis_scan()

    # --- Football: read from cache ---
    # Build the same cache key the worker uses (no league filter = "all" key)
    scan_key = hashlib.md5(f"football__{timeframe}".encode()).hexdigest()[:12]
    cache_redis_key = f"scan:football:{scan_key}"
    file_pattern = f"scan_result_{scan_key}.json"

    cached = _read_cached_scan(cache_redis_key, file_pattern)

    # If force=True and no cache, trigger worker scan inline (fallback)
    if cached is None and force:
        try:
            from src.workers.scan_worker import run_football_scan
            await run_football_scan()
            cached = _read_cached_scan(cache_redis_key, file_pattern)
        except Exception as exc:
            logger.error("Inline football scan failed: %s", exc)

    if cached is None:
        return AIScanResponse(
            matches=[], sport="football", source="api_football",
            cached=False, cached_at=None, research_duration_seconds=0.0,
        )

    raw = cached.get("matches", [])
    # Apply league filter in memory
    raw = _filter_matches(raw, league_list)

    return AIScanResponse(
        matches=[AIScanMatch(**m) for m in raw],
        sport="football",
        source="api_football",
        cached=True,
        cached_at=datetime.fromtimestamp(cached["_cached_at"]).isoformat(),
        research_duration_seconds=cached.get("duration", 0.0),
    )


def _read_tennis_scan() -> AIScanResponse:
    """Read pre-computed tennis scan from cache."""
    cached = cache_get("scan:tennis:all")
    if cached is None:
        return AIScanResponse(
            matches=[], sport="tennis", source="odds_api",
            cached=False, cached_at=None, research_duration_seconds=0.0,
        )

    raw = cached.get("matches", [])
    return AIScanResponse(
        matches=[AIScanMatch(**m) for m in raw],
        sport="tennis",
        source="odds_api",
        cached=True,
        cached_at=datetime.fromtimestamp(cached["_cached_at"]).isoformat(),
        research_duration_seconds=cached.get("duration", 0.0),
    )


def get_scanned_matches(
    min_edge: float | None = None,
    min_prob: float | None = None,
    min_odds: float | None = None,
    max_odds: float | None = None,
    outcomes: list[str] | None = None,
    excluded_leagues: list[str] | None = None,
):
    """Synchronous helper: load cached scan results and filter by campaign criteria.

    Returns (filtered_matches, total_scanned, 0, 0, 0) for backward compat.
    """
    import json as _json
    from src.data.api_football_client import CACHE_DIR as AF_CACHE_DIR

    # Find most recent scan cache file
    cache_files = sorted(AF_CACHE_DIR.glob("scan_result_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    all_matches: list[AIScanMatch] = []
    for cf in cache_files[:1]:
        try:
            data = _json.loads(cf.read_text(encoding="utf-8"))
            all_matches = [AIScanMatch(**m) for m in data.get("matches", [])]
        except Exception:
            pass
        break

    total_scanned = len(all_matches)

    # Filter
    filtered: list[AIScanMatch] = []
    for m in all_matches:
        if excluded_leagues:
            if any(el.lower() in m.league.lower() for el in excluded_leagues):
                continue

        # Check if any outcome passes filters
        edges = m.edges or {}
        odds_1x2 = {}
        if isinstance(m.odds, dict):
            odds_1x2 = m.odds.get("1x2", {})

        has_value = False
        for key in (outcomes or ["H", "D", "A"]):
            edge = edges.get(key, 0)
            if min_edge and edge < min_edge:
                continue
            prob_map = {"H": m.model_prob_home, "D": m.model_prob_draw, "A": m.model_prob_away}
            prob = prob_map.get(key, 0) or 0
            if min_prob and prob < min_prob:
                continue
            bk_odds = odds_1x2.get(key, {})
            best = max((float(v) for v in bk_odds.values() if v and float(v) > 1), default=0.0) if isinstance(bk_odds, dict) else 0.0
            if min_odds and best < min_odds:
                continue
            if max_odds and best > max_odds:
                continue
            if edge > 0:
                has_value = True
                break

        if has_value:
            filtered.append(m)

    return filtered, total_scanned, 0, 0, 0


@router.get("/scanner/ai-research", response_model=AIResearchResponse)
async def ai_research(
    sport: str = Query(default="football"),
    home: str = Query(..., description="Home team or player 1"),
    away: str = Query(..., description="Away team or player 2"),
    competition: str = Query(..., description="League or tournament"),
    date: str = Query(..., description="Match date"),
    force: bool = Query(default=False),
):
    """Deep research on a specific match via Claude Code web search."""
    from src.data.claude_researcher import ClaudeResearcher

    researcher = ClaudeResearcher()
    result = await researcher.deep_research(
        sport=sport, home=home, away=away,
        competition=competition, date=date, force=force,
    )

    if "_error" in result:
        logger.error("Claude research error: %s", result["_error"])
        raise HTTPException(
            status_code=502,
            detail="Service de recherche temporairement indisponible",
        )

    duration = result.get("_duration_seconds", 0.0)
    from_cache = result.get("_from_cache", False)
    cached_at_ts = result.get("_cached_at")

    if sport == "tennis":
        home_analysis = result.get("player1_analysis", {})
        away_analysis = result.get("player2_analysis", {})
    else:
        home_analysis = result.get("home_team_analysis", {})
        away_analysis = result.get("away_team_analysis", {})

    return AIResearchResponse(
        sport=sport,
        match_info=result.get("match_info", {}),
        odds=result.get("odds", {}),
        home_analysis=home_analysis,
        away_analysis=away_analysis,
        injuries=result.get("injuries_suspensions", result.get("injuries", {})),
        lineups=result.get("expected_lineups"),
        h2h=result.get("h2h", {}),
        key_players=result.get("key_players"),
        tactical_analysis=result.get("tactical_analysis", ""),
        expert_prediction=result.get("expert_prediction", {}),
        cached=from_cache,
        cached_at=datetime.fromtimestamp(cached_at_ts).isoformat() if cached_at_ts else None,
        research_duration_seconds=duration,
    )
