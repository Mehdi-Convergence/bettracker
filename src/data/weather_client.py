"""OpenWeatherMap client — free tier (1000 req/day).

Fetches match-day weather by stadium city coordinates.
Rain/wind can affect goal scoring patterns (~15% fewer goals in rain).
"""

import logging
from typing import Any

import httpx

from src.cache import cache_get, cache_set
from src.config import settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.openweathermap.org/data/2.5"
GEO_BASE = "https://api.openweathermap.org/geo/1.0"

# Venue → (lat, lon) cache — built from API-Football fixture venue data
# Once geocoded, cached for 30 days (venues don't move)
GEO_CACHE_TTL = 30 * 86400
WEATHER_CACHE_TTL = 3 * 3600  # 3 hours


def _get_api_key() -> str | None:
    """Get OpenWeatherMap API key from settings."""
    return getattr(settings, "OPENWEATHER_API_KEY", "") or ""


async def geocode_city(city: str) -> tuple[float, float] | None:
    """Geocode a city name to (lat, lon). Cached 30 days."""
    if not city:
        return None

    cache_key = f"geo:city:{city.lower().strip()}"
    cached = cache_get(cache_key)
    if cached:
        return tuple(cached)

    api_key = _get_api_key()
    if not api_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{GEO_BASE}/direct",
                params={"q": city, "limit": 1, "appid": api_key},
            )
            resp.raise_for_status()
            data = resp.json()
            if data:
                lat, lon = data[0]["lat"], data[0]["lon"]
                cache_set(cache_key, [lat, lon], ttl=GEO_CACHE_TTL)
                return (lat, lon)
    except Exception as exc:
        logger.debug("Geocode failed for %s: %s", city, exc)

    return None


async def get_weather(lat: float, lon: float) -> dict[str, Any] | None:
    """Get current weather for coordinates. Returns simplified dict."""
    cache_key = f"weather:{lat:.2f}:{lon:.2f}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    api_key = _get_api_key()
    if not api_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{API_BASE}/weather",
                params={"lat": lat, "lon": lon, "appid": api_key, "units": "metric"},
            )
            resp.raise_for_status()
            data = resp.json()

            result = {
                "temp_c": data["main"]["temp"],
                "humidity": data["main"]["humidity"],
                "wind_speed_ms": data["wind"]["speed"],
                "wind_gust_ms": data["wind"].get("gust"),
                "description": data["weather"][0]["description"] if data.get("weather") else "",
                "rain_1h_mm": data.get("rain", {}).get("1h", 0),
                "snow_1h_mm": data.get("snow", {}).get("1h", 0),
                "clouds_pct": data.get("clouds", {}).get("all", 0),
                "is_rainy": "rain" in (data["weather"][0].get("main", "").lower() if data.get("weather") else ""),
                "is_windy": data["wind"]["speed"] > 8,  # >8 m/s = strong wind
            }

            cache_set(cache_key, result, ttl=WEATHER_CACHE_TTL)
            return result

    except Exception as exc:
        logger.debug("Weather fetch failed for (%s, %s): %s", lat, lon, exc)
        return None


async def get_match_weather(venue_city: str | None) -> dict[str, Any] | None:
    """High-level: get weather for a match venue city. Returns None if unavailable."""
    if not venue_city or not _get_api_key():
        return None

    coords = await geocode_city(venue_city)
    if not coords:
        return None

    return await get_weather(coords[0], coords[1])
