"""Cache service: Redis when available, in-memory fallback."""

import json
import time
from typing import Any

from src.config import settings

_redis_client = None
_redis_available = False
_memory_cache: dict[str, tuple[float, str]] = {}  # key -> (expires_at, json_value)


def _get_redis():
    """Lazy-init Redis connection."""
    global _redis_client, _redis_available
    if _redis_client is not None:
        return _redis_client
    if not settings.REDIS_URL:
        _redis_available = False
        return None
    try:
        import redis
        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        _redis_client.ping()
        _redis_available = True
        return _redis_client
    except Exception:
        _redis_available = False
        _redis_client = None
        return None


def cache_get(key: str) -> Any | None:
    """Get a value from cache. Returns None if not found or expired."""
    r = _get_redis()
    if r:
        try:
            val = r.get(key)
            return json.loads(val) if val else None
        except Exception:
            pass

    # Fallback: in-memory
    entry = _memory_cache.get(key)
    if entry is None:
        return None
    expires_at, raw = entry
    if time.time() > expires_at:
        del _memory_cache[key]
        return None
    return json.loads(raw)


def cache_set(key: str, value: Any, ttl: int = 1800) -> None:
    """Set a value in cache with TTL in seconds (default 30 min)."""
    raw = json.dumps(value, ensure_ascii=False, default=str)
    r = _get_redis()
    if r:
        try:
            r.setex(key, ttl, raw)
            return
        except Exception:
            pass

    # Fallback: in-memory
    _memory_cache[key] = (time.time() + ttl, raw)


def cache_incr(key: str, ttl: int = 900) -> int:
    """Increment a counter in cache. Creates the key at 1 if absent. Returns the new value."""
    r = _get_redis()
    if r:
        try:
            new_val = r.incr(key)
            if new_val == 1:
                r.expire(key, ttl)
            return new_val
        except Exception:
            pass

    # Fallback: in-memory
    entry = _memory_cache.get(key)
    now = time.time()
    if entry is None or now > entry[0]:
        _memory_cache[key] = (now + ttl, json.dumps(1))
        return 1
    current = json.loads(entry[1])
    new_val = current + 1
    _memory_cache[key] = (entry[0], json.dumps(new_val))
    return new_val


def cache_delete(key: str) -> None:
    """Delete a key from cache."""
    r = _get_redis()
    if r:
        try:
            r.delete(key)
        except Exception:
            pass
    _memory_cache.pop(key, None)


def cache_exists(key: str) -> bool:
    """Check if a key exists in cache."""
    r = _get_redis()
    if r:
        try:
            return bool(r.exists(key))
        except Exception:
            pass
    entry = _memory_cache.get(key)
    if entry is None:
        return False
    if time.time() > entry[0]:
        del _memory_cache[key]
        return False
    return True


def is_redis_available() -> bool:
    """Check if Redis is connected."""
    _get_redis()
    return _redis_available
