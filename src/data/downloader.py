import time
from pathlib import Path

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import settings


class DataDownloader:
    def __init__(
        self,
        delay: float = settings.REQUEST_DELAY_SECONDS,
        max_retries: int = settings.MAX_RETRIES,
    ):
        self.delay = delay
        self.max_retries = max_retries

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, max=10),
    )
    def download_csv(self, url: str, save_path: Path) -> Path:
        """Download a CSV file with retry and rate limiting."""
        time.sleep(self.delay)
        response = httpx.get(url, follow_redirects=True, timeout=30.0)
        response.raise_for_status()
        save_path.parent.mkdir(parents=True, exist_ok=True)
        save_path.write_bytes(response.content)
        return save_path
