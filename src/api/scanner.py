"""Scanner API endpoints — reads pre-computed scans from cache (worker does the heavy lifting)."""

import hashlib
import json as _json
import logging
import time as _time
from datetime import datetime
from pathlib import Path
from typing import Literal

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from src.api.deps import require_tier
from src.rate_limit import limiter
from src.api.schemas import (
    AIResearchResponse,
    AIScanMatch,
    AIScanResponse,
    PMURaceCard,
    PMUScanResponse,
)
from src.cache import cache_get, cache_set, cache_exists

router = APIRouter(tags=["scanner"], dependencies=[Depends(require_tier("pro"))])

# ---------------------------------------------------------------------------
# Scan mutex — prevents concurrent force-refresh scans for the same sport
# ---------------------------------------------------------------------------

_SCAN_LOCK_TTL = 300  # 5 minutes max lock


def _acquire_scan_lock(sport: str) -> bool:
    """Try to acquire a scan lock. Returns True if acquired, False if already running."""
    lock_key = f"scan:{sport}:running"
    if cache_exists(lock_key):
        return False
    cache_set(lock_key, True, ttl=_SCAN_LOCK_TTL)
    return True


def _release_scan_lock(sport: str) -> None:
    """Release the scan lock."""
    from src.cache import cache_delete
    cache_delete(f"scan:{sport}:running")

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
@limiter.limit("30/minute")
async def ai_scan(
    request: Request,
    sport: Literal["football", "tennis", "nba", "rugby", "mlb", "pmu"] = Query(default="football", description="Sport to scan"),
    leagues: str = Query(default="", description="Comma-separated league codes"),
    timeframe: str = Query(default="48h", description="24h, 48h, 72h, or 1w"),
    force: bool = Query(default=False, description="Force refresh — triggers worker re-scan"),
    cache_only: bool = Query(default=False, description="Only return cached data"),
):
    """Read pre-computed scan results from cache. The background worker handles scanning."""
    league_list = [lg.strip() for lg in leagues.split(",") if lg.strip()]

    if sport == "tennis":
        cached_tennis = cache_get("scan:tennis:all")
        if cached_tennis is None and force and _acquire_scan_lock("tennis"):
            try:
                from src.workers.scan_worker import run_tennis_scan
                await run_tennis_scan()
            except Exception as exc:
                logger.error("Inline tennis scan failed: %s", exc)
            finally:
                _release_scan_lock("tennis")
        return _read_tennis_scan()

    if sport == "nba":
        cached_nba = cache_get("scan:nba:all")
        if cached_nba is None and force and _acquire_scan_lock("nba"):
            try:
                from src.workers.scan_worker import run_nba_scan
                await run_nba_scan()
            except Exception as exc:
                logger.error("Inline NBA scan failed: %s", exc)
            finally:
                _release_scan_lock("nba")
        return _read_nba_scan()

    if sport == "rugby":
        cached_rugby = cache_get("scan:rugby:all")
        if cached_rugby is None and force and _acquire_scan_lock("rugby"):
            try:
                from src.workers.scan_worker import run_rugby_scan
                await run_rugby_scan()
            except Exception as exc:
                logger.error("Inline rugby scan failed: %s", exc)
            finally:
                _release_scan_lock("rugby")
        return _read_rugby_scan()

    if sport == "mlb":
        cached_mlb = cache_get("scan:mlb:all")
        if cached_mlb is None and force and _acquire_scan_lock("mlb"):
            try:
                from src.workers.scan_worker import run_mlb_scan
                await run_mlb_scan()
            except Exception as exc:
                logger.error("Inline MLB scan failed: %s", exc)
            finally:
                _release_scan_lock("mlb")
        return _read_mlb_scan()

    if sport == "pmu":
        cached_pmu = cache_get("scan:pmu:all")
        if cached_pmu is None and force and _acquire_scan_lock("pmu"):
            try:
                from src.workers.scan_worker import run_pmu_scan
                await run_pmu_scan()
            except Exception as exc:
                logger.error("Inline PMU scan failed: %s", exc)
            finally:
                _release_scan_lock("pmu")
        return _read_pmu_scan()  # type: ignore[return-value]

    # --- Football: read from cache ---
    # Worker always scans with timeframe="48h", so always read that cache key.
    # Then filter by date in memory based on the requested timeframe.
    worker_timeframe = "48h"
    scan_key = hashlib.md5(f"football__{worker_timeframe}".encode()).hexdigest()[:12]
    cache_redis_key = f"scan:football:{scan_key}"
    file_pattern = f"scan_result_{scan_key}.json"

    cached = _read_cached_scan(cache_redis_key, file_pattern)

    # If force=True and no cache, trigger worker scan inline (fallback)
    if cached is None and force and _acquire_scan_lock("football"):
        try:
            from src.workers.scan_worker import run_football_scan
            await run_football_scan()
            cached = _read_cached_scan(cache_redis_key, file_pattern)
        except Exception as exc:
            logger.error("Inline football scan failed: %s", exc)
        finally:
            _release_scan_lock("football")

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


