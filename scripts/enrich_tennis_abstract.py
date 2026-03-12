"""Enrich tennis_matches DB with service stats from Tennis Abstract (Jeff Sackmann).

Source: https://github.com/JeffSackmann/tennis_atp
Data: atp_matches_YYYY.csv files (aces, double faults, serve %, break points)

Matching strategy:
  1. Normalize player names to "surname" (last word before comma or last word of full name)
  2. Match by (year, surface, round, winner_surname, loser_surname)
  3. Fallback: (year, tournament_name, winner_surname, loser_surname)

Usage:
  uv run python scripts/enrich_tennis_abstract.py
"""

import io
import logging
import re
import sys
import unicodedata
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.database import SessionLocal
from src.models.tennis_match import TennisMatch

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ATP CSV files from GitHub raw content
ABSTRACT_BASE = "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master"
YEARS = list(range(2019, 2026))


def _download_csv(year: int) -> list[dict]:
    """Download and parse atp_matches_YYYY.csv."""
    url = f"{ABSTRACT_BASE}/atp_matches_{year}.csv"
    logger.info("Downloading %s...", url)
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        logger.warning("Failed to download %d: %s", year, e)
        return []

    import csv
    rows = []
    reader = csv.DictReader(io.StringIO(resp.text))
    for row in reader:
        rows.append(row)
    logger.info("  %d matches loaded for %d", len(rows), year)
    return rows


def _normalize_name(name: str) -> str:
    """Normalize player name to lowercase surname only for fuzzy matching.

    Tennis Abstract: "Novak Djokovic" -> "djokovic"
    Tennis Data: "Djokovic N." -> "djokovic"
    """
    if not name:
        return ""
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = name.lower().strip()
    # "Djokovic N." format — take first word
    if re.search(r'\s[a-z]\.$', name):
        return name.split()[0]
    # "Novak Djokovic" format — take last word
    parts = name.split()
    return parts[-1] if parts else name


def _int_or_none(val: str) -> int | None:
    try:
        return int(float(val)) if val and val.strip() else None
    except (ValueError, TypeError):
        return None


def _surface_map(surface: str) -> str:
    """Map Tennis Abstract surface names to our format."""
    mapping = {"Hard": "Hard", "Clay": "Clay", "Grass": "Grass", "Carpet": "Carpet"}
    return mapping.get(surface, surface)


def _round_match(r1: str, r2: str) -> bool:
    """Check if two round strings are equivalent."""
    def norm(r: str) -> str:
        r = r.upper().strip()
        replacements = {
            "R128": "R128", "R64": "R64", "R32": "R32", "R16": "R16",
            "QF": "QF", "SF": "SF", "F": "F", "RR": "RR",
            "1ST ROUND": "R64", "2ND ROUND": "R32", "3RD ROUND": "R16",
            "QUARTERFINALS": "QF", "SEMIFINALS": "SF", "FINAL": "F",
        }
        for k, v in replacements.items():
            if k in r:
                return v
        return r
    return norm(r1) == norm(r2)


def build_index(abstract_rows: list[dict]) -> dict:
    """Build lookup index: (winner_surname, loser_surname, round, surface) -> row."""
    idx: dict = {}
    for row in abstract_rows:
        wn = _normalize_name(row.get("winner_name", ""))
        ln = _normalize_name(row.get("loser_name", ""))
        surface = _surface_map(row.get("surface", ""))
        rnd = row.get("round", "").upper().strip()
        key = (wn, ln, rnd, surface)
        idx[key] = row
        # Also index with just names (no surface/round) as fallback
        idx2 = (wn, ln)
        if idx2 not in idx:
            idx[idx2] = row
    return idx


def match_row(db_match: TennisMatch, abstract_idx: dict) -> dict | None:
    """Find matching abstract row for a DB match."""
    wn = _normalize_name(db_match.winner)
    ln = _normalize_name(db_match.loser)
    surface = db_match.surface or ""
    rnd = (db_match.round or "").upper().strip()

    # Try exact (name, round, surface)
    for r in [rnd, ""]:
        for s in [surface, ""]:
            key = (wn, ln, r, s)
            if key in abstract_idx:
                return abstract_idx[key]

    # Fallback: just names
    key2 = (wn, ln)
    if key2 in abstract_idx:
        return abstract_idx[key2]

    return None


def enrich_year(db: object, year: int, abstract_rows: list[dict]) -> tuple[int, int]:
    """Enrich DB matches for a given year. Returns (enriched, not_found)."""
    abstract_idx = build_index(abstract_rows)

    matches = db.query(TennisMatch).filter(
        TennisMatch.year == year,
        TennisMatch.w_ace.is_(None),  # Only update rows without service stats
    ).all()

    enriched = 0
    not_found = 0

    for m in matches:
        row = match_row(m, abstract_idx)
        if not row:
            not_found += 1
            continue

        # Apply service stats
        m.w_ace = _int_or_none(row.get("w_ace"))
        m.w_df = _int_or_none(row.get("w_df"))
        m.w_svpt = _int_or_none(row.get("w_svpt"))
        m.w_1stIn = _int_or_none(row.get("w_1stIn"))
        m.w_1stWon = _int_or_none(row.get("w_1stWon"))
        m.w_2ndWon = _int_or_none(row.get("w_2ndWon"))
        m.w_SvGms = _int_or_none(row.get("w_SvGms"))
        m.w_bpSaved = _int_or_none(row.get("w_bpSaved"))
        m.w_bpFaced = _int_or_none(row.get("w_bpFaced"))
        m.l_ace = _int_or_none(row.get("l_ace"))
        m.l_df = _int_or_none(row.get("l_df"))
        m.l_svpt = _int_or_none(row.get("l_svpt"))
        m.l_1stIn = _int_or_none(row.get("l_1stIn"))
        m.l_1stWon = _int_or_none(row.get("l_1stWon"))
        m.l_2ndWon = _int_or_none(row.get("l_2ndWon"))
        m.l_SvGms = _int_or_none(row.get("l_SvGms"))
        m.l_bpSaved = _int_or_none(row.get("l_bpSaved"))
        m.l_bpFaced = _int_or_none(row.get("l_bpFaced"))
        m.minutes = _int_or_none(row.get("minutes"))
        m.abstract_winner_id = _int_or_none(row.get("winner_id"))
        m.abstract_loser_id = _int_or_none(row.get("loser_id"))
        enriched += 1

    db.commit()
    logger.info("  Year %d: %d enriched, %d not found (out of %d)", year, enriched, not_found, len(matches))
    return enriched, not_found


def main():
    logger.info("Tennis Abstract enrichment starting...")
    db = SessionLocal()
    try:
        total_enriched = 0
        total_not_found = 0

        for year in YEARS:
            rows = _download_csv(year)
            if not rows:
                continue
            enriched, not_found = enrich_year(db, year, rows)
            total_enriched += enriched
            total_not_found += not_found

        logger.info("Done. Total enriched: %d, not matched: %d", total_enriched, total_not_found)

        # Coverage stats
        total = db.query(TennisMatch).count()
        with_stats = db.query(TennisMatch).filter(TennisMatch.w_ace.isnot(None)).count()
        logger.info("Coverage: %d/%d matches (%.1f%%)", with_stats, total, with_stats / max(total, 1) * 100)
    finally:
        db.close()


if __name__ == "__main__":
    main()
