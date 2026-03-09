"""Shared rate limiter instance."""

from slowapi import Limiter
from slowapi.util import get_remote_address

from src.config import settings

_storage_uri = settings.REDIS_URL if settings.REDIS_URL else "memory://"
limiter = Limiter(key_func=get_remote_address, storage_uri=_storage_uri)
