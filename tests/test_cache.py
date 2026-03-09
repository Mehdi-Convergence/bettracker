"""Tests for cache service (in-memory fallback)."""

from src.cache import cache_get, cache_set, cache_delete, cache_exists


def test_set_and_get():
    cache_set("test:1", {"key": "value"}, ttl=60)
    result = cache_get("test:1")
    assert result == {"key": "value"}


def test_get_missing():
    result = cache_get("test:nonexistent")
    assert result is None


def test_delete():
    cache_set("test:del", "hello", ttl=60)
    assert cache_exists("test:del")
    cache_delete("test:del")
    assert not cache_exists("test:del")


def test_exists():
    cache_set("test:exists", 42, ttl=60)
    assert cache_exists("test:exists")
    assert not cache_exists("test:nope")
