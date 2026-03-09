"""Sofascore tennis data enrichment client.

Scrapes player stats (ranking, form, surface record, serve %, aces, H2H)
from Sofascore's internal API to enrich tennis scanner matches.
"""

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

CACHE_DIR = Path("data/cache/sofascore")
CACHE_TTL = 3600  # 1 hour for player stats
API_BASE = "https://api.sofascore.com/api/v1"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.sofascore.com/",
    "Origin": "https://www.sofascore.com",
}

# Maps groundType strings to simplified surface names
_SURFACE_MAP = {
    "Hardcourt outdoor": "Hard",
    "Hardcourt indoor": "Hard",
    "Clay": "Clay",
    "Grass": "Grass",
    "Carpet": "Carpet",
    "Hardcourt": "Hard",
}


class SofascoreClient:
    """Fetches and caches tennis player stats from Sofascore."""

    def __init__(self):
        self._client = httpx.Client(headers=HEADERS, timeout=15, follow_redirects=True)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def close(self):
        self._client.close()

    # ------------------------------------------------------------------
    # Public: enrich a list of matches from tennis_client
    # ------------------------------------------------------------------

    def enrich_matches(self, matches: list[dict], date_str: str | None = None) -> list[dict]:
        """Enrich tennis matches with Sofascore stats.

        Args:
            matches: list of match dicts from TennisClient.get_matches()
            date_str: date string YYYY-MM-DD for scheduled events lookup

        Returns:
            Same list with enriched fields filled in.
        """
        if not matches:
            return matches

        if not date_str:
            date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Build a lookup: "Player Name" -> sofascore player id + event data
        sofa_events = self._get_scheduled_events(date_str)
        # Also check next day if timeframe is >24h
        next_day = (datetime.strptime(date_str, "%Y-%m-%d").replace(
            tzinfo=timezone.utc) + __import__("datetime").timedelta(days=1)).strftime("%Y-%m-%d")
        sofa_events.extend(self._get_scheduled_events(next_day))

        # Index by normalized player names
        sofa_index: dict[str, dict] = {}
        for ev in sofa_events:
            home_name = ev.get("homeTeam", {}).get("name", "")
            away_name = ev.get("awayTeam", {}).get("name", "")
            key = _match_key(home_name, away_name)
            sofa_index[key] = ev
            # Also index reversed
            sofa_index[_match_key(away_name, home_name)] = ev

        enriched_count = 0
        for m in matches:
            p1 = m.get("player1", "")
            p2 = m.get("player2", "")
            key = _match_key(p1, p2)
            sofa_ev = sofa_index.get(key)

            if not sofa_ev:
                # Try fuzzy match
                sofa_ev = self._fuzzy_find(p1, p2, sofa_index)

            if not sofa_ev:
                logger.debug("No Sofascore match for %s vs %s", p1, p2)
                continue

            home_team = sofa_ev.get("homeTeam", {})
            away_team = sofa_ev.get("awayTeam", {})

            # Determine which sofascore player is p1/p2
            if _names_match(p1, home_team.get("name", "")):
                p1_team, p2_team = home_team, away_team
            else:
                p1_team, p2_team = away_team, home_team

            p1_id = p1_team.get("id")
            p2_id = p2_team.get("id")

            # Enrich each player
            if p1_id:
                self._enrich_player(m, "p1", p1_id, m.get("surface"))
            if p2_id:
                self._enrich_player(m, "p2", p2_id, m.get("surface"))

            # Round info from sofascore
            round_info = sofa_ev.get("roundInfo", {})
            if round_info and not m.get("round"):
                m["round"] = round_info.get("name", f"R{round_info.get('round', '')}")

            # Surface from groundType if not already set
            gt = sofa_ev.get("groundType")
            if gt and not m.get("surface"):
                m["surface"] = _SURFACE_MAP.get(gt, gt)

            enriched_count += 1

        logger.info("Sofascore enrichment: %d/%d matches enriched", enriched_count, len(matches))
        return matches

    # ------------------------------------------------------------------
    # Player enrichment
    # ------------------------------------------------------------------

    def _enrich_player(self, match: dict, prefix: str, player_id: int, surface: str | None):
        """Fill match dict with player stats for given prefix (p1 or p2)."""
        # Get player info (ranking)
        info = self._get_player_info(player_id)
        if info:
            team = info.get("team", {})
            if team.get("ranking"):
                match[f"{prefix}_ranking"] = team["ranking"]

            # Age from playerTeamInfo or timeActive
            # We'll compute from last events if needed

        # Get last events for form, record, surface record, serve stats
        events = self._get_player_last_events(player_id)
        if events:
            stats = self._compute_player_stats(events, player_id, surface)
            match[f"{prefix}_season_record"] = stats["season_record"]
            match[f"{prefix}_surface_record"] = stats["surface_record"]
            match[f"{prefix}_form"] = stats["form_str"]
            match[f"{prefix}_form_detail"] = stats["form_detail"]
            if stats["rest_days"] is not None:
                match[f"{prefix}_rest_days"] = stats["rest_days"]

            # Get serve stats from recent match statistics
            serve_stats = self._get_avg_serve_stats(events, player_id)
            if serve_stats.get("serve_pct") is not None:
                match[f"{prefix}_serve_pct"] = serve_stats["serve_pct"]
            if serve_stats.get("return_pct") is not None:
                match[f"{prefix}_return_pct"] = serve_stats["return_pct"]
            if serve_stats.get("aces_avg") is not None:
                match[f"{prefix}_aces_avg"] = serve_stats["aces_avg"]

    def _compute_player_stats(
        self, events: list[dict], player_id: int, target_surface: str | None
    ) -> dict:
        """Compute season record, surface record, form from last events."""
        season_w, season_l = 0, 0
        surface_w, surface_l = 0, 0
        form_chars: list[str] = []
        form_detail: list[dict] = []
        last_match_ts: int | None = None

        target_surface_norm = _SURFACE_MAP.get(target_surface or "", target_surface or "")

        for e in events:
            # Skip exhibitions
            cat = e.get("tournament", {}).get("category", {}).get("name", "")
            tourn_name = e.get("tournament", {}).get("name", "")
            if "Exhibition" in cat or "exhibition" in tourn_name.lower():
                continue

            status = e.get("status", {}).get("type", "")
            if status != "finished":
                continue

            wc = e.get("winnerCode", 0)
            home_id = e.get("homeTeam", {}).get("id")
            is_home = (home_id == player_id)
            won = (wc == 1 and is_home) or (wc == 2 and not is_home)

            gt = e.get("groundType", "")
            surface_norm = _SURFACE_MAP.get(gt, gt)

            if won:
                season_w += 1
                form_chars.append("W")
            else:
                season_l += 1
                form_chars.append("L")

            # Surface record
            if target_surface_norm and surface_norm == target_surface_norm:
                if won:
                    surface_w += 1
                else:
                    surface_l += 1

            # Form detail (last 5)
            if len(form_detail) < 5:
                opponent = e.get("awayTeam" if is_home else "homeTeam", {})
                home_score = e.get("homeScore", {})
                away_score = e.get("awayScore", {})
                if is_home:
                    score_str = f"{home_score.get('current', '?')}-{away_score.get('current', '?')}"
                else:
                    score_str = f"{away_score.get('current', '?')}-{home_score.get('current', '?')}"

                form_detail.append({
                    "opponent": opponent.get("name", "?"),
                    "result": "W" if won else "L",
                    "score": score_str,
                    "tournament": e.get("tournament", {}).get("uniqueTournament", {}).get("name", tourn_name),
                    "surface": surface_norm,
                })

            # Rest days (time since last match)
            ts = e.get("startTimestamp")
            if ts and last_match_ts is None:
                last_match_ts = ts

        # Calculate rest days
        rest_days = None
        if last_match_ts:
            now_ts = int(datetime.now(timezone.utc).timestamp())
            rest_days = max(0, (now_ts - last_match_ts) // 86400)

        season_record = f"{season_w}W-{season_l}L" if (season_w + season_l) > 0 else None
        surface_record = f"{surface_w}W-{surface_l}L" if (surface_w + surface_l) > 0 else None
        form_str = "".join(form_chars[:10]) if form_chars else None

        return {
            "season_record": season_record,
            "surface_record": surface_record,
            "form_str": form_str,
            "form_detail": form_detail,
            "rest_days": rest_days,
        }

    def _get_avg_serve_stats(self, events: list[dict], player_id: int) -> dict:
        """Fetch match statistics for recent events and compute average serve/return/aces."""
        total_aces = 0
        total_first_serve_won = 0
        total_first_serve_total = 0
        total_second_serve_won = 0
        total_second_serve_total = 0
        total_return_first_won = 0
        total_return_first_total = 0
        total_return_second_won = 0
        total_return_second_total = 0
        matches_with_stats = 0

        # Only check last 5 finished ATP/WTA matches
        checked = 0
        for e in events:
            if checked >= 5:
                break
            cat = e.get("tournament", {}).get("category", {}).get("name", "")
            if "Exhibition" in cat:
                continue
            if e.get("status", {}).get("type") != "finished":
                continue

            eid = e.get("id")
            if not eid:
                continue

            home_id = e.get("homeTeam", {}).get("id")
            is_home = (home_id == player_id)

            stats = self._get_event_statistics(eid)
            checked += 1

            if not stats:
                continue

            # Parse stats - find ALL period group
            all_groups = None
            for period in stats:
                if period.get("period") == "ALL":
                    all_groups = period.get("groups", [])
                    break

            if not all_groups:
                continue

            side = "home" if is_home else "away"
            opp_side = "away" if is_home else "home"

            for group in all_groups:
                for item in group.get("statisticsItems", []):
                    key = item.get("key", "")
                    if key == "aces":
                        total_aces += item.get(f"{side}Value", 0)
                    elif key == "firstServePointsAccuracy":
                        total_first_serve_won += item.get(f"{side}Value", 0)
                        total_first_serve_total += item.get(f"{side}Total", 0)
                    elif key == "secondServePointsAccuracy":
                        total_second_serve_won += item.get(f"{side}Value", 0)
                        total_second_serve_total += item.get(f"{side}Total", 0)
                    elif key == "firstReturnPoints":
                        total_return_first_won += item.get(f"{side}Value", 0)
                        total_return_first_total += item.get(f"{side}Total", 0)
                    elif key == "secondReturnPoints":
                        total_return_second_won += item.get(f"{side}Value", 0)
                        total_return_second_total += item.get(f"{side}Total", 0)

            matches_with_stats += 1
            time.sleep(0.1)  # Rate limiting

        result: dict[str, Any] = {
            "serve_pct": None,
            "return_pct": None,
            "aces_avg": None,
        }

        if matches_with_stats == 0:
            return result

        # Serve % = points won on serve / total serve points
        total_serve_won = total_first_serve_won + total_second_serve_won
        total_serve_pts = total_first_serve_total + total_second_serve_total
        if total_serve_pts > 0:
            result["serve_pct"] = round(total_serve_won / total_serve_pts * 100, 1)

        # Return % = points won on return / total return points
        total_ret_won = total_return_first_won + total_return_second_won
        total_ret_pts = total_return_first_total + total_return_second_total
        if total_ret_pts > 0:
            result["return_pct"] = round(total_ret_won / total_ret_pts * 100, 1)

        # Aces average per match
        result["aces_avg"] = round(total_aces / matches_with_stats, 1)

        return result

    # ------------------------------------------------------------------
    # Sofascore API calls with caching
    # ------------------------------------------------------------------

    def _get_scheduled_events(self, date_str: str) -> list[dict]:
        """Get all tennis events for a given date."""
        cache_key = f"events_{date_str}"
        cached = self._read_cache(cache_key)
        if cached is not None:
            return cached

        try:
            resp = self._client.get(f"{API_BASE}/sport/tennis/scheduled-events/{date_str}")
            if resp.status_code != 200:
                logger.warning("Sofascore scheduled-events %s: %d", date_str, resp.status_code)
                return []
            events = resp.json().get("events", [])
            self._write_cache(cache_key, events)
            return events
        except Exception as e:
            logger.error("Sofascore scheduled-events error: %s", e)
            return []

    def _get_player_info(self, player_id: int) -> dict | None:
        """Get player basic info (ranking, country, etc.)."""
        cache_key = f"player_{player_id}"
        cached = self._read_cache(cache_key)
        if cached is not None:
            return cached

        try:
            resp = self._client.get(f"{API_BASE}/team/{player_id}")
            if resp.status_code != 200:
                return None
            data = resp.json()
            self._write_cache(cache_key, data)
            return data
        except Exception as e:
            logger.error("Sofascore player info error: %s", e)
            return None

    def _get_player_last_events(self, player_id: int) -> list[dict]:
        """Get player's last 30 events."""
        cache_key = f"last_events_{player_id}"
        cached = self._read_cache(cache_key)
        if cached is not None:
            return cached

        try:
            resp = self._client.get(f"{API_BASE}/team/{player_id}/events/last/0")
            if resp.status_code != 200:
                return []
            events = resp.json().get("events", [])
            self._write_cache(cache_key, events)
            return events
        except Exception as e:
            logger.error("Sofascore last events error: %s", e)
            return []

    def _get_event_statistics(self, event_id: int) -> list[dict] | None:
        """Get match statistics (aces, serve %, etc.) for a finished event."""
        cache_key = f"event_stats_{event_id}"
        cached = self._read_cache(cache_key)
        if cached is not None:
            return cached

        try:
            resp = self._client.get(f"{API_BASE}/event/{event_id}/statistics")
            if resp.status_code != 200:
                return None
            stats = resp.json().get("statistics", [])
            self._write_cache(cache_key, stats, ttl=86400)  # 24h for past events
            return stats
        except Exception as e:
            logger.error("Sofascore event stats error: %s", e)
            return None

    # ------------------------------------------------------------------
    # Cache helpers
    # ------------------------------------------------------------------

    def _read_cache(self, key: str) -> Any:
        cache_file = CACHE_DIR / f"{key}.json"
        if not cache_file.exists():
            return None
        try:
            data = json.loads(cache_file.read_text(encoding="utf-8"))
            ttl = data.get("_ttl", CACHE_TTL)
            if time.time() - data.get("_ts", 0) > ttl:
                return None
            return data.get("_data")
        except Exception:
            return None

    def _write_cache(self, key: str, data: Any, ttl: int = CACHE_TTL):
        cache_file = CACHE_DIR / f"{key}.json"
        try:
            cache_file.write_text(
                json.dumps({"_data": data, "_ts": time.time(), "_ttl": ttl}, ensure_ascii=False),
                encoding="utf-8",
            )
        except Exception as e:
            logger.debug("Cache write error for %s: %s", key, e)

    # ------------------------------------------------------------------
    # Fuzzy matching
    # ------------------------------------------------------------------

    def _fuzzy_find(self, p1: str, p2: str, index: dict[str, dict]) -> dict | None:
        """Try to find a sofascore event matching p1 vs p2 with fuzzy name matching."""
        p1_parts = _name_parts(p1)
        p2_parts = _name_parts(p2)

        best_score = 0
        best_ev = None

        for key, ev in index.items():
            home_name = ev.get("homeTeam", {}).get("name", "")
            away_name = ev.get("awayTeam", {}).get("name", "")

            # Check if p1 matches home and p2 matches away (or vice versa)
            score_ha = _fuzzy_name_score(p1_parts, home_name) + _fuzzy_name_score(p2_parts, away_name)
            score_ah = _fuzzy_name_score(p1_parts, away_name) + _fuzzy_name_score(p2_parts, home_name)
            score = max(score_ha, score_ah)

            if score > best_score:
                best_score = score
                best_ev = ev

        # Require at least both last names to match
        if best_score >= 2:
            return best_ev
        return None


# ------------------------------------------------------------------
# Module-level helpers
# ------------------------------------------------------------------

def _match_key(name1: str, name2: str) -> str:
    """Create a normalized match key from two player names."""
    return f"{_normalize(name1)}|{_normalize(name2)}"


def _normalize(name: str) -> str:
    """Normalize a player name for matching."""
    import unicodedata
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    return name.lower().strip()


def _names_match(name_a: str, name_b: str) -> bool:
    """Check if two names refer to the same player."""
    if _normalize(name_a) == _normalize(name_b):
        return True
    # Check last name match
    a_parts = _name_parts(name_a)
    b_parts = _name_parts(name_b)
    return bool(a_parts & b_parts)


def _name_parts(name: str) -> set[str]:
    """Extract normalized name parts (for fuzzy matching)."""
    return {p for p in _normalize(name).split() if len(p) > 1}


def _fuzzy_name_score(parts: set[str], full_name: str) -> int:
    """Score how well a set of name parts matches a full name."""
    target_parts = _name_parts(full_name)
    return len(parts & target_parts)