def _read_nba_scan() -> AIScanResponse:
    """Read pre-computed NBA scan from cache."""
    cached = cache_get("scan:nba:all")
    if cached is None:
        return AIScanResponse(
            matches=[], sport="nba", source="odds_api",
            cached=False, cached_at=None, research_duration_seconds=0.0,
        )
    raw = cached.get("matches", [])
    return AIScanResponse(
        matches=[AIScanMatch(**m) for m in raw],
        sport="nba",
        source="odds_api",
        cached=True,
        cached_at=datetime.fromtimestamp(cached["_cached_at"]).isoformat(),
        research_duration_seconds=cached.get("duration", 0.0),
    )


def _read_rugby_scan() -> AIScanResponse:
    """Read pre-computed rugby scan from cache."""
    cached = cache_get("scan:rugby:all")
    if cached is None:
        return AIScanResponse(
            matches=[], sport="rugby", source="odds_api",
            cached=False, cached_at=None, research_duration_seconds=0.0,
        )
    raw = cached.get("matches", [])
    return AIScanResponse(
        matches=[AIScanMatch(**m) for m in raw],
        sport="rugby",
        source="odds_api",
        cached=True,
        cached_at=datetime.fromtimestamp(cached["_cached_at"]).isoformat(),
        research_duration_seconds=cached.get("duration", 0.0),
    )


def _read_mlb_scan() -> AIScanResponse:
    """Read pre-computed MLB scan from cache."""
    _MLB_CACHE_DIR = Path("data/cache/mlb")
    cached = cache_get("scan:mlb:all")
    if cached is None:
        # File fallback
        if _MLB_CACHE_DIR.exists():
            cache_files = sorted(
                _MLB_CACHE_DIR.glob("scan_result_*.json"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            for cf in cache_files[:1]:
                try:
                    import time as _time2
                    data = _json.loads(cf.read_text(encoding="utf-8"))
                    age = _time2.time() - data.get("_cached_at", 0)
                    if age < 1800:
                        cached = data
                except Exception:
                    pass
    if cached is None:
        return AIScanResponse(
            matches=[], sport="mlb", source="odds_api",
            cached=False, cached_at=None, research_duration_seconds=0.0,
        )
    raw = cached.get("matches", [])
    return AIScanResponse(
        matches=[AIScanMatch(**m) for m in raw],
        sport="mlb",
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


# ---------------------------------------------------------------------------
# PMU scan helpers
# ---------------------------------------------------------------------------

_PMU_CACHE_DIR = Path("data/cache/pmu")


def _read_pmu_scan() -> PMUScanResponse:
    """Read pre-computed PMU scan from Redis or file cache."""
    cached = cache_get("scan:pmu:all")

    # File fallback (jusqu'a 30 min)
    if cached is None and _PMU_CACHE_DIR.exists():
        cache_files = sorted(
            _PMU_CACHE_DIR.glob("scan_result_*.json"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for cf in cache_files[:1]:
            try:
                data = _json.loads(cf.read_text(encoding="utf-8"))
                age = _time.time() - data.get("_cached_at", 0)
                if age < 1800:
                    cached = data
            except Exception:
                pass

    if cached is None:
        return PMUScanResponse(races=[], cached=False, cached_at=None)

    raw_races = cached.get("races", [])
    races_out: list[PMURaceCard] = []
    for r in raw_races:
        try:
            races_out.append(PMURaceCard(**r))
        except Exception:
            pass

    cached_at_str = None
    ts = cached.get("_cached_at")
    if ts:
        try:
            cached_at_str = datetime.fromtimestamp(float(ts)).isoformat()
        except Exception:
            pass

    return PMUScanResponse(
        races=races_out,
        cached=True,
        cached_at=cached_at_str,
        source="pmu_api",
    )


@router.get("/scanner/pmu", response_model=PMUScanResponse)
@limiter.limit("30/minute")
async def pmu_scan(
    request: Request,
    force: bool = Query(default=False, description="Force refresh depuis l'API PMU"),
):
    """Retourne les courses PMU du jour avec probas et edges pre-calcules."""
    if force and _acquire_scan_lock("pmu"):
        import asyncio

        async def _bg_pmu():
            try:
                from src.workers.scan_worker import run_pmu_scan
                await run_pmu_scan()
            except Exception as exc:
                logger.error("Background PMU scan failed: %s", exc)
            finally:
                _release_scan_lock("pmu")

        asyncio.create_task(_bg_pmu())
    return _read_pmu_scan()


@router.get("/scanner/ai-research", response_model=AIResearchResponse)
@limiter.limit("30/minute")
async def ai_research(
    request: Request,
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
