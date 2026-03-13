"""Sofascore tennis data enrichment client.

Scrapes player stats (ranking, form, surface record, serve %, aces, H2H)
from Sofascore's internal API to enrich tennis scanner matches.
"""

import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from src.cache import cache_get, cache_set as _cache_set_global

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
    # Public: get tennis matches from SofaScore (primary source)
    # ------------------------------------------------------------------

    def get_tennis_matches(self, date_str: str | None = None, timeframe: str = "48h") -> list[dict]:
        """Get tennis matches from SofaScore scheduled events.

        Returns list of match dicts compatible with the tennis scanner:
        {player1, player2, tournament, date, surface, round, venue,
         odds: {winner: {P1: {bk: odds}, P2: {bk: odds}}},
         p1_ranking, p2_ranking, ...}
        """
        if not date_str:
            date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        events = self._get_scheduled_events(date_str)

        # Also fetch tomorrow if timeframe > 24h
        if timeframe in ("48h", "72h"):
            next_day = (datetime.strptime(date_str, "%Y-%m-%d").replace(
                tzinfo=timezone.utc) + __import__("datetime").timedelta(days=1)).strftime("%Y-%m-%d")
            events.extend(self._get_scheduled_events(next_day))

        matches: list[dict] = []
        seen_ids: set = set()

        for ev in events:
            try:
                ev_id = ev.get("id")
                if not ev_id or ev_id in seen_ids:
                    continue

                status_type = ev.get("status", {}).get("type", "")
                if status_type in ("finished", "cancelled"):
                    continue

                # Filter: only ATP, WTA, Grand Slam, Challenger events
                cat = ev.get("tournament", {}).get("category", {}).get("name", "")
                if "Exhibition" in cat or "ITF" in cat:
                    continue

                home = ev.get("homeTeam", {})
                away = ev.get("awayTeam", {})
                p1_name = home.get("name", "")
                p2_name = away.get("name", "")
                if not p1_name or not p2_name:
                    continue

                # Tournament info
                tourn = ev.get("tournament", {})
                unique_tourn = tourn.get("uniqueTournament", {})
                tournament_name = unique_tourn.get("name", tourn.get("name", ""))

                # Surface
                gt = ev.get("groundType", "")
                surface = _SURFACE_MAP.get(gt, gt) if gt else None

                # Round
                round_info = ev.get("roundInfo", {})
                round_name = round_info.get("name", f"R{round_info.get('round', '')}" if round_info.get("round") else None)

                # Date
                start_ts = ev.get("startTimestamp")
                if start_ts:
                    match_date = datetime.fromtimestamp(start_ts, tz=timezone.utc).isoformat()
                else:
                    match_date = ""

                # Fetch odds from SofaScore
                odds = self._get_event_odds(ev_id)

                seen_ids.add(ev_id)
                match = {
                    "player1": p1_name,
                    "player2": p2_name,
                    "tournament": tournament_name,
                    "date": match_date,
                    "venue": None,
                    "weather": None,
                    "surface": surface,
                    "round": round_name,
                    "odds": odds,
                    "p1_form": None,
                    "p2_form": None,
                    "p1_form_detail": [],
                    "p2_form_detail": [],
                    "p1_ranking": None,
                    "p2_ranking": None,
                    "p1_age": None,
                    "p2_age": None,
                    "p1_season_record": None,
                    "p2_season_record": None,
                    "p1_surface_record": None,
                    "p2_surface_record": None,
                    "p1_serve_pct": None,
                    "p2_serve_pct": None,
                    "p1_return_pct": None,
                    "p2_return_pct": None,
                    "p1_aces_avg": None,
                    "p2_aces_avg": None,
                    "p1_rest_days": None,
                    "p2_rest_days": None,
                    "p1_injuries": "RAS",
                    "p2_injuries": "RAS",
                    "h2h": None,
                    "h2h_surface": None,
                    "h2h_last3": [],
                    "motivation": None,
                    "context": None,
                    "_sofa_event": ev,  # Keep for enrichment
                }

                # Immediate enrichment (player stats, H2H)
                p1_id = home.get("id")
                p2_id = away.get("id")
                if p1_id:
                    self._enrich_player(match, "p1", p1_id, surface)
                if p2_id:
                    self._enrich_player(match, "p2", p2_id, surface)
                if p1_id and p2_id:
                    h2h = self._get_h2h(p1_id, p2_id, surface)
                    if h2h:
                        match["h2h"] = h2h.get("summary")
                        match["h2h_surface"] = h2h.get("surface_summary")
                        match["h2h_last3"] = h2h.get("last3", [])

                # Remove internal field before returning
                match.pop("_sofa_event", None)
                matches.append(match)

                time.sleep(0.05)  # Rate limiting
            except Exception as exc:
                logger.debug("SofaScore event parse error: %s", exc)
                continue

        logger.info("SofaScore tennis matches: %d events for %s", len(matches), date_str)
        return matches

    def _get_event_odds(self, event_id: int) -> dict:
        """Get odds for a tennis event from SofaScore.

        Returns: {winner: {P1: {bk_name: odds}, P2: {bk_name: odds}}}
        """
        cache_key = f"odds_{event_id}"
        cached = self._read_cache(cache_key)
        if cached is not None:
            return cached

        try:
            # SofaScore odds endpoint: provider 1 = pre-match, winning market
            resp = self._client.get(f"{API_BASE}/event/{event_id}/provider/1/winning")
            if resp.status_code != 200:
                # Fallback: try alternative odds endpoint
                resp = self._client.get(f"{API_BASE}/event/{event_id}/odds/1/all")
                if resp.status_code != 200:
                    return {"winner": {"P1": {}, "P2": {}}}

            data = resp.json()
            odds_p1: dict[str, float] = {}
            odds_p2: dict[str, float] = {}

            # Parse odds from SofaScore response
            markets = data.get("markets", [])
            if not markets:
                # Try alternative structure
                markets = [data] if data.get("choices") else []

            for market in markets:
                choices = market.get("choices", [])
                for choice in choices:
                    name = choice.get("name", "")
                    fractional = choice.get("fractionalValue", "")
                    decimal_odds = choice.get("sourceValue")

                    if decimal_odds is None and fractional:
                        try:
                            parts = fractional.split("/")
                            decimal_odds = float(parts[0]) / float(parts[1]) + 1
                        except Exception:
                            continue

                    if decimal_odds is None:
                        continue

                    try:
                        decimal_odds = float(decimal_odds)
                    except (ValueError, TypeError):
                        continue

                    if decimal_odds <= 1.0:
                        continue

                    # Determine which player (choice index or name matching)
                    change = choice.get("change", 0)
                    source_id = choice.get("sourceId", "")
                    bk_name = market.get("bookmaker", {}).get("name", "SofaScore")

                    # SofaScore typically lists home (P1) first, away (P2) second
                    winning = choice.get("winning")
                    if winning == "1" or choice.get("homeTeam"):
                        odds_p1[bk_name] = decimal_odds
                    elif winning == "2" or choice.get("awayTeam"):
                        odds_p2[bk_name] = decimal_odds
                    elif len(choices) == 2:
                        idx = choices.index(choice)
                        if idx == 0:
                            odds_p1[bk_name] = decimal_odds
                        else:
                            odds_p2[bk_name] = decimal_odds

            result = {"winner": {"P1": odds_p1, "P2": odds_p2}}
            self._write_cache(cache_key, result, ttl=1800)  # 30min for odds
            return result
        except Exception as e:
            logger.debug("SofaScore odds error for event %d: %s", event_id, e)
            return {"winner": {"P1": {}, "P2": {}}}

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
                logger.info(
                    "Sofascore: no match found for '%s' vs '%s' (normalized: '%s' | '%s')",
                    p1, p2, _normalize(p1), _normalize(p2),
                )
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

            # H2H between the two players (2 calls per pair, cached 7 days)
            if p1_id and p2_id and not m.get("h2h"):
                h2h = self._get_h2h(p1_id, p2_id, m.get("surface"))
                if h2h:
                    m["h2h"] = h2h.get("summary")
                    m["h2h_surface"] = h2h.get("surface_summary")
                    m["h2h_last3"] = h2h.get("last3", [])

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
        # Get player info (ranking + age)
        info = self._get_player_info(player_id)
        if info:
            team = info.get("team", {})
            if team.get("ranking"):
                match[f"{prefix}_ranking"] = team["ranking"]

            # Age from dateOfBirthTimestamp (already in the response, 0 extra calls)
            dob_ts = team.get("dateOfBirthTimestamp")
            if dob_ts:
                from datetime import timezone
                age = int((datetime.now(timezone.utc).timestamp() - dob_ts) / (365.25 * 86400))
                match[f"{prefix}_age"] = age

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
        total_bp_saved = 0
        total_bp_faced = 0
        total_tb_won = 0
        total_tb_played = 0
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
                    elif key == "breakPointsSaved":
                        total_bp_saved += item.get(f"{side}Value", 0)
                        total_bp_faced += item.get(f"{side}Total", 0)
                    elif key == "tiebreaks":
                        total_tb_won += item.get(f"{side}Value", 0)
                        total_tb_played += item.get(f"{side}Total", 0)

            matches_with_stats += 1
            time.sleep(0.1)  # Rate limiting

        result: dict[str, Any] = {
            "serve_pct": None,
            "return_pct": None,
            "aces_avg": None,
            "bp_saved_pct": None,
            "tb_win_pct": None,
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

        # Break points saved % (clutch metric)
        if total_bp_faced > 0:
            result["bp_saved_pct"] = round(total_bp_saved / total_bp_faced * 100, 1)

        # Tiebreak win %
        if total_tb_played > 0:
            result["tb_win_pct"] = round(total_tb_won / total_tb_played * 100, 1)

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

    def _get_h2h(self, p1_id: int, p2_id: int, surface: str | None = None) -> dict | None:
        """Get H2H between two players. Returns {summary, surface_summary, last3}."""
        cache_key = f"h2h_{min(p1_id, p2_id)}_{max(p1_id, p2_id)}"
        cached = self._read_cache(cache_key)
        if cached is not None:
            return cached

        try:
            resp = self._client.get(f"{API_BASE}/team/{p1_id}/matches-with/{p2_id}")
            if resp.status_code != 200:
                return None

            events = resp.json().get("events", [])
            if not events:
                return None

            p1_wins, p2_wins = 0, 0
            surface_p1, surface_p2 = 0, 0
            last3: list[str] = []
            surface_norm = _SURFACE_MAP.get(surface or "", surface or "")

            for e in events:
                if e.get("status", {}).get("type") != "finished":
                    continue
                wc = e.get("winnerCode", 0)
                home_id = e.get("homeTeam", {}).get("id")
                p1_is_home = (home_id == p1_id)
                p1_won = (wc == 1 and p1_is_home) or (wc == 2 and not p1_is_home)

                if p1_won:
                    p1_wins += 1
                else:
                    p2_wins += 1

                gt = e.get("groundType", "")
                if surface_norm and _SURFACE_MAP.get(gt, gt) == surface_norm:
                    if p1_won:
                        surface_p1 += 1
                    else:
                        surface_p2 += 1

                if len(last3) < 3:
                    hs = e.get("homeScore", {}).get("current", "?")
                    as_ = e.get("awayScore", {}).get("current", "?")
                    opp_name = e.get("awayTeam" if p1_is_home else "homeTeam", {}).get("name", "?")
                    result_char = "W" if p1_won else "L"
                    last3.append(f"{result_char} vs {opp_name} ({hs}-{as_})")

            total = p1_wins + p2_wins
            if total == 0:
                return None

            result = {
                "summary": f"{p1_wins}W {p2_wins}L",
                "surface_summary": f"{surface_p1}W {surface_p2}L on {surface_norm}" if surface_norm and (surface_p1 + surface_p2) > 0 else None,
                "last3": last3,
            }
            self._write_cache(cache_key, result, ttl=7 * 86400)  # 7 days
            return result
        except Exception as e:
            logger.debug("H2H fetch error %d vs %d: %s", p1_id, p2_id, e)
            return None

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
        return cache_get(f"sofa:{key}")

    def _write_cache(self, key: str, data: Any, ttl: int = CACHE_TTL):
        _cache_set_global(f"sofa:{key}", data, ttl=ttl)

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
    """Normalize a player name for matching.

    Handles: accents, hyphens, particles (de/van/del/von), initials.
    """
    import unicodedata
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = name.lower().strip()
    # Replace hyphens with space so "alcaraz-garfia" -> "alcaraz garfia"
    name = name.replace("-", " ").replace("_", " ")
    # Remove single-char tokens that are just initials (e.g. "n.") — keep surnames
    parts = [p.rstrip(".") for p in name.split() if p.rstrip(".")]
    # Drop common particles that vary across sources
    _PARTICLES = {"de", "van", "del", "von", "da", "di", "le", "la", "dos"}
    parts = [p for p in parts if p not in _PARTICLES or len(parts) <= 2]
    return " ".join(parts)


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
