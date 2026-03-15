"""Jeff Sackmann ATP data client for tennis live scan enrichment.

Downloads ATP match history and rankings from:
  https://github.com/JeffSackmann/tennis_atp

Replaces SofaScore enrichment which returns 403 on the VPS.

Provides:
  - Player rankings (from atp_rankings_current.csv)
  - Form string and form detail (last 5-10 matches)
  - Season record and surface record
  - Serve %, return %, aces avg, BP saved %
  - Rest days (days since last match)
  - H2H summary, surface H2H, last 3 results

All stats are computed strictly from data BEFORE the match date (no look-ahead bias).
For live scan enrichment "before match date" = before today.
"""

import csv
import io
import json
import logging
import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

# --- Constants ---

ABSTRACT_BASE = "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master"

CACHE_DIR = Path("data/cache/sackmann")

# Cache TTLs (seconds)
_MATCHES_TTL = 86400      # 24 h — match CSVs are updated daily at most
_RANKINGS_TTL = 21600     # 6 h — rankings change more frequently
_H2H_TTL = 86400 * 7     # 7 days — H2H is stable

_SURFACE_MAP = {
    "Hard": "Hard",
    "Clay": "Clay",
    "Grass": "Grass",
    "Carpet": "Carpet",
}

# How many recent matches to use for serve/return/aces stats
_STATS_WINDOW = 10

# How many matches to use for form string (max 10, displayed as 5)
_FORM_WINDOW = 10


# ------------------------------------------------------------------
# Name normalisation (proven function from enrich_tennis_abstract.py)
# ------------------------------------------------------------------

def _normalize_name(name: str) -> str:
    """Normalize player name to lowercase surname for fuzzy matching.

    Examples:
      "Novak Djokovic"  -> "djokovic"
      "Djokovic N."     -> "djokovic"
      "Carlos Alcaraz"  -> "alcaraz"
    """
    if not name:
        return ""
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = name.lower().strip()
    # "Djokovic N." format — take first word (surname already first)
    if re.search(r'\s[a-z]\.$', name):
        return name.split()[0]
    # "Novak Djokovic" format — take last word (surname)
    parts = name.split()
    return parts[-1] if parts else name


def _safe_float(val: str) -> float | None:
    """Parse a CSV string to float, returning None on failure."""
    try:
        v = val.strip() if val else ""
        return float(v) if v else None
    except (ValueError, TypeError):
        return None


def _safe_int(val: str) -> int | None:
    """Parse a CSV string to int, returning None on failure."""
    f = _safe_float(val)
    return int(f) if f is not None else None


def _parse_tourney_date(tourney_date: str) -> datetime | None:
    """Parse tourney_date field (YYYYMMDD) into a datetime."""
    try:
        return datetime.strptime(tourney_date.strip(), "%Y%m%d").replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return None


# ------------------------------------------------------------------
# File-based cache helpers
# ------------------------------------------------------------------

def _cache_path(name: str) -> Path:
    return CACHE_DIR / f"{name}.json"


def _cache_read(name: str, ttl: int) -> object | None:
    """Read cached data if it exists and is not expired."""
    p = _cache_path(name)
    if not p.exists():
        return None
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
        cached_at = raw.get("_cached_at", 0)
        if time.time() - cached_at > ttl:
            return None
        return raw.get("data")
    except Exception:
        return None


