import time
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()


@router.get("/health")
def health_check():
    from src.cache import is_redis_available
    return {
        "status": "ok",
        "service": "bettracker",
        "redis": is_redis_available(),
    }


@router.get("/health/data")
def health_data(request: Request):
    """Detailed health check: scan freshness, API quotas, model version."""
    if request.client and request.client.host not in ("127.0.0.1", "::1"):
        raise HTTPException(status_code=403, detail="Acces restreint")
    from src.cache import cache_get, is_redis_available

    now = time.time()

    # Football scan freshness
    football_last = cache_get("scan:meta:last_football")
    football_age = round((now - football_last) / 60, 1) if football_last else None

    # Tennis scan freshness
    tennis_last = cache_get("scan:meta:last_tennis")
    tennis_age = round((now - tennis_last) / 60, 1) if tennis_last else None

    # API-Football quota
    today = datetime.now().strftime("%Y-%m-%d")
    af_quota = cache_get(f"af_quota:{today}") or {}

    # Model version
    model_info = _get_model_info()

    return {
        "football_last_scan": datetime.fromtimestamp(football_last).isoformat() if football_last else None,
        "football_scan_age_minutes": football_age,
        "tennis_last_scan": datetime.fromtimestamp(tennis_last).isoformat() if tennis_last else None,
        "tennis_scan_age_minutes": tennis_age,
        "api_football_quota_remaining": af_quota.get("remaining"),
        "api_football_requests_today": af_quota.get("requests_made", 0),
        "redis_connected": is_redis_available(),
        "model_version": model_info.get("version"),
        "model_trained_at": model_info.get("trained_at"),
    }


def _get_model_info() -> dict:
    """Read model metadata if available."""
    meta_path = Path("models/football/metadata.json")
    if meta_path.exists():
        import json
        try:
            return json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            pass

    # Fallback: check if model exists
    model_path = Path("models/football/model.joblib")
    if model_path.exists():
        return {"version": "v6", "trained_at": None}
    return {"version": None}


@router.get("/health/deep")
def health_deep(request: Request):
    """Deep health check for deploy validation.

    Verifies DB connectivity, critical tables, ML models, and frontend build.
    Returns 503 if any check fails so the deploy pipeline can rollback.
    """
    if request.client and request.client.host not in ("127.0.0.1", "::1"):
        raise HTTPException(status_code=403, detail="Acces restreint")
    errors = []

    # DB check
    try:
        from src.database import SessionLocal
        from sqlalchemy import text

        db = SessionLocal()
        tables = [
            r[0]
            for r in db.execute(
                text("SELECT name FROM sqlite_master WHERE type='table'")
            ).fetchall()
        ]
        db.close()
        if len(tables) < 5:
            errors.append(f"Only {len(tables)} tables found (expected >= 5)")
        required_tables = ["users", "campaigns", "bets"]
        for t in required_tables:
            if t not in tables:
                errors.append(f"Missing critical table: {t}")
    except Exception as e:
        errors.append(f"DB connection error: {e}")

    # ML model check
    football_model = Path("models/football/model.joblib")
    if not football_model.exists():
        errors.append("Football model missing (models/football/model.joblib)")

    # Frontend build check
    frontend_dist = Path("frontend/dist/index.html")
    if not frontend_dist.exists():
        errors.append("Frontend build missing (frontend/dist/index.html)")

    from starlette.responses import JSONResponse

    status = "ok" if not errors else "degraded"
    code = 200 if not errors else 503
    return JSONResponse(
        status_code=code,
        content={
            "status": status,
            "errors": errors,
            "tables_count": len(tables) if 'tables' in locals() else 0,
        },
    )


@router.get("/scanner/model-info")
def model_info():
    """Return ML model version and metadata."""
    info = _get_model_info()
    return {
        "version": info.get("version", "v6"),
        "trained_at": info.get("trained_at"),
        "features_count": info.get("features_count", 67),
        "blend": "45% ML + 55% Poisson",
        "models": ["XGBoost", "LightGBM"],
    }
