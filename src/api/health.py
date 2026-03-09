from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health_check():
    from src.cache import is_redis_available
    return {
        "status": "ok",
        "service": "bettracker",
        "redis": is_redis_available(),
    }
