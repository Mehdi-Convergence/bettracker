"""Background scan worker — pre-computes football & tennis scans on schedule.

Runs as a standalone process:
    python -m src.workers.scan_worker

Stores results in Redis (+ file backup). The API reads from cache only.

Architecture:
    scan_common.py   — helpers partages (budget, tracking, snapshots)
    scan_football.py — run_football_scan()
    scan_tennis.py   — run_tennis_scan()
    scan_nba.py      — run_nba_scan()
    scan_rugby.py    — run_rugby_scan()
    scan_mlb.py      — run_mlb_scan()
    scan_pmu.py      — run_pmu_scan()
    scan_worker.py   — main() + boucles de scheduling
"""

import asyncio
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s %(message)s")
logger = logging.getLogger("scan_worker")

from src.workers.scan_common import (
    FOOTBALL_SCAN_INTERVAL,
    TENNIS_SCAN_INTERVAL,
    NBA_SCAN_INTERVAL,
    RUGBY_SCAN_INTERVAL,
    MLB_SCAN_INTERVAL,
    PMU_SCAN_INTERVAL,
    _is_sport_in_season,
)
from src.workers.scan_football import run_football_scan
from src.workers.scan_tennis import run_tennis_scan
from src.workers.scan_nba import run_nba_scan
from src.workers.scan_rugby import run_rugby_scan
from src.workers.scan_mlb import run_mlb_scan
from src.workers.scan_pmu import run_pmu_scan


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

async def main():
    logger.info("Scan worker starting...")

    # Initial scan on startup (each wrapped to avoid crashing the whole worker)
    for scan_name, scan_fn in [
        ("football", run_football_scan),
        ("tennis", run_tennis_scan),
        ("NBA", run_nba_scan),
        ("rugby", run_rugby_scan),
        ("MLB", run_mlb_scan),
        ("PMU", run_pmu_scan),
    ]:
        if not _is_sport_in_season(scan_name):
            logger.info("Skipping %s — off-season", scan_name)
            continue
        logger.info("Running initial %s scan...", scan_name)
        try:
            await scan_fn()
        except Exception as exc:
            logger.error("Initial %s scan failed: %s", scan_name, exc)

    # Schedule recurring scans
    async def _football_loop():
        while True:
            await asyncio.sleep(FOOTBALL_SCAN_INTERVAL)
            try:
                await run_football_scan()
            except Exception as exc:
                logger.error("Football scan error: %s", exc)

    async def _tennis_loop():
        while True:
            await asyncio.sleep(TENNIS_SCAN_INTERVAL)
            try:
                await run_tennis_scan()
            except Exception as exc:
                logger.error("Tennis scan error: %s", exc)

    async def _nba_loop():
        while True:
            await asyncio.sleep(NBA_SCAN_INTERVAL)
            if not _is_sport_in_season("nba"):
                logger.debug("NBA off-season — skipping scan")
                continue
            try:
                await run_nba_scan()
            except Exception as exc:
                logger.error("NBA scan error: %s", exc)

    async def _rugby_loop():
        while True:
            await asyncio.sleep(RUGBY_SCAN_INTERVAL)
            try:
                await run_rugby_scan()
            except Exception as exc:
                logger.error("Rugby scan error: %s", exc)

    async def _mlb_loop():
        while True:
            await asyncio.sleep(MLB_SCAN_INTERVAL)
            if not _is_sport_in_season("mlb"):
                logger.debug("MLB off-season — skipping scan")
                continue
            try:
                await run_mlb_scan()
            except Exception as exc:
                logger.error("MLB scan error: %s", exc)

    async def _pmu_loop():
        while True:
            await asyncio.sleep(PMU_SCAN_INTERVAL)
            try:
                await run_pmu_scan()
            except Exception as exc:
                logger.error("PMU scan error: %s", exc)

    logger.info("Worker running — football every %ds, tennis/nba/rugby/mlb every %ds, pmu every %ds",
                 FOOTBALL_SCAN_INTERVAL, TENNIS_SCAN_INTERVAL, PMU_SCAN_INTERVAL)
    await asyncio.gather(_football_loop(), _tennis_loop(), _nba_loop(), _rugby_loop(), _mlb_loop(), _pmu_loop())


if __name__ == "__main__":
    asyncio.run(main())
