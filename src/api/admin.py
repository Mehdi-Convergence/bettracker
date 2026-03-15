"""Admin monitoring endpoints — protected by require_admin dependency."""

import logging
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
from src.models.campaign import Campaign
from src.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

# Sports supported by the scanner worker
SPORTS = ["football", "tennis", "nba", "rugby", "mlb", "pmu"]

# Expected scan intervals per sport (seconds) — used for stale-cache detection
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
    """Convert a Unix timestamp to ISO 8601 string."""
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
    except Exception:
        return None


def _age_seconds(ts: float | None) -> float | None:
    """Return age in seconds from a Unix timestamp."""
    if ts is None:
        return None
    try:
        return time.time() - float(ts)
    except Exception:
        return None


def _get_scan_stats(sport: str) -> dict:
    """Read all Redis scan keys for a given sport."""
    last_run_raw = cache_get(f"scan:stats:{sport}:last_run")
    last_count = cache_get(f"scan:stats:{sport}:last_count")
    last_error = cache_get(f"scan:stats:{sport}:last_error")
    errors_24h = cache_get(f"scan:stats:{sport}:errors_24h")
    last_budget_skip = cache_get(f"scan:stats:{sport}:last_budget_skip")
    last_meta = cache_get(f"scan:meta:last_{sport}")

    last_run_ts: float | None = None
    if last_run_raw is not None:
        try:
            last_run_ts = float(last_run_raw)
        except (TypeError, ValueError):
            pass

    return {
        "sport": sport,
        "last_run": _ts_to_iso(last_run_ts),
        "last_run_age_seconds": _age_seconds(last_run_ts),
        "last_count": last_count,
        "last_error": last_error,
        "errors_24h": errors_24h or 0,
        "last_budget_skip": _ts_to_iso(
            float(last_budget_skip) if last_budget_skip is not None else None
        ),
        "cache_fresh": last_meta is not None,
    }


# ---------------------------------------------------------------------------
# 1. GET /admin/system — System overview
# ---------------------------------------------------------------------------