def _cache_write(name: str, data: object) -> None:
    """Write data to file cache with a timestamp."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    p = _cache_path(name)
    try:
        payload = {"_cached_at": time.time(), "data": data}
        p.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:
        logger.warning("Sackmann cache write failed for '%s': %s", name, exc)


# ------------------------------------------------------------------
# Main client
# ------------------------------------------------------------------

class SackmannClient:
    """Download ATP match history + rankings from Jeff Sackmann's GitHub repo.

    Provides player stats and H2H for tennis live scan enrichment.
    Thread-safe for read operations (downloads are idempotent).
    """

    def __init__(self) -> None:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        # In-process caches (populated lazily)
        self._matches_cache: list[dict] | None = None
        self._rankings_cache: dict[str, int] | None = None
        # Index by normalized surname for fast lookup
        self._player_index: dict[str, list[dict]] | None = None
        self._httpx = httpx.Client(timeout=30, follow_redirects=True)

    def close(self) -> None:
        self._httpx.close()

    # ------------------------------------------------------------------
    # Data download
    # ------------------------------------------------------------------

    def _download_matches(self) -> list[dict]:
        """Download current + previous year CSV files.

        Returns a flat list of match row dicts sorted by tourney_date descending
        (most recent first) so that form/stats lookups are naturally ordered.
        """
        if self._matches_cache is not None:
            return self._matches_cache

        cached = _cache_read("matches", _MATCHES_TTL)
        if cached is not None:
            logger.debug("Sackmann matches loaded from file cache (%d rows)", len(cached))
            self._matches_cache = cached
            self._build_player_index()
            return self._matches_cache

        now = datetime.now(timezone.utc)
        years = sorted({now.year, now.year - 1}, reverse=True)

        rows: list[dict] = []
        for year in years:
            url = f"{ABSTRACT_BASE}/atp_matches_{year}.csv"
            logger.info("Downloading Sackmann ATP matches %d from %s", year, url)
            try:
                resp = self._httpx.get(url)
                resp.raise_for_status()
                reader = csv.DictReader(io.StringIO(resp.text))
                year_rows = list(reader)
                # Attach year for easy filtering
                for r in year_rows:
                    r["_year"] = str(year)
                rows.extend(year_rows)
                logger.info("  %d matches loaded for %d", len(year_rows), year)
            except Exception as exc:
                logger.warning("Failed to download Sackmann matches for %d: %s", year, exc)

        # Sort descending by tourney_date so index[0] = most recent
        def _sort_key(r: dict) -> str:
            return r.get("tourney_date", "") or ""

        rows.sort(key=_sort_key, reverse=True)

        self._matches_cache = rows
        _cache_write("matches", rows)
        self._build_player_index()
        return self._matches_cache

    def _download_rankings(self) -> dict[str, int]:
        """Download current ATP rankings.

        Returns {normalized_surname: rank} dict.
        """
        if self._rankings_cache is not None:
            return self._rankings_cache

        cached = _cache_read("rankings", _RANKINGS_TTL)
        if cached is not None:
            logger.debug("Sackmann rankings loaded from file cache (%d players)", len(cached))
            self._rankings_cache = cached
            return self._rankings_cache

        url = f"{ABSTRACT_BASE}/atp_rankings_current.csv"
        logger.info("Downloading Sackmann ATP rankings from %s", url)
        rankings: dict[str, int] = {}
        try:
            resp = self._httpx.get(url)
            resp.raise_for_status()
            reader = csv.DictReader(io.StringIO(resp.text))
            # Columns: ranking_date, rank, player, points
            for row in reader:
                rank_val = _safe_int(row.get("rank", ""))
                # "player" field in rankings CSV is a numeric player_id; not the name.
                # The player name appears as the 4th column (sometimes unlabeled).
                # We need to cross-reference with match data for name.
                # Instead, use winner_rank/loser_rank from match data for ranking lookup.
                # This file maps player_id -> rank, which we resolve later.
                player_id = row.get("player", "").strip()
                if rank_val and player_id:
                    rankings[player_id] = rank_val
        except Exception as exc:
            logger.warning("Failed to download Sackmann rankings: %s", exc)

        self._rankings_cache = rankings
        _cache_write("rankings", rankings)
        return self._rankings_cache

    def _get_ranking_from_matches(self, normalized: str) -> int | None:
        """Infer current ranking from the most recent match containing this player.

        Uses winner_rank / loser_rank fields in the CSV (which reflect ranking
        at the time of the match — a reasonable approximation for the latest matches).
        """
        matches = self._download_matches()
        for row in matches:
            wn = _normalize_name(row.get("winner_name", ""))
            ln = _normalize_name(row.get("loser_name", ""))
            if wn == normalized:
                rank = _safe_int(row.get("winner_rank", ""))
                if rank:
                    return rank
            elif ln == normalized:
                rank = _safe_int(row.get("loser_rank", ""))
                if rank:
                    return rank
        return None

    # ------------------------------------------------------------------
    # Player index
    # ------------------------------------------------------------------

    def _build_player_index(self) -> None:
        """Build {normalized_surname: [match_rows]} from match cache.

        Each player appears in each match row twice (as winner or loser).
        Index entries list match rows most-recent-first.
        """
        if self._matches_cache is None:
            return

        index: dict[str, list[dict]] = {}
        for row in self._matches_cache:
            wn = _normalize_name(row.get("winner_name", ""))
            ln = _normalize_name(row.get("loser_name", ""))
            for surname in (wn, ln):
                if surname:
                    index.setdefault(surname, []).append(row)

        self._player_index = index

    def _get_player_matches(self, normalized: str) -> list[dict]:
        """Return all matches for a player (most recent first)."""
        if self._player_index is None:
            self._download_matches()
        return (self._player_index or {}).get(normalized, [])

    # ------------------------------------------------------------------
    # Public: player stats
    # ------------------------------------------------------------------

    def get_player_stats(self, name: str, surface: str | None = None) -> dict:
        """Return comprehensive stats dict for a player (all data before today).

        Args:
            name: Player name as returned by The Odds API (e.g. "Novak Djokovic")
            surface: Court surface ("Hard", "Clay", "Grass") for surface record

        Returns dict with keys:
            ranking, form, form_detail, season_record, surface_record,
            serve_pct, return_pct, aces_avg, rest_days, bp_saved_pct
        """
        normalized = _normalize_name(name)
        today = datetime.now(timezone.utc)
        today_date_str = today.strftime("%Y%m%d")

        player_matches = self._get_player_matches(normalized)

        # Filter: only matches BEFORE today (no look-ahead bias)
        past_matches = [
            r for r in player_matches
            if (r.get("tourney_date") or "") < today_date_str
        ]

        return self._compute_stats(normalized, past_matches, surface, today)

    def _compute_stats(
        self,
        normalized: str,
        past_matches: list[dict],
        surface: str | None,
        today: datetime,
    ) -> dict:
        """Compute all stats from a filtered list of past match rows."""
        ranking = self._get_ranking_from_matches(normalized)

        season_year = str(today.year)
        surface_norm = _SURFACE_MAP.get(surface or "", surface or "") if surface else None

        season_w, season_l = 0, 0
        surface_w, surface_l = 0, 0
        form_chars: list[str] = []
        form_detail: list[dict] = []

        # Serve/return stats accumulators (last _STATS_WINDOW matches)
        total_aces = 0.0
        total_svpt = 0.0
        total_1stWon = 0.0
        total_2ndWon = 0.0
        total_bp_saved = 0.0
        total_bp_faced = 0.0
        # Return stats: opponent's serve points lost to our player
        # Approximated as: opp_svpt - opp_1stWon - opp_2ndWon
        total_return_won = 0.0
        total_return_pts = 0.0

        stats_matches = 0
        last_match_date: datetime | None = None

        for row in past_matches:
            wn = _normalize_name(row.get("winner_name", ""))
            is_winner = wn == normalized
            match_date = _parse_tourney_date(row.get("tourney_date", ""))

            # --- Season record ---
            if (row.get("tourney_date") or "")[:4] == season_year:
                if is_winner:
                    season_w += 1
                else:
                    season_l += 1

            # --- Surface record ---
            row_surface = _SURFACE_MAP.get(row.get("surface", ""), row.get("surface", ""))
            if surface_norm and row_surface == surface_norm:
                if is_winner:
                    surface_w += 1
                else:
                    surface_l += 1

            # --- Form (last _FORM_WINDOW matches) ---
            if len(form_chars) < _FORM_WINDOW:
                result_char = "W" if is_winner else "L"
                form_chars.append(result_char)

                if len(form_detail) < 5:
                    opponent_name = row.get("loser_name" if is_winner else "winner_name", "?")
                    score = row.get("score", "?")
                    form_detail.append({
                        "opponent": opponent_name,
                        "result": result_char,
                        "score": score,
                        "surface": row_surface or None,
                    })

            # --- Rest days (most recent match date) ---
            if match_date and last_match_date is None:
                last_match_date = match_date

            # --- Serve/return stats (last _STATS_WINDOW matches) ---
            if stats_matches < _STATS_WINDOW:
                if is_winner:
                    ace = _safe_float(row.get("w_ace", ""))
                    svpt = _safe_float(row.get("w_svpt", ""))
                    first_won = _safe_float(row.get("w_1stWon", ""))
                    second_won = _safe_float(row.get("w_2ndWon", ""))
                    bp_saved = _safe_float(row.get("w_bpSaved", ""))
                    bp_faced = _safe_float(row.get("w_bpFaced", ""))
                    # Return approximation: points won on opponent's serve
                    opp_svpt = _safe_float(row.get("l_svpt", ""))
                    opp_1st = _safe_float(row.get("l_1stWon", ""))
                    opp_2nd = _safe_float(row.get("l_2ndWon", ""))
                else:
                    ace = _safe_float(row.get("l_ace", ""))
                    svpt = _safe_float(row.get("l_svpt", ""))
                    first_won = _safe_float(row.get("l_1stWon", ""))
                    second_won = _safe_float(row.get("l_2ndWon", ""))
                    bp_saved = _safe_float(row.get("l_bpSaved", ""))
                    bp_faced = _safe_float(row.get("l_bpFaced", ""))
                    opp_svpt = _safe_float(row.get("w_svpt", ""))
                    opp_1st = _safe_float(row.get("w_1stWon", ""))
                    opp_2nd = _safe_float(row.get("w_2ndWon", ""))

                if svpt and svpt > 0:
                    if ace is not None:
                        total_aces += ace
                    if first_won is not None:
                        total_1stWon += first_won
                    if second_won is not None:
                        total_2ndWon += second_won
                    total_svpt += svpt
                    if bp_saved is not None:
                        total_bp_saved += bp_saved
                    if bp_faced is not None:
                        total_bp_faced += bp_faced

                    # Return: opponent's serve points that our player won
                    if opp_svpt and opp_1st is not None and opp_2nd is not None:
                        opp_won_on_serve = opp_1st + opp_2nd
                        our_return_won = opp_svpt - opp_won_on_serve
                        total_return_won += max(0.0, our_return_won)
                        total_return_pts += opp_svpt

                    stats_matches += 1

        # --- Compute aggregated metrics ---
        form_str = "".join(form_chars[:10]) if form_chars else None
        # Display form: last 5 chars (most recent last in string = most recent first in list)
        display_form = form_str[:5] if form_str else None

        season_record = f"{season_w}W-{season_l}L" if (season_w + season_l) > 0 else None
        surface_record = f"{surface_w}W-{surface_l}L" if (surface_w + surface_l) > 0 else None

        serve_pct: float | None = None
        if total_svpt > 0:
            serve_pct = round((total_1stWon + total_2ndWon) / total_svpt * 100, 1)

        return_pct: float | None = None
        if total_return_pts > 0:
            return_pct = round(total_return_won / total_return_pts * 100, 1)

        aces_avg: float | None = None
        if stats_matches > 0:
            aces_avg = round(total_aces / stats_matches, 1)

        bp_saved_pct: float | None = None
        if total_bp_faced > 0:
            bp_saved_pct = round(total_bp_saved / total_bp_faced * 100, 1)

        rest_days: int | None = None
        if last_match_date:
            delta = today - last_match_date
            rest_days = max(0, delta.days)

        return {
            "ranking": ranking,
            "form": display_form,
            "form_detail": form_detail,
            "season_record": season_record,
            "surface_record": surface_record,
            "serve_pct": serve_pct,
            "return_pct": return_pct,
            "aces_avg": aces_avg,
            "rest_days": rest_days,
            "bp_saved_pct": bp_saved_pct,
        }

    # ------------------------------------------------------------------
    # Public: H2H
    # ------------------------------------------------------------------

    def get_h2h(self, p1: str, p2: str, surface: str | None = None) -> dict:
        """Return head-to-head record between two players (all data before today).

        Args:
            p1: Player 1 name (as returned by The Odds API)
            p2: Player 2 name
            surface: Court surface for surface-specific H2H

        Returns dict with keys:
            h2h (str): summary like "15 matchs : Djokovic 10V - 5D Nadal"
            h2h_surface (str | None): surface-specific summary
            h2h_last3 (list[str]): last 3 results as readable strings
        """
        n1 = _normalize_name(p1)
        n2 = _normalize_name(p2)
        today_date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        surface_norm = _SURFACE_MAP.get(surface or "", surface or "") if surface else None

        # Fetch from file cache if available
        cache_key = f"h2h_{min(n1, n2)}_{max(n1, n2)}"
        cached = _cache_read(cache_key, _H2H_TTL)
        if cached is not None and (not surface or cached.get("_surface") == surface_norm):
            return cached

        p1_matches = self._get_player_matches(n1)

        p1_wins = 0
        p2_wins = 0
        surface_p1 = 0
        surface_p2 = 0
        last3: list[str] = []

        for row in p1_matches:
            # Only past matches
            if (row.get("tourney_date") or "") >= today_date_str:
                continue

            wn = _normalize_name(row.get("winner_name", ""))
            ln = _normalize_name(row.get("loser_name", ""))

            # Only rows that involve both players
            involves_both = (wn == n1 and ln == n2) or (wn == n2 and ln == n1)
            if not involves_both:
                continue

            p1_won = wn == n1
            if p1_won:
                p1_wins += 1
            else:
                p2_wins += 1

            row_surface = _SURFACE_MAP.get(row.get("surface", ""), row.get("surface", ""))
            if surface_norm and row_surface == surface_norm:
                if p1_won:
                    surface_p1 += 1
                else:
                    surface_p2 += 1

            if len(last3) < 3:
                score = row.get("score", "?")
                winner_name = row.get("winner_name", "?")
                loser_name = row.get("loser_name", "?")
                result_char = "W" if p1_won else "L"
                last3.append(f"{result_char} vs {loser_name if p1_won else winner_name} ({score})")

        total = p1_wins + p2_wins

        if total == 0:
            result: dict = {
                "h2h": f"0 matchs precedents",
                "h2h_surface": None,
                "h2h_last3": [],
                "_surface": surface_norm,
            }
            _cache_write(cache_key, result)
            return result

        # Use short display names (surname only) for readability
        p1_display = p1.split()[-1] if p1.split() else p1
        p2_display = p2.split()[-1] if p2.split() else p2

        h2h_str = f"{total} matchs : {p1_display} {p1_wins}V - {p2_wins}D {p2_display}"

        h2h_surface_str: str | None = None
        if surface_norm and (surface_p1 + surface_p2) > 0:
            h2h_surface_str = (
                f"{p1_display} {surface_p1}V-{surface_p2}D {p2_display} sur {surface_norm}"
            )

        result = {
            "h2h": h2h_str,
            "h2h_surface": h2h_surface_str,
            "h2h_last3": last3,
            "_surface": surface_norm,
        }
        _cache_write(cache_key, result)
        return result

    # ------------------------------------------------------------------
    # Public: enrich a batch of match dicts in place
    # ------------------------------------------------------------------

    def enrich_matches(self, matches: list[dict]) -> None:
        """Enrich a list of match dicts IN PLACE with player stats and H2H.

        Fills the following fields for each match:
          p1_ranking, p2_ranking, p1_form, p2_form, p1_form_detail, p2_form_detail,
          p1_season_record, p2_season_record, p1_surface_record, p2_surface_record,
          p1_serve_pct, p2_serve_pct, p1_return_pct, p2_return_pct,
          p1_aces_avg, p2_aces_avg, p1_rest_days, p2_rest_days,
          p1_bp_saved_pct, p2_bp_saved_pct,
          h2h, h2h_surface, h2h_last3

        Skips fields that are already populated (allows partial pre-fill from other sources).
        Non-blocking: errors per match are caught and logged.
        """
        if not matches:
            return

        # Pre-load match history once for the whole batch
        self._download_matches()

        for match in matches:
            try:
                p1 = match.get("player1", "")
                p2 = match.get("player2", "")
                surface = match.get("surface")

                if not p1 or not p2:
                    continue

                # --- Player 1 stats ---
                p1_stats = self.get_player_stats(p1, surface)
                _apply_player_stats(match, "p1", p1_stats)

                # --- Player 2 stats ---
                p2_stats = self.get_player_stats(p2, surface)
                _apply_player_stats(match, "p2", p2_stats)

                # --- H2H ---
                if not match.get("h2h"):
                    h2h = self.get_h2h(p1, p2, surface)
                    match["h2h"] = h2h.get("h2h")
                    match["h2h_surface"] = h2h.get("h2h_surface")
                    if not match.get("h2h_last3"):
                        match["h2h_last3"] = h2h.get("h2h_last3", [])

            except Exception as exc:
                logger.warning(
                    "Sackmann enrichment failed for '%s' vs '%s': %s",
                    match.get("player1", "?"),
                    match.get("player2", "?"),
                    exc,
                )

        enriched = sum(1 for m in matches if m.get("p1_ranking") is not None)
        logger.info(
            "Sackmann enrichment done: %d/%d matches enriched",
            enriched,
            len(matches),
        )


# ------------------------------------------------------------------
# Module-level helpers
# ------------------------------------------------------------------

def _apply_player_stats(match: dict, prefix: str, stats: dict) -> None:
    """Write computed stats into a match dict for a given player prefix.

    Only fills fields that are currently None/missing (preserves existing data).
    """
    field_map = {
        "ranking": f"{prefix}_ranking",
        "form": f"{prefix}_form",
        "form_detail": f"{prefix}_form_detail",
        "season_record": f"{prefix}_season_record",
        "surface_record": f"{prefix}_surface_record",
        "serve_pct": f"{prefix}_serve_pct",
        "return_pct": f"{prefix}_return_pct",
        "aces_avg": f"{prefix}_aces_avg",
        "rest_days": f"{prefix}_rest_days",
        "bp_saved_pct": f"{prefix}_bp_saved_pct",
    }
    for stat_key, match_key in field_map.items():
        if match.get(match_key) is None and stats.get(stat_key) is not None:
            match[match_key] = stats[stat_key]
