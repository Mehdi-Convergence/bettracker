"""Helpers communs pour les workers de scan.

Contient les utilitaires partages entre tous les modules de scan sport :
- Gestion du budget journalier Odds API
- Tracking des resultats de scan (Redis)
- Sauvegarde des snapshots de cotes
- Helpers d'extraction de cotes
"""

import json
import logging
import time
from datetime import datetime
from pathlib import Path

from src.cache import cache_get, cache_set

logger = logging.getLogger("scan_worker")

BUDGET_FILE = Path("data/cache/odds_api_budget.json")

# --- Intervals (seconds) ---
# Conservative defaults to stay within free/low-tier API quotas.
# API-Football free: 100 req/day — one full scan approx 150-200 requests
# Increase these when upgrading to Pro ($20/mo = 7500 req/day).
FOOTBALL_SCAN_INTERVAL = 60 * 60   # 1h (safe for free tier)
TENNIS_SCAN_INTERVAL = 60 * 150    # 2h30 (Odds API credit budget)
NBA_SCAN_INTERVAL = 60 * 150       # 2h30 (Odds API credit budget)
RUGBY_SCAN_INTERVAL = 60 * 150     # 2h30 (Odds API credit budget)
MLB_SCAN_INTERVAL = 60 * 150       # 2h30 (Odds API credit budget)
PMU_SCAN_INTERVAL = 60 * 30        # 30 minutes (programme mis a jour souvent)
SCAN_CACHE_TTL = 9000              # 2h30 (match intervals)
DATA_SCORE_MIN = 0.40


# ---------------------------------------------------------------------------
# Odds API daily budget limiter
# ---------------------------------------------------------------------------

def _load_budget_file() -> dict:
    """Load the persisted budget file for today. Returns zeroed dict if absent or stale."""
    today = datetime.now().strftime("%Y-%m-%d")
    try:
        if BUDGET_FILE.exists():
            data = json.loads(BUDGET_FILE.read_text(encoding="utf-8"))
            if data.get("date") == today:
                return data
    except Exception as exc:
        logger.debug("Could not read budget file: %s", exc)
    return {"date": today, "used": 0, "by_sport": {}}


def _save_budget_file(data: dict) -> None:
    """Persist the budget dict to disk (non-blocking)."""
    try:
        BUDGET_FILE.parent.mkdir(parents=True, exist_ok=True)
        BUDGET_FILE.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:
        logger.debug("Could not write budget file: %s", exc)


def _odds_api_budget_check(sport: str, cost: int = 1) -> bool:
    """Check if we can make an Odds API request within the daily credit budget.

    Cost = markets x regions per call.  See ODDS_API_DAILY_BUDGET in config.
    Returns True if within budget (and increments counter), False if budget exhausted.

    The counter is persisted in BUDGET_FILE so it survives worker restarts.
    """
    from src.config import settings

    budget = settings.ODDS_API_DAILY_BUDGET
    today = datetime.now().strftime("%Y-%m-%d")
    day_key = f"odds_api_daily:{today}"
    sport_key = f"{day_key}:by_sport"

    # Seed cache from file on first access (cache miss after restart)
    daily_used = cache_get(day_key)
    if daily_used is None:
        file_data = _load_budget_file()
        daily_used = file_data.get("used", 0)
        by_sport_seed = file_data.get("by_sport", {})
        cache_set(day_key, daily_used, ttl=86400)
        cache_set(sport_key, by_sport_seed, ttl=86400)
    else:
        daily_used = int(daily_used)

    if daily_used + cost > budget:
        logger.warning(
            "Odds API daily budget exhausted (%d/%d) — skipping %s scan, using cached data",
            daily_used, budget, sport,
        )
        cache_set(f"scan:stats:{sport}:last_budget_skip", time.time(), ttl=86400)
        return False

    # Increment counter
    new_used = daily_used + cost
    cache_set(day_key, new_used, ttl=86400)

    by_sport = cache_get(sport_key) or {}
    by_sport[sport] = by_sport.get(sport, 0) + cost
    cache_set(sport_key, by_sport, ttl=86400)

    # Persist to file so it survives restarts
    _save_budget_file({"date": today, "used": new_used, "by_sport": by_sport})

    return True