@router.get("/system")
def get_system_overview(
    _user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """System-level health: Redis, DB stats, uptime."""
    redis_ok = is_redis_available()

    # DB stats — count rows in key tables
    try:
        total_users = db.query(func.count(User.id)).scalar() or 0
        total_bets = db.query(func.count(Bet.id)).scalar() or 0
        total_campaigns = db.query(func.count(Campaign.id)).scalar() or 0
        active_campaigns = (
            db.query(func.count(Campaign.id))
            .filter(Campaign.status == "active")
            .scalar()
            or 0
        )
        pending_bets = (
            db.query(func.count(Bet.id))
            .filter(Bet.result == "pending", Bet.is_backtest == False)  # noqa: E712
            .scalar()
            or 0
        )
        db_ok = True
        db_error = None
    except Exception as exc:
        total_users = total_bets = total_campaigns = active_campaigns = pending_bets = 0
        db_ok = False
        db_error = str(exc)

    # Count DB tables via SQLAlchemy inspector
    try:
        from sqlalchemy import inspect as sa_inspect

        inspector = sa_inspect(db.bind)
        table_count = len(inspector.get_table_names())
    except Exception:
        table_count = None

    return {
        "redis": {
            "available": redis_ok,
            "url_configured": bool(settings.REDIS_URL),
        },
        "database": {
            "ok": db_ok,
            "error": db_error,
            "table_count": table_count,
            "total_users": total_users,
            "total_bets": total_bets,
            "total_campaigns": total_campaigns,
            "active_campaigns": active_campaigns,
            "pending_bets": pending_bets,
        },
        "config": {
            "odds_api_daily_budget": settings.ODDS_API_DAILY_BUDGET,
            "min_edge_threshold": settings.MIN_EDGE_THRESHOLD,
            "kelly_fraction": settings.KELLY_FRACTION,
        },
        "timestamp": _now_utc().isoformat(),
    }


# ---------------------------------------------------------------------------
# 2. GET /admin/scans — Scan status per sport
# ---------------------------------------------------------------------------


@router.get("/scans")
def get_scan_status(
    _user: User = Depends(require_admin),
):
    """Scan status for all sports — reads Redis scan:stats:* keys."""
    results = []
    for sport in SPORTS:
        stats = _get_scan_stats(sport)
        stats["expected_interval_seconds"] = SCAN_INTERVALS.get(sport, 3600)
        results.append(stats)

    return {
        "sports": results,
        "timestamp": _now_utc().isoformat(),
    }


# ---------------------------------------------------------------------------
# 3. GET /admin/quota — Odds API quota tracking
# ---------------------------------------------------------------------------


@router.get("/quota")
def get_quota_status(
    _user: User = Depends(require_admin),
):
    """Odds API request quota: today's usage + 7-day history."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    daily_budget = settings.ODDS_API_DAILY_BUDGET

    used_today = cache_get(f"odds_api_daily:{today}") or 0
    by_sport_raw = cache_get(f"odds_api_daily:{today}:by_sport") or {}

    pct_used = round(used_today / daily_budget * 100, 1) if daily_budget > 0 else 0.0

    # Last 7 days history
    history = []
    for offset in range(7):
        day = (datetime.now(timezone.utc) - timedelta(days=offset)).strftime("%Y-%m-%d")
        count = cache_get(f"odds_api_daily:{day}") or 0
        history.append({"date": day, "requests": count})

    return {
        "daily_budget": daily_budget,
        "used_today": used_today,
        "remaining_today": max(0, daily_budget - used_today),
        "percent_used": pct_used,
        "by_sport": by_sport_raw,
        "history_7d": history,
        "timestamp": _now_utc().isoformat(),
    }


# ---------------------------------------------------------------------------
# 4. GET /admin/analytics/sports — Betting analytics per sport
# ---------------------------------------------------------------------------


@router.get("/analytics/sports")
def get_sports_analytics(
    _user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Betting stats per sport: bet counts, average ROI, average CLV, active users."""
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

            total_bets = base_q.count()
            bets_7d = base_q.filter(Bet.created_at >= cutoff_7d).count()
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

            # Active users for this sport (at least 1 bet in last 30d)
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

            # Match count from latest scan cache
            scan_stats = _get_scan_stats(sport)
            latest_match_count = scan_stats.get("last_count")

        except Exception as exc:
            logger.warning("analytics error for sport %s: %s", sport, exc)
            total_bets = bets_7d = bets_30d = 0
            avg_roi = avg_clv = None
            active_users = 0
            latest_match_count = None

        analytics.append(
            {
                "sport": sport,
                "bets_total": total_bets,
                "bets_7d": bets_7d,
                "bets_30d": bets_30d,
                "avg_roi_pct": avg_roi,
                "avg_clv": avg_clv,
                "active_users_30d": active_users,
                "latest_scan_match_count": latest_match_count,
            }
        )

    return {
        "sports": analytics,
        "timestamp": _now_utc().isoformat(),
    }


# ---------------------------------------------------------------------------
# 5. GET /admin/alerts — Active alerts
# ---------------------------------------------------------------------------


@router.get("/alerts")
def get_alerts(
    _user: User = Depends(require_admin),
):
    """Check system conditions and return active alerts (WARNING / CRITICAL)."""
    alerts = []
    now_ts = time.time()

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    daily_budget = settings.ODDS_API_DAILY_BUDGET
    used_today = cache_get(f"odds_api_daily:{today}") or 0

    # Quota alerts
    if daily_budget > 0:
        pct = used_today / daily_budget
        if pct >= 1.0:
            alerts.append(
                {
                    "level": "CRITICAL",
                    "sport": None,
                    "category": "quota",
                    "message": f"Quota Odds API epuise ({used_today}/{daily_budget} requetes)",
                }
            )
        elif pct >= 0.8:
            alerts.append(
                {
                    "level": "WARNING",
                    "sport": None,
                    "category": "quota",
                    "message": f"Quota Odds API a {round(pct * 100)}% ({used_today}/{daily_budget})",
                }
            )

    # Per-sport alerts
    for sport in SPORTS:
        stats = _get_scan_stats(sport)
        interval = SCAN_INTERVALS.get(sport, 3600)
        age = stats.get("last_run_age_seconds")
        errors_24h = stats.get("errors_24h", 0) or 0
        last_count = stats.get("last_count")

        # No scan data at all
        if age is None:
            alerts.append(
                {
                    "level": "WARNING",
                    "sport": sport,
                    "category": "scan_missing",
                    "message": f"Aucun scan enregistre pour {sport}",
                }
            )
            continue

        # No scan for more than 2 hours
        if age > 7200:
            alerts.append(
                {
                    "level": "CRITICAL",
                    "sport": sport,
                    "category": "scan_stale",
                    "message": (
                        f"Dernier scan {sport} il y a {round(age / 3600, 1)}h"
                        f" (seuil: 2h)"
                    ),
                }
            )
        # Cache older than 2x scan interval
        elif age > interval * 2:
            alerts.append(
                {
                    "level": "WARNING",
                    "sport": sport,
                    "category": "scan_stale",
                    "message": (
                        f"Cache {sport} ancien ({round(age / 60)}min)"
                        f" — intervalle attendu {interval // 60}min"
                    ),
                }
            )

        # 0 matches when a scan ran recently
        if last_count == 0 and age is not None and age < interval * 2:
            alerts.append(
                {
                    "level": "CRITICAL",
                    "sport": sport,
                    "category": "no_matches",
                    "message": f"Scan {sport} a retourne 0 match",
                }
            )

        # Error spike
        if errors_24h >= 3:
            alerts.append(
                {
                    "level": "WARNING",
                    "sport": sport,
                    "category": "errors",
                    "message": f"{errors_24h} erreurs en 24h pour {sport}",
                }
            )

    return {
        "alerts": alerts,
        "alert_count": len(alerts),
        "critical_count": sum(1 for a in alerts if a["level"] == "CRITICAL"),
        "warning_count": sum(1 for a in alerts if a["level"] == "WARNING"),
        "timestamp": _now_utc().isoformat(),
    }


# ---------------------------------------------------------------------------
# 6. POST /admin/scan/{sport}/force — Force scan
# ---------------------------------------------------------------------------


def _trigger_scan(sport: str) -> None:
    """Background task: invalidate cache so the worker re-scans on next cycle."""
    try:
        # Delete cached scan result to force worker to re-run
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
    """Force an immediate scan for a specific sport by invalidating its cache."""
    if sport not in SPORTS:
        raise HTTPException(
            status_code=400,
            detail=f"Sport inconnu: {sport}. Sports valides: {', '.join(SPORTS)}",
        )

    background_tasks.add_task(_trigger_scan, sport)

    return {
        "ok": True,
        "sport": sport,
        "message": f"Cache {sport} invalide — le worker relancera le scan au prochain cycle",
        "timestamp": _now_utc().isoformat(),
    }
