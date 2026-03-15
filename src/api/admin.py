"""Admin monitoring endpoints — protected by require_admin dependency."""

import logging
import os
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.api.deps import require_admin
from src.cache import cache_get, is_redis_available
from src.config import settings
from src.database import get_db
from src.models.bet import Bet
from src.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

SPORTS = ["football", "tennis", "nba", "rugby", "mlb", "pmu"]

SCAN_INTERVALS: dict[str, int] = {
    "football": 3600,
    "tennis": 3600,
    "nba": 3600,
    "rugby": 3600,
    "mlb": 3600,
    "pmu": 1800,
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _ts_to_iso(ts: float | None) -> str | None:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
    except Exception:
        return None


def _age_seconds(ts: float | None) -> float | None:
    if ts is None:
        return None
    try:
        return time.time() - float(ts)
    except Exception:
        return None


def _get_scan_stats(sport: str) -> dict:
    last_run_raw = cache_get(f"scan:stats:{sport}:last_run")
    last_count = cache_get(f"scan:stats:{sport}:last_count")
    errors_24h = cache_get(f"scan:stats:{sport}:errors_24h")

    last_run_ts: float | None = None
    if last_run_raw is not None:
        try:
            last_run_ts = float(last_run_raw)
        except (TypeError, ValueError):
            pass

    return {
        "sport": sport,
        "last_run_ts": last_run_ts,
        "last_run_iso": _ts_to_iso(last_run_ts),
        "last_run_age_seconds": _age_seconds(last_run_ts),
        "last_count": last_count,
        "errors_24h": errors_24h or 0,
    }


def _scan_status(age: float | None, interval: int) -> str:
    if age is None:
        return "error"
    if age < interval * 1.5:
        return "ok"
    if age < interval * 2:
        return "warning"
    return "error"


# ---------------------------------------------------------------------------
# 1. GET /admin/system — System overview
# ---------------------------------------------------------------------------


@router.get("/system")
def get_system_overview(
    _user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    redis_ok = is_redis_available()

    # Redis latency
    redis_latency_ms: float | None = None
    if redis_ok:
        try:
            from src.cache import _get_redis
            r = _get_redis()
            if r:
                t0 = time.time()
                r.ping()
                redis_latency_ms = round((time.time() - t0) * 1000, 1)
        except Exception:
            pass

    # DB ok + size
    db_ok = False
    db_size_mb: float | None = None
    try:
        db.query(func.count(User.id)).scalar()
        db_ok = True
        db_url = settings.DATABASE_URL
        if db_url.startswith("sqlite:///"):
            db_path = db_url.replace("sqlite:///", "")
            if not os.path.isabs(db_path):
                db_path = os.path.join(os.getcwd(), db_path)
            if os.path.exists(db_path):
                db_size_mb = round(os.path.getsize(db_path) / (1024 * 1024), 2)
    except Exception as exc:
        logger.warning("db check failed: %s", exc)

    # Worker: consider active if any sport scanned in the last 2 hours
    worker_ok = False
    last_heartbeat: str | None = None
    latest_ts: float | None = None
    for sport in SPORTS:
        raw = cache_get(f"scan:stats:{sport}:last_run")
        if raw is not None:
            try:
                ts = float(raw)
                if latest_ts is None or ts > latest_ts:
                    latest_ts = ts
            except (TypeError, ValueError):
                pass
    if latest_ts is not None:
        age = time.time() - latest_ts
        worker_ok = age < 7200
        last_heartbeat = _ts_to_iso(latest_ts)

    return {
        "redis": {"ok": redis_ok, "latency_ms": redis_latency_ms},
        "db": {"ok": db_ok, "size_mb": db_size_mb},
        "worker": {"ok": worker_ok, "last_heartbeat": last_heartbeat},
        "last_deploy": _ts_to_iso(cache_get("deploy:last_timestamp")),
        "uptime_seconds": None,
    }


# ---------------------------------------------------------------------------
# 2. GET /admin/scans — Scan status per sport
# ---------------------------------------------------------------------------


@router.get("/scans")
def get_scan_status(
    _user: User = Depends(require_admin),
):
    results = []
    for sport in SPORTS:
        stats = _get_scan_stats(sport)
        age = stats["last_run_age_seconds"]
        interval = SCAN_INTERVALS.get(sport, 3600)
        cache_age_minutes = round(age / 60, 1) if age is not None else None
        results.append(
            {
                "sport": sport,
                "last_scan": stats["last_run_iso"],
                "cache_age_minutes": cache_age_minutes,
                "match_count": stats["last_count"],
                "errors_24h": stats["errors_24h"] or 0,
                "status": _scan_status(age, interval),
            }
        )
    return results


# ---------------------------------------------------------------------------
# 3. GET /admin/quota — Odds API quota tracking
# ---------------------------------------------------------------------------


@router.get("/quota")
def get_quota_status(
    _user: User = Depends(require_admin),
):
    today = _now_utc().strftime("%Y-%m-%d")
    daily_budget = settings.ODDS_API_DAILY_BUDGET

    used_today = int(cache_get(f"odds_api_daily:{today}") or 0)
    by_sport_raw: dict = cache_get(f"odds_api_daily:{today}:by_sport") or {}

    # Sum of last 30 days for monthly usage
    used_month = 0
    for offset in range(30):
        day = (_now_utc() - timedelta(days=offset)).strftime("%Y-%m-%d")
        used_month += int(cache_get(f"odds_api_daily:{day}") or 0)

    by_sport = [{"sport": k, "calls": int(v)} for k, v in by_sport_raw.items()]

    return {
        "used_today": used_today,
        "limit_daily": daily_budget,
        "used_month": used_month,
        "limit_month": 20000,
        "by_sport": by_sport,
    }


# ---------------------------------------------------------------------------
# 4. GET /admin/analytics/sports — Betting analytics per sport
# ---------------------------------------------------------------------------


@router.get("/analytics/sports")
def get_sports_analytics(
    _user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    now = _now_utc()
    cutoff_7d = now - timedelta(days=7)
    cutoff_30d = now - timedelta(days=30)

    analytics = []
    for sport in SPORTS:
        try:
            base_q = db.query(Bet).filter(
                Bet.sport == sport,
                Bet.is_backtest == False,  # noqa: E712
            )

            bets_7d = (
                db.query(Bet)
                .filter(
                    Bet.sport == sport,
                    Bet.is_backtest == False,  # noqa: E712
                    Bet.created_at >= cutoff_7d,
                )
                .count()
            )
            bets_30d = (
                db.query(Bet)
                .filter(
                    Bet.sport == sport,
                    Bet.is_backtest == False,  # noqa: E712
                    Bet.created_at >= cutoff_30d,
                )
                .count()
            )

            settled = base_q.filter(Bet.result.in_(["won", "lost"])).all()
            staked = sum(b.stake for b in settled) if settled else 0.0
            pnl = sum(b.profit_loss or 0.0 for b in settled) if settled else 0.0
            avg_roi = round(pnl / staked * 100, 2) if staked > 0 else None

            clv_values = [b.clv for b in settled if b.clv is not None]
            avg_clv = round(sum(clv_values) / len(clv_values), 4) if clv_values else None

            active_users = (
                db.query(func.count(func.distinct(Bet.user_id)))
                .filter(
                    Bet.sport == sport,
                    Bet.is_backtest == False,  # noqa: E712
                    Bet.created_at >= cutoff_30d,
                )
                .scalar()
                or 0
            )

        except Exception as exc:
            logger.warning("analytics error for sport %s: %s", sport, exc)
            bets_7d = bets_30d = 0
            avg_roi = avg_clv = None
            active_users = 0

        analytics.append(
            {
                "sport": sport,
                "bets_7d": bets_7d,
                "bets_30d": bets_30d,
                "roi_pct": avg_roi,
                "avg_clv": avg_clv,
                "active_users": active_users,
            }
        )

    return analytics


# ---------------------------------------------------------------------------
# 5. GET /admin/alerts — Active alerts
# ---------------------------------------------------------------------------


@router.get("/alerts")
def get_alerts(
    _user: User = Depends(require_admin),
):
    alerts = []
    now_iso = _now_utc().isoformat()

    today = _now_utc().strftime("%Y-%m-%d")
    daily_budget = settings.ODDS_API_DAILY_BUDGET
    used_today = int(cache_get(f"odds_api_daily:{today}") or 0)

    if daily_budget > 0:
        pct = used_today / daily_budget
        if pct >= 1.0:
            alerts.append(
                {
                    "id": "quota_global",
                    "severity": "CRITICAL",
                    "message": f"Quota Odds API epuise ({used_today}/{daily_budget} requetes)",
                    "sport": None,
                    "timestamp": now_iso,
                }
            )
        elif pct >= 0.8:
            alerts.append(
                {
                    "id": "quota_global",
                    "severity": "WARNING",
                    "message": f"Quota Odds API a {round(pct * 100)}% ({used_today}/{daily_budget})",
                    "sport": None,
                    "timestamp": now_iso,
                }
            )

    for sport in SPORTS:
        stats = _get_scan_stats(sport)
        interval = SCAN_INTERVALS.get(sport, 3600)
        age = stats.get("last_run_age_seconds")
        errors_24h = stats.get("errors_24h", 0) or 0
        last_count = stats.get("last_count")

        if age is None:
            alerts.append(
                {
                    "id": f"scan_missing_{sport}",
                    "severity": "WARNING",
                    "message": f"Aucun scan enregistre pour {sport}",
                    "sport": sport,
                    "timestamp": now_iso,
                }
            )
            continue

        if age > 7200:
            alerts.append(
                {
                    "id": f"scan_stale_{sport}",
                    "severity": "CRITICAL",
                    "message": f"Dernier scan {sport} il y a {round(age / 3600, 1)}h (seuil: 2h)",
                    "sport": sport,
                    "timestamp": now_iso,
                }
            )
        elif age > interval * 2:
            alerts.append(
                {
                    "id": f"scan_stale_{sport}",
                    "severity": "WARNING",
                    "message": f"Cache {sport} ancien ({round(age / 60)}min) — intervalle attendu {interval // 60}min",
                    "sport": sport,
                    "timestamp": now_iso,
                }
            )

        if last_count == 0 and age is not None and age < interval * 2:
            alerts.append(
                {
                    "id": f"no_matches_{sport}",
                    "severity": "CRITICAL",
                    "message": f"Scan {sport} a retourne 0 match",
                    "sport": sport,
                    "timestamp": now_iso,
                }
            )

        if errors_24h >= 3:
            alerts.append(
                {
                    "id": f"errors_{sport}",
                    "severity": "WARNING",
                    "message": f"{errors_24h} erreurs en 24h pour {sport}",
                    "sport": sport,
                    "timestamp": now_iso,
                }
            )

    return alerts


# ---------------------------------------------------------------------------
# 6. GET /admin/errors — Recent errors log
# ---------------------------------------------------------------------------


@router.get("/errors")
def get_errors(
    _user: User = Depends(require_admin),
):
    return []


# ---------------------------------------------------------------------------
# 7. POST /admin/scan/{sport}/force — Force scan
# ---------------------------------------------------------------------------


def _trigger_scan(sport: str) -> None:
    try:
        from src.cache import cache_delete

        cache_delete(f"scan:meta:last_{sport}")
        cache_delete(f"scan:{sport}")
        logger.info("admin force scan: invalidated cache for sport=%s", sport)
    except Exception as exc:
        logger.error("admin force scan error for sport=%s: %s", sport, exc)


@router.post("/scan/{sport}/force")
def force_scan(
    sport: str,
    background_tasks: BackgroundTasks,
    _user: User = Depends(require_admin),
):
    if sport not in SPORTS:
        raise HTTPException(
            status_code=400,
            detail=f"Sport inconnu: {sport}. Sports valides: {', '.join(SPORTS)}",
        )

    background_tasks.add_task(_trigger_scan, sport)

    return {
        "ok": True,
        "message": f"Cache {sport} invalide — le worker relancera le scan au prochain cycle",
    }