def _sync_odds_api_usage(client) -> None:
    """Sync Redis monthly counter with real Odds API usage from response headers.

    The Odds API 'remaining_requests' header is the MONTHLY remaining, not daily.
    We store it separately and do NOT overwrite the daily incremental counter.
    """
    remaining = getattr(client, "remaining_requests", None)
    if remaining is None:
        return
    # Total plan credits = 20000 (plan $30)
    real_used_month = 20000 - remaining
    cache_set("odds_api_month_used", real_used_month, ttl=86400 * 35)
    cache_set("odds_api_month_remaining", remaining, ttl=86400 * 35)


def _track_scan_result(sport: str, match_count: int, error: str | None = None) -> None:
    """Persist scan metrics in Redis for admin monitoring."""
    now = time.time()
    cache_set(f"scan:stats:{sport}:last_run", now, ttl=86400 * 7)
    cache_set(f"scan:stats:{sport}:last_count", match_count, ttl=86400 * 7)
    if error:
        cache_set(f"scan:stats:{sport}:last_error", error, ttl=86400 * 7)
        # Increment 24h error counter
        err_key = f"scan:stats:{sport}:errors_24h"
        err_count = int(cache_get(err_key) or 0)
        cache_set(err_key, err_count + 1, ttl=86400)
    else:
        cache_set(f"scan:stats:{sport}:last_error", None, ttl=86400 * 7)


def _extract_best_odd(market: dict, key: str) -> float | None:
    """Extract best odd for a given outcome key from a market dict.

    The market value for a key can be:
    - a dict  {bookmaker: float}  -> return the max
    - a float/int directly        -> return it
    - absent                      -> return None
    """
    val = market.get(key)
    if val is None:
        return None
    if isinstance(val, dict):
        candidates = [float(v) for v in val.values() if v]
        return max(candidates) if candidates else None
    try:
        result = float(val)
        return result if result > 1.0 else None
    except (TypeError, ValueError):
        return None


def _save_odds_snapshots(all_matches: list, sport: str) -> None:
    """Persist one OddsSnapshot row per match. Non-blocking: any error is just warned."""
    try:
        import datetime as _dt
        from src.database import SessionLocal
        from src.models.odds_snapshot import OddsSnapshot

        db = SessionLocal()
        now = _dt.datetime.now(_dt.timezone.utc)
        cutoff = now - _dt.timedelta(days=30)

        db.query(OddsSnapshot).filter(OddsSnapshot.snapshot_time < cutoff).delete()

        for match in all_matches:
            odds_data = match.odds if hasattr(match, "odds") else {}
            if not isinstance(odds_data, dict):
                odds_data = {}

            if sport in ("football", "rugby"):
                market = odds_data.get("1x2", {})
                odds_h = _extract_best_odd(market, "H")
                odds_d = _extract_best_odd(market, "D")
                odds_a = _extract_best_odd(market, "A")
            else:
                # tennis / nba: no draw
                market = odds_data.get("winner", {})
                if not market:
                    market = odds_data.get("1x2", {})
                odds_h = (
                    _extract_best_odd(market, "P1")
                    or _extract_best_odd(market, "Home")
                    or _extract_best_odd(market, "H")
                )
                odds_d = None
                odds_a = (
                    _extract_best_odd(market, "P2")
                    or _extract_best_odd(market, "Away")
                    or _extract_best_odd(market, "A")
                )

            # Resolve match date
            raw_date = match.date if hasattr(match, "date") else ""
            try:
                if raw_date:
                    match_dt = datetime.fromisoformat(raw_date.replace("Z", "+00:00")).replace(tzinfo=None)
                else:
                    match_dt = now
            except Exception:
                match_dt = now

            home = (match.home_team or "") if hasattr(match, "home_team") else ""
            away = (match.away_team or "") if hasattr(match, "away_team") else ""

            snap = OddsSnapshot(
                sport=sport,
                home_team=home,
                away_team=away,
                match_date=match_dt,
                snapshot_time=now,
                odds_home=odds_h,
                odds_draw=odds_d,
                odds_away=odds_a,
            )
            db.add(snap)

        db.commit()
        db.close()
        logger.debug("Odds snapshots saved: %d rows (%s)", len(all_matches), sport)
    except Exception as exc:
        logger.warning("Odds snapshot error (%s): %s", sport, exc)


def _is_sport_in_season(sport: str) -> bool:
    """Check if a sport is currently in season."""
    month = datetime.now().month
    if sport.lower() == "nba":
        # NBA season: October (10) to April (4)
        return month >= 10 or month <= 4
    if sport.lower() == "mlb":
        # MLB season: March (3) to October (10)
        return 3 <= month <= 10
    return True  # football, tennis, rugby, pmu — always in season
