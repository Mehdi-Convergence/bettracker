"""Scanner API endpoints for value bet detection."""

import random
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from src.api.schemas import (
    AIResearchResponse,
    AIScanMatch,
    AIScanResponse,
    MarketData,
    MarketSelection,
    MatchCardResponse,
    MatchDetailRequest,
    MatchDetailResponse,
    MatchWithMarkets,
    MultiMarketScanResponse,
    OutcomeDetail,
    ScanResponse,
    TeamPlayersResponse,
    ValueBetResponse,
)
from src.database import get_db

router = APIRouter(tags=["scanner"])

# --- Scan cache (in-memory, TTL 15 min) ---
CACHE_TTL_SECONDS = 900
_scan_cache: dict = {
    "results": None,
    "value_bets": None,
    "timestamp": None,
    "total": 0,
    "quota": None,
}

DEMO_BOOKMAKERS = ["bet365", "Pinnacle", "Unibet", "Betfair", "Winamax", "Betclic"]

DEMO_MATCHES = [
    ("E0", "Arsenal", "Chelsea"),
    ("E0", "Liverpool", "Man City"),
    ("E0", "Tottenham", "Aston Villa"),
    ("E0", "Newcastle", "Brighton"),
    ("E0", "Man United", "West Ham"),
    ("F1", "PSG", "Marseille"),
    ("F1", "Lyon", "Monaco"),
    ("F1", "Lille", "Lens"),
    ("F1", "Nice", "Rennes"),
    ("I1", "Inter", "AC Milan"),
    ("I1", "Juventus", "Napoli"),
    ("I1", "Roma", "Lazio"),
    ("I1", "Atalanta", "Fiorentina"),
    ("D1", "Bayern Munich", "Dortmund"),
    ("D1", "Leverkusen", "RB Leipzig"),
    ("D1", "Stuttgart", "Frankfurt"),
    ("SP1", "Real Madrid", "Barcelona"),
    ("SP1", "Atletico Madrid", "Sevilla"),
    ("SP1", "Real Sociedad", "Villarreal"),
    ("N1", "PSV", "Ajax"),
    ("N1", "Feyenoord", "AZ Alkmaar"),
    ("P1", "Benfica", "Porto"),
    ("P1", "Sporting CP", "Braga"),
    ("B1", "Club Brugge", "Anderlecht"),
    ("T1", "Galatasaray", "Fenerbahce"),
    ("SC0", "Celtic", "Rangers"),
    ("E1", "Leeds", "Sheffield Utd"),
    ("E1", "Burnley", "Sunderland"),
    ("D2", "Hamburg", "Koln"),
    ("F2", "Saint-Etienne", "Metz"),
    ("I2", "Palermo", "Sampdoria"),
    ("SP2", "Zaragoza", "Racing Santander"),
    ("G1", "Olympiacos", "Panathinaikos"),
]


def _generate_demo_matches() -> list[MatchCardResponse]:
    """Generate demo match cards with all 3 outcomes and multiple bookmaker odds."""
    rng = random.Random(42)
    result: list[MatchCardResponse] = []
    today = datetime.now()

    for league, home, away in DEMO_MATCHES:
        hour = rng.choice([13, 14, 15, 16, 17, 18, 19, 20, 21])
        minute = rng.choice([0, 0, 15, 30, 45])
        match_dt = (today + timedelta(days=rng.randint(0, 10))).replace(
            hour=hour, minute=minute, second=0
        )
        match_date = match_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

        # Generate 3 model probs that sum to ~1
        raw = [rng.uniform(0.20, 0.60) for _ in range(3)]
        total = sum(raw)
        probs = [p / total for p in raw]

        outcomes: dict[str, OutcomeDetail] = {}
        best_value_outcome = None
        best_edge = 0.0

        for i, outcome_key in enumerate(["H", "D", "A"]):
            model_prob = round(probs[i], 4)

            # Generate odds for 3-5 bookmakers
            n_bk = rng.randint(3, 5)
            selected_bk = rng.sample(DEMO_BOOKMAKERS, n_bk)
            base_implied = rng.uniform(max(0.10, model_prob - 0.12), model_prob + 0.05)
            base_implied = max(0.05, min(0.90, base_implied))
            all_odds: dict[str, float] = {}
            for bk in selected_bk:
                noise = rng.uniform(-0.03, 0.03)
                ip = max(0.05, base_implied + noise)
                all_odds[bk] = round(1.0 / ip, 2)

            # Best odds across bookmakers
            best_bk = max(all_odds, key=lambda k: all_odds[k])
            bo = all_odds[best_bk]
            implied_prob = round(1.0 / bo, 4)
            edge = round(model_prob - implied_prob, 4)
            is_value = edge > 0.02

            outcomes[outcome_key] = OutcomeDetail(
                outcome=outcome_key,
                best_odds=bo,
                best_bookmaker=best_bk,
                all_odds=all_odds,
                model_prob=model_prob,
                implied_prob=implied_prob,
                edge=edge,
                is_value=is_value,
            )

            if is_value and edge > best_edge:
                best_edge = edge
                best_value_outcome = outcome_key

        result.append(
            MatchCardResponse(
                home_team=home,
                away_team=away,
                league=league,
                date=match_date,
                outcomes=outcomes,
                best_value_outcome=best_value_outcome,
                best_edge=round(best_edge, 4),
            )
        )

    return result


def _matches_to_value_bets(matches: list[MatchCardResponse]) -> list[ValueBetResponse]:
    """Convert match cards to flat value bets (backward compat)."""
    bets = []
    for m in matches:
        for o in m.outcomes.values():
            if o.is_value:
                bets.append(
                    ValueBetResponse(
                        home_team=m.home_team,
                        away_team=m.away_team,
                        league=m.league,
                        date=m.date,
                        outcome=o.outcome,
                        model_prob=o.model_prob,
                        implied_prob=o.implied_prob,
                        edge=o.edge,
                        best_odds=o.best_odds,
                        bookmaker=o.best_bookmaker,
                    )
                )
    return bets


def _apply_filters(
    all_matches: list[MatchCardResponse],
    min_edge: float | None,
    min_prob: float | None,
    min_odds: float | None,
    max_odds: float | None,
    outcomes: list[str] | None,
    excluded_leagues: list[str] | None,
) -> list[MatchCardResponse]:
    """Post-filter matches by edge, prob, odds, outcomes, leagues."""
    filtered_matches = []
    edge_threshold = min_edge or 0.0
    for m in all_matches:
        if excluded_leagues and m.league in excluded_leagues:
            continue
        has_any_value = any(o.edge >= edge_threshold for o in m.outcomes.values())
        if min_prob is not None and not any(
            o.model_prob >= min_prob for o in m.outcomes.values()
        ):
            continue
        if not has_any_value and edge_threshold > 0:
            continue
        if min_odds is not None or max_odds is not None or outcomes is not None:
            has_valid = False
            for o in m.outcomes.values():
                if outcomes and o.outcome not in outcomes:
                    continue
                if min_odds is not None and o.best_odds < min_odds:
                    continue
                if max_odds is not None and o.best_odds > max_odds:
                    continue
                if o.edge >= edge_threshold:
                    has_valid = True
                    break
            if not has_valid:
                continue
        filtered_matches.append(m)
    filtered_matches.sort(key=lambda m: m.best_edge, reverse=True)
    return filtered_matches


def get_scanned_matches(
    demo: bool = False,
    min_edge: float | None = None,
    min_prob: float | None = None,
    min_odds: float | None = None,
    max_odds: float | None = None,
    outcomes: list[str] | None = None,
    excluded_leagues: list[str] | None = None,
    force_refresh: bool = False,
) -> tuple[list[MatchCardResponse], int, int | None, bool, str | None]:
    """Core scan logic returning (filtered_matches, total_scanned, quota_remaining, is_cached, cached_at).

    Used by both /scanner/value-bets and /campaigns/{id}/recommendations.
    """
    quota_remaining = None
    is_cached = False
    cached_at = None

    if demo:
        all_matches = _generate_demo_matches()
    elif not force_refresh and _scan_cache["results"] is not None and _scan_cache["timestamp"] is not None:
        elapsed = time.time() - _scan_cache["timestamp"]
        if elapsed < CACHE_TTL_SECONDS:
            all_matches = _scan_cache["results"]
            quota_remaining = _scan_cache["quota"]
            is_cached = True
            cached_at = datetime.fromtimestamp(_scan_cache["timestamp"]).isoformat()
            # Skip to filtering
            total_scanned = _scan_cache["total"]
            # Post-filter
            filtered_matches = _apply_filters(
                all_matches, min_edge, min_prob, min_odds, max_odds, outcomes, excluded_leagues
            )
            return filtered_matches, total_scanned, quota_remaining, is_cached, cached_at
    if not demo:
        model_path = Path("models/football")
        if not (model_path / "model.joblib").exists():
            raise HTTPException(
                status_code=503, detail="No trained model. Run 'train' first."
            )

        from src.api.schemas import OutcomeDetail as OD
        from src.services.scanner import Scanner

        scanner = Scanner(model_path=model_path)
        if min_edge is not None:
            scanner.value_detector.min_edge = min_edge

        match_outcomes = scanner.scan_matches()

        try:
            quota_remaining = scanner.odds_collector.get_quota().get("remaining")
        except Exception:
            pass

        all_matches = []
        for mo in match_outcomes:
            oc = {}
            for key, data in mo.outcomes.items():
                oc[key] = OD(
                    outcome=key,
                    best_odds=data["best_odds"],
                    best_bookmaker=data["best_bookmaker"],
                    all_odds=data["all_odds"],
                    model_prob=data["model_prob"],
                    implied_prob=data["implied_prob"],
                    edge=data["edge"],
                    is_value=data["is_value"],
                )
            all_matches.append(
                MatchCardResponse(
                    home_team=mo.home_team,
                    away_team=mo.away_team,
                    league=mo.league,
                    date=mo.date,
                    outcomes=oc,
                    best_value_outcome=mo.best_value_outcome,
                    best_edge=mo.best_edge,
                )
            )

    total_scanned = len(all_matches)

    # Update cache for live (non-demo) scans
    if not demo and not is_cached:
        _scan_cache["results"] = all_matches
        _scan_cache["timestamp"] = time.time()
        _scan_cache["total"] = total_scanned
        _scan_cache["quota"] = quota_remaining

    filtered_matches = _apply_filters(
        all_matches, min_edge, min_prob, min_odds, max_odds, outcomes, excluded_leagues
    )

    return filtered_matches, total_scanned, quota_remaining, is_cached, cached_at


@router.get("/scanner/value-bets", response_model=ScanResponse)
def scan_value_bets(
    min_prob: Optional[float] = Query(default=None, description="Min model probability"),
    max_odds: Optional[float] = Query(default=None, description="Max odds"),
    min_odds: Optional[float] = Query(default=None, description="Min odds"),
    min_edge: Optional[float] = Query(default=None, description="Min edge threshold"),
    outcomes: Optional[str] = Query(default=None, description="Comma-separated: H,D,A"),
    demo: bool = Query(default=False, description="Use demo data instead of live API"),
    force: bool = Query(default=False, description="Force refresh, bypass cache"),
):
    """Scan upcoming matches for value bets using the trained model."""
    outcome_list = outcomes.split(",") if outcomes else None

    filtered_matches, total_scanned, quota_remaining, is_cached, cached_at = get_scanned_matches(
        demo=demo,
        min_edge=min_edge,
        min_prob=min_prob,
        min_odds=min_odds,
        max_odds=max_odds,
        outcomes=outcome_list,
        force_refresh=force,
    )

    return ScanResponse(
        matches=filtered_matches,
        value_bets=_matches_to_value_bets(filtered_matches),
        total_matches_scanned=total_scanned,
        api_quota_remaining=quota_remaining,
        cached=is_cached,
        cached_at=cached_at,
    )


@router.post("/scanner/match-details", response_model=MatchDetailResponse)
def get_match_details(
    req: MatchDetailRequest,
    db: Session = Depends(get_db),
):
    """Get detailed stats for a specific match."""
    from src.services.match_detail import MatchDetailService

    service = MatchDetailService()
    return service.get_match_detail(
        home_team=req.home_team,
        away_team=req.away_team,
        league=req.league,
        date=req.date,
        db=db,
    )


@router.get("/scanner/team-players", response_model=TeamPlayersResponse)
def get_team_players(
    team: str = Query(..., description="Team name (e.g. Arsenal)"),
    league: str = Query(default="", description="League code (e.g. E0)"),
    force: bool = Query(default=False, description="Force re-scrape, bypass cache"),
):
    """Get player injuries and stats for a team (scraped from Transfermarkt)."""
    from src.data.football_scraper import get_team_data

    result = get_team_data(team, force=force)
    return TeamPlayersResponse(**result)


# ---------------------------------------------------------------------------
# Multi-Market endpoints (Betclic scraping)
# ---------------------------------------------------------------------------


@router.get("/scanner/matches", response_model=MultiMarketScanResponse)
async def scan_matches_multi_market(
    live: bool = Query(default=False, description="Get live matches"),
    force: bool = Query(default=False, description="Force refresh"),
):
    """Scan matches with all markets via Betclic scraping + Poisson model."""
    from src.data.odds_aggregator import OddsAggregator
    from src.ml.goals_model import PoissonGoalsModel

    aggregator = OddsAggregator()
    poisson = PoissonGoalsModel()

    # 1. Get matches from Betclic (or fallback)
    matches_raw, source = await aggregator.get_matches(live=live, force=force)

    if not matches_raw:
        return MultiMarketScanResponse(
            matches=[],
            total_matches_scanned=0,
            source=source,
            cached=not force,
            cached_at=aggregator.get_cached_at(),
        )

    # 2. For each match, scrape detail page for all markets
    result_matches: list[MatchWithMarkets] = []
    for m in matches_raw:
        match_url = m.get("url", "")

        # Scrape all markets from the match detail page
        detail = {}
        if match_url:
            try:
                detail = await aggregator.get_match_detail(match_url, force=force)
            except Exception:
                pass

        raw_markets = detail.get("markets", [])

        # 3. Compute Poisson probabilities for model_prob on each selection
        # Use simple estimation from 1X2 odds if available
        odds_data = m.get("odds", {})
        poisson_probs = _compute_poisson_probs(odds_data, poisson, raw_markets)

        # Build MarketData list with model_prob
        markets: list[MarketData] = []
        for mkt in raw_markets:
            market_type = mkt.get("market_type", "unknown")
            raw_sels = mkt.get("selections", [])

            selections = []
            for idx, sel in enumerate(raw_sels):
                name = sel["name"]
                odds_val = sel["odds"]
                implied = round(1.0 / odds_val, 4) if odds_val > 0 else 0.0
                m_prob = _find_model_prob(
                    name, poisson_probs, market_type, idx, len(raw_sels)
                )
                edge = round(m_prob - implied, 4) if m_prob is not None else None

                selections.append(MarketSelection(
                    name=name,
                    odds=odds_val,
                    bookmaker="betclic",
                    all_odds={"betclic": odds_val},
                    model_prob=round(m_prob, 4) if m_prob is not None else None,
                    implied_prob=implied,
                    edge=edge,
                ))

            markets.append(MarketData(
                market_type=market_type,
                market_name=mkt.get("market_name", ""),
                selections=selections,
            ))

        # 4. Build 1X2 outcomes for backward compat
        outcomes = _build_1x2_outcomes(markets, odds_data)

        # Best value across ALL markets (not just 1X2)
        best_val_out = None
        best_edge = 0.0
        # First check 1X2 outcomes
        for key, od in outcomes.items():
            if od.is_value and od.edge > best_edge:
                best_edge = od.edge
                best_val_out = key
        # Then check all markets for best edge overall (keep best_val_out as 1X2 key only)
        for mkt in markets:
            for sel in mkt.selections:
                if sel.edge is not None and sel.edge > best_edge:
                    best_edge = sel.edge

        result_matches.append(MatchWithMarkets(
            home_team=m.get("home_team", detail.get("home_team", "")),
            away_team=m.get("away_team", detail.get("away_team", "")),
            league=m.get("league", ""),
            league_name=m.get("league_name", ""),
            date=m.get("date", ""),
            is_live=m.get("is_live", False),
            score=m.get("score"),
            timer=m.get("timer", ""),
            url=match_url,
            markets=markets,
            outcomes=outcomes,
            best_value_outcome=best_val_out,
            best_edge=round(best_edge, 4),
        ))

    # Sort by best edge descending
    result_matches.sort(key=lambda x: x.best_edge, reverse=True)

    return MultiMarketScanResponse(
        matches=result_matches,
        total_matches_scanned=len(matches_raw),
        source=source,
        cached=not force,
        cached_at=aggregator.get_cached_at(),
        api_quota_remaining=aggregator.get_quota().get("remaining"),
    )


@router.get("/scanner/live", response_model=MultiMarketScanResponse)
async def get_live_matches():
    """Get live football matches with odds (Betclic)."""
    return await scan_matches_multi_market(live=True, force=False)


def _compute_poisson_probs(
    odds_data: dict,
    poisson: "PoissonGoalsModel",
    raw_markets: list[dict] | None = None,
) -> dict[str, dict[str, float]]:
    """Estimate Poisson probabilities from 1X2 implied odds.

    Tries two sources: odds_data (from overview) or the 1X2 market in raw_markets.
    """
    h_odds = 0.0
    a_odds = 0.0

    # Source 1: odds_data dict (from overview page)
    h_odds_dict = odds_data.get("H", {})
    a_odds_dict = odds_data.get("A", {})
    if h_odds_dict:
        h_odds = max(h_odds_dict.values()) if isinstance(h_odds_dict, dict) else float(h_odds_dict)
    if a_odds_dict:
        a_odds = max(a_odds_dict.values()) if isinstance(a_odds_dict, dict) else float(a_odds_dict)

    # Source 2: from scraped 1X2 market (more reliable)
    if (h_odds <= 1 or a_odds <= 1) and raw_markets:
        for mkt in raw_markets:
            if mkt.get("market_type") == "1x2":
                sels = mkt.get("selections", [])
                if len(sels) >= 3:
                    h_odds = sels[0].get("odds", 0)
                    a_odds = sels[-1].get("odds", 0)
                break

    if h_odds <= 1 or a_odds <= 1:
        return {}

    # Rough lambda estimation from implied probabilities
    implied_h = 1.0 / h_odds
    implied_a = 1.0 / a_odds

    # Use a simple mapping: higher implied prob -> higher lambda
    # Average football match: ~1.4 home goals, ~1.1 away goals
    lambda_h = 0.5 + implied_h * 2.5  # Range roughly 0.7 - 3.0
    lambda_a = 0.5 + implied_a * 2.5

    lambda_h = max(0.3, min(4.0, lambda_h))
    lambda_a = max(0.3, min(4.0, lambda_a))

    return poisson.get_all_market_probs(lambda_h, lambda_a)


def _find_model_prob(
    selection_name: str,
    all_poisson_probs: dict[str, dict[str, float]],
    market_type: str = "",
    sel_index: int = 0,
    total_sels: int = 0,
) -> float | None:
    """Find the model probability for a selection name.

    Uses market_type and position to properly map Betclic French names
    to Poisson model keys. all_poisson_probs is the full Poisson output
    (market_key -> {selection_key: prob}).
    """
    if not all_poisson_probs:
        return None

    name_lower = selection_name.lower().strip()

    # --- 1X2: position-based (Home=0, Draw="nul", Away=last) ---
    if market_type == "1x2":
        probs = all_poisson_probs.get("1x2", {})
        if "nul" in name_lower:
            return probs.get("D")
        if sel_index == 0:
            return probs.get("H")
        if sel_index == total_sels - 1:
            return probs.get("A")
        return None

    # --- Double Chance: match pattern ---
    if market_type == "double_chance":
        probs = all_poisson_probs.get("double_chance", {})
        if " ou nul" in name_lower and sel_index == 0:
            return probs.get("1X")
        if " ou " in name_lower and "nul" not in name_lower:
            return probs.get("12")
        if "nul ou " in name_lower:
            return probs.get("X2")
        return None

    # --- Over/Under: extract line number, look up correct sub-market ---
    if market_type == "over_under":
        num = _extract_number(selection_name)
        if num:
            probs = all_poisson_probs.get(f"over_under_{num}", {})
            if any(w in name_lower for w in ["plus", "+"]):
                return probs.get(f"O{num}")
            if any(w in name_lower for w in ["moins", "-"]):
                return probs.get(f"U{num}")
        return None

    # --- BTTS ---
    if market_type == "btts":
        probs = all_poisson_probs.get("btts", {})
        if "oui" in name_lower:
            return probs.get("Oui")
        if "non" in name_lower:
            return probs.get("Non")
        return None

    # --- Half-Time Result ---
    if market_type in ("half_time_result", "half_time_2_result"):
        probs = all_poisson_probs.get("half_time_result", {})
        if "nul" in name_lower:
            return probs.get("D")
        if sel_index == 0:
            return probs.get("H")
        if sel_index == total_sels - 1:
            return probs.get("A")
        return None

    # --- Correct Score: match "X - Y" pattern ---
    if market_type == "correct_score":
        import re
        probs = all_poisson_probs.get("correct_score", {})
        score_match = re.search(r"(\d+)\s*[-:]\s*(\d+)", selection_name)
        if score_match:
            key = f"{score_match.group(1)} - {score_match.group(2)}"
            return probs.get(key)
        return None

    # --- Team Totals: extract line and team direction ---
    if market_type == "team_total":
        num = _extract_number(selection_name)
        if num:
            # Try both home and away team totals
            for team_label in ("home", "away"):
                probs = all_poisson_probs.get(f"team_total_{team_label}_{num}", {})
                if probs:
                    if any(w in name_lower for w in ["plus", "+"]):
                        val = probs.get(f"O{num}")
                        if val is not None:
                            return val
                    if any(w in name_lower for w in ["moins", "-"]):
                        val = probs.get(f"U{num}")
                        if val is not None:
                            return val
        return None

    # --- Goal Margin ---
    if market_type == "goal_margin":
        probs = all_poisson_probs.get("goal_margin", {})
        for key, prob in probs.items():
            if key.lower() == name_lower:
                return prob
        return None

    return None


def _extract_number(s: str) -> str | None:
    """Extract a number from a string (e.g., '+ de 2,5' -> '2.5')."""
    import re
    m = re.search(r"(\d+[.,]\d+|\d+)", s)
    if m:
        return m.group(1).replace(",", ".")
    return None


def _build_1x2_outcomes(
    markets: list[MarketData], odds_data: dict
) -> dict[str, OutcomeDetail]:
    """Extract 1X2 outcomes from markets for backward compatibility."""
    outcomes: dict[str, OutcomeDetail] = {}

    # Find the 1X2 market
    market_1x2 = None
    for mkt in markets:
        if mkt.market_type == "1x2":
            market_1x2 = mkt
            break

    if not market_1x2:
        return outcomes

    outcome_map = {"H": None, "D": None, "A": None}

    for sel in market_1x2.selections:
        name = sel.name.lower()
        if "nul" in name:
            outcome_map["D"] = sel
        elif sel == market_1x2.selections[0]:
            outcome_map["H"] = sel
        elif sel == market_1x2.selections[-1]:
            outcome_map["A"] = sel

    for key in ["H", "D", "A"]:
        sel = outcome_map.get(key)
        if sel:
            m_prob = sel.model_prob or 0.0
            implied = sel.implied_prob
            edge = sel.edge or 0.0
            is_value = edge > 0.02

            outcomes[key] = OutcomeDetail(
                outcome=key,
                best_odds=sel.odds,
                best_bookmaker="betclic",
                all_odds=sel.all_odds,
                model_prob=m_prob,
                implied_prob=implied,
                edge=edge,
                is_value=is_value,
            )

    return outcomes


# ---------------------------------------------------------------------------
# AI Research endpoints (Claude Code powered)
# ---------------------------------------------------------------------------


@router.get("/scanner/ai-scan", response_model=AIScanResponse)
async def ai_scan(
    sport: str = Query(default="football", description="football or tennis"),
    leagues: str = Query(default="", description="Comma-separated league codes"),
    timeframe: str = Query(default="48h", description="24h, 48h, 72h, or 1w"),
    force: bool = Query(default=False, description="Force refresh, bypass cache"),
    cache_only: bool = Query(default=False, description="Only return cached data"),
):
    """Scan matches via API-Football (football) or Claude (tennis)."""
    import asyncio
    import hashlib
    import json as _json
    import time as _time

    league_list = [lg.strip() for lg in leagues.split(",") if lg.strip()]

    if sport == "tennis":
        return await _ai_scan_tennis(league_list, timeframe, force, cache_only)

    # --- Football via API-Football ---
    from src.data.api_football_client import ApiFootballClient, CACHE_DIR as AF_CACHE_DIR
    from src.services.probability_calculator import calculate_football

    # Scan-level cache (processed results, 30min TTL)
    scan_key = hashlib.md5(f"football_{','.join(sorted(league_list))}_{timeframe}".encode()).hexdigest()[:12]
    scan_cache_file = AF_CACHE_DIR / f"scan_result_{scan_key}.json"
    SCAN_CACHE_TTL = 1800  # 30 min

    if not force:
        if scan_cache_file.exists():
            try:
                cached = _json.loads(scan_cache_file.read_text(encoding="utf-8"))
                age = _time.time() - cached.get("_cached_at", 0)
                if age < SCAN_CACHE_TTL or cache_only:
                    raw = cached.get("matches", [])
                    return AIScanResponse(
                        matches=[AIScanMatch(**m) for m in raw],
                        sport="football",
                        source="api_football",
                        cached=True,
                        cached_at=datetime.fromtimestamp(cached["_cached_at"]).isoformat(),
                        research_duration_seconds=cached.get("duration", 0.0),
                    )
            except Exception:
                pass
        if cache_only:
            return AIScanResponse(matches=[], sport="football", source="api_football",
                                  cached=False, cached_at=None, research_duration_seconds=0.0)

    t0 = _time.time()
    client = ApiFootballClient()

    # 1. Fixtures
    fixtures = await client.get_fixtures(league_list or list(client.__class__.__dict__.get("LEAGUE_ID_MAP", {}).keys()), timeframe)
    if not fixtures:
        from src.data.api_football_client import LEAGUE_ID_MAP
        fixtures = await client.get_fixtures(list(LEAGUE_ID_MAP.keys()), timeframe)

    now = datetime.now()
    matches_out: list[AIScanMatch] = []

    # Per-league topscorers cache (one fetch per league)
    topscorers_cache: dict[int, list[dict]] = {}

    async def _process_fixture(fix: dict) -> AIScanMatch | None:
        try:
            fid = fix["fixture"]["id"]
            home_id = fix["teams"]["home"]["id"]
            away_id = fix["teams"]["away"]["id"]
            league_id = fix["league"]["id"]
            home_name = fix["teams"]["home"]["name"]
            away_name = fix["teams"]["away"]["name"]
            league_name = fix["league"]["name"]
            venue_name = fix.get("fixture", {}).get("venue", {}).get("name")
            fixture_dt_str = fix["fixture"].get("date", "")
            fixture_dt = datetime.fromisoformat(fixture_dt_str.replace("Z", "+00:00")).replace(tzinfo=None) if fixture_dt_str else now
            minutes_until = (fixture_dt - now).total_seconds() / 60

            # Parallel data fetches
            standings_list, h2h_raw, injuries, stats_h, stats_a, odds = await asyncio.gather(
                client.get_standings(league_id),
                client.get_h2h(home_id, away_id),
                client.get_injuries(fid),
                client.get_team_stats(home_id, league_id),
                client.get_team_stats(away_id, league_id),
                client.get_odds(fid),
            )

            # Topscorers (per league, cached)
            if league_id not in topscorers_cache:
                topscorers_cache[league_id] = await client.get_topscorers(league_id)
            topscorers = topscorers_cache[league_id]

            # Positions from standings
            home_rank = client._find_rank(standings_list, home_id)
            away_rank = client._find_rank(standings_list, away_id)

            # Form strings (API returns WWDLW → convert to VVNDN)
            form_home = client.form_to_bettracker(stats_h.get("form", ""))
            form_away = client.form_to_bettracker(stats_a.get("form", ""))

            # Home-specific form
            form_home_home = None
            form_away_away = None
            if stats_h.get("wins_home") is not None:
                ph = stats_h.get("played_home") or 1
                # Reconstruct rough home form from win/draw/loss counts (not sequential)
                # Use as goals averages instead — sequential form not available per venue
                pass

            # Injuries per team
            inj_home = [i for i in injuries if i.get("team_id") == home_id]
            inj_away = [i for i in injuries if i.get("team_id") == away_id]
            inj_home_ids = [i["player_id"] for i in inj_home]
            inj_away_ids = [i["player_id"] for i in inj_away]
            abs_home = [i["player_name"] for i in inj_home]
            abs_away = [i["player_name"] for i in inj_away]

            # Key players
            key_players_home = await client.get_team_key_players(home_id, league_id, inj_home_ids, topscorers)
            key_players_away = await client.get_team_key_players(away_id, league_id, inj_away_ids, topscorers)

            # Top scorer goals/match (for absence weight)
            home_top_gpm = key_players_home[0]["goals_per_match"] if key_players_home else 0.0
            away_top_gpm = key_players_away[0]["goals_per_match"] if key_players_away else 0.0

            # Lineup — always fetch presumed; confirmed only if < 2h
            lineup_status = "presumed"
            lineup_home_list: list[dict] = []
            lineup_away_list: list[dict] = []
            if minutes_until < 120:
                confirmed = await client.get_lineup(fid)
                if confirmed:
                    lineup_status = "confirmed"
                    for team_name, players in confirmed.items():
                        if home_name.lower() in team_name.lower():
                            lineup_home_list = players
                        else:
                            lineup_away_list = players
            if not lineup_home_list:
                lineup_home_list = await client.get_presumed_lineup(home_id, inj_home_ids)
            if not lineup_away_list:
                lineup_away_list = await client.get_presumed_lineup(away_id, inj_away_ids)

            # Goals averages (venue-specific)
            gs_h = stats_h.get("goals_scored_avg_home")
            gc_h = stats_h.get("goals_conceded_avg_home")
            gs_a = stats_a.get("goals_scored_avg_away")
            gc_a = stats_a.get("goals_conceded_avg_away")

            # Cotes 1X2
            odds_1x2 = odds.get("1x2", {})
            def _best(d: dict) -> float:
                return max((float(v) for v in d.values() if v), default=0.0) if d else 0.0
            odds_h_val = _best(odds_1x2.get("H", {}))
            odds_d_val = _best(odds_1x2.get("D", {}))
            odds_a_val = _best(odds_1x2.get("A", {}))

            # Probability calculation
            calc = calculate_football(
                odds_h=odds_h_val, odds_d=odds_d_val, odds_a=odds_a_val,
                form_home=form_home, form_away=form_away,
                position_home=home_rank, position_away=away_rank,
                h2h_summary=client._h2h_summary(h2h_raw, home_id) if h2h_raw else None,
                h2h_details=h2h_raw,
                home_team_id=home_id,
                key_absences_home=abs_home, key_absences_away=abs_away,
                home_top_scorer_gpm=home_top_gpm,
                away_top_scorer_gpm=away_top_gpm,
                lineup_confirmed=(lineup_status == "confirmed"),
                home_goals_scored_avg=gs_h,
                home_goals_conceded_avg=gc_h,
                away_goals_scored_avg=gs_a,
                away_goals_conceded_avg=gc_a,
                xg_home=stats_h.get("home_xg_avg"),
                xg_away=stats_a.get("away_xg_avg"),
                btts_pct_home=stats_h.get("home_btts_pct"),
                btts_pct_away=stats_a.get("away_btts_pct"),
            )

            # H2H summary and avg goals
            h2h_goals = None
            if h2h_raw:
                goals = [m.get("score_h", 0) + m.get("score_a", 0) for m in h2h_raw
                         if m.get("score_h") is not None]
                if goals:
                    h2h_goals = round(sum(goals) / len(goals), 2)

            # Streak from form
            def _streak(form: str) -> str | None:
                if not form:
                    return None
                last = form[-1]
                count = 0
                for c in reversed(form):
                    if c == last:
                        count += 1
                    else:
                        break
                labels = {"V": "victoire", "N": "nul", "D": "defaite"}
                return f"{count} {labels.get(last, last)} de suite" if count >= 2 else None

            return AIScanMatch(
                sport="football",
                home_team=home_name,
                away_team=away_name,
                league=league_name,
                date=fixture_dt_str,
                venue=venue_name,
                odds=odds,
                form_home=form_home or None,
                form_away=form_away or None,
                form_home_home=form_home_home,
                form_away_away=form_away_away,
                position_home=home_rank,
                position_away=away_rank,
                key_absences_home=abs_home,
                key_absences_away=abs_away,
                h2h_summary=client._h2h_summary(h2h_raw, home_id) if h2h_raw else None,
                h2h_avg_goals=h2h_goals,
                h2h_details=h2h_raw,
                fixture_id=fid,
                lineup_status=lineup_status,
                lineup_home=lineup_home_list,
                lineup_away=lineup_away_list,
                key_players_home=key_players_home,
                key_players_away=key_players_away,
                # Team stats
                home_goals_scored_avg5=gs_h,
                home_goals_conceded_avg5=gc_h,
                away_goals_scored_avg5=gs_a,
                away_goals_conceded_avg5=gc_a,
                home_clean_sheets=stats_h.get("clean_sheets_home"),
                away_clean_sheets=stats_a.get("clean_sheets_away"),
                home_btts_pct=stats_h.get("home_btts_pct"),
                away_btts_pct=stats_a.get("away_btts_pct"),
                home_possession_avg=stats_h.get("home_possession_avg"),
                away_possession_avg=stats_a.get("away_possession_avg"),
                home_shots_pg=stats_h.get("home_shots_pg"),
                away_shots_pg=stats_a.get("away_shots_pg"),
                home_top_scorer=key_players_home[0]["name"] if key_players_home else None,
                away_top_scorer=key_players_away[0]["name"] if key_players_away else None,
                home_current_streak=_streak(form_home),
                away_current_streak=_streak(form_away),
                # Probability results
                model_prob_home=calc.home_prob,
                model_prob_draw=calc.draw_prob,
                model_prob_away=calc.away_prob,
                edges=calc.edges,
                data_quality=calc.data_quality,
                data_score=calc.data_score,
                lambda_home=calc.lambda_home,
                lambda_away=calc.lambda_away,
            )
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error("Error processing fixture %s: %s", fix.get("fixture", {}).get("id"), exc)
            return None

    # Process all fixtures (concurrently, max 2 at a time to respect rate limits)
    sem = asyncio.Semaphore(2)
    async def _guarded(fix):
        async with sem:
            return await _process_fixture(fix)

    results = await asyncio.gather(*[_guarded(f) for f in fixtures])
    matches_out = [m for m in results if m is not None]

    duration = _time.time() - t0

    # Save scan result cache
    try:
        scan_cache_file.write_text(
            _json.dumps({
                "_cached_at": _time.time(),
                "duration": duration,
                "matches": [m.model_dump() for m in matches_out],
            }, ensure_ascii=False, default=str),
            encoding="utf-8",
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Failed to save scan result cache: %s", exc)

    return AIScanResponse(
        matches=matches_out,
        sport="football",
        source="api_football",
        cached=False,
        cached_at=None,
        research_duration_seconds=round(duration, 2),
    )


async def _ai_scan_tennis(league_list, timeframe, force, cache_only):
    """Tennis scan via Claude (API-Football doesn't cover tennis)."""
    import json as _json
    import time as _time
    from src.data.claude_researcher import ClaudeResearcher, CACHE_DIR
    from src.services.probability_calculator import calculate_tennis

    researcher = ClaudeResearcher()

    if cache_only:
        best_file = None
        best_ts = 0.0
        if CACHE_DIR.exists():
            for f in CACHE_DIR.rglob("scan_*.json"):
                try:
                    data = _json.loads(f.read_text(encoding="utf-8"))
                    ts = data.get("_cached_at", 0)
                    if ts > best_ts:
                        best_ts = ts
                        best_file = (f, data)
                except Exception:
                    pass
        if best_file:
            _, data = best_file
            result = data
            result["_from_cache"] = True
        else:
            return AIScanResponse(matches=[], sport="tennis", source="claude_code",
                                  cached=False, cached_at=None, research_duration_seconds=0.0)
    else:
        result = await researcher.scan_matches(
            sport="tennis", leagues=league_list or None, timeframe=timeframe, force=force
        )

    raw_matches = result.get("matches", [])
    duration = result.get("_duration_seconds", 0.0)
    from_cache = result.get("_from_cache", False)
    cached_at_ts = result.get("_cached_at")

    matches = []
    for m in raw_matches:
        try:
            odds = m.get("odds", {})
            odds_winner = odds.get("winner", {}) if isinstance(odds, dict) else {}
            def _best_odds(val) -> float:
                if isinstance(val, dict):
                    return max((float(v) for v in val.values() if v), default=0.0)
                return float(val or 0)
            odds_p1 = _best_odds(odds_winner.get("P1", 0))
            odds_p2 = _best_odds(odds_winner.get("P2", 0))
            abs_p1 = [m["p1_injuries"]] if m.get("p1_injuries") and m["p1_injuries"] != "RAS" else []
            abs_p2 = [m["p2_injuries"]] if m.get("p2_injuries") and m["p2_injuries"] != "RAS" else []
            calc = calculate_tennis(
                odds_p1=odds_p1, odds_p2=odds_p2,
                form_p1=m.get("p1_form"), form_p2=m.get("p2_form"),
                ranking_p1=m.get("p1_ranking"), ranking_p2=m.get("p2_ranking"),
                h2h_summary=m.get("h2h"),
                absences_p1=abs_p1, absences_p2=abs_p2,
            )
            matches.append(AIScanMatch(
                sport="tennis",
                player1=m.get("player1"), player2=m.get("player2"),
                league=m.get("tournament", ""), date=m.get("date", ""),
                venue=m.get("venue"), odds=odds,
                form_home=m.get("p1_form"), form_away=m.get("p2_form"),
                form_home_detail=m.get("p1_form_detail", []) or [],
                form_away_detail=m.get("p2_form_detail", []) or [],
                key_absences_home=abs_p1, key_absences_away=abs_p2,
                h2h_summary=m.get("h2h"), context=m.get("context"),
                motivation=m.get("motivation"), weather=m.get("weather"),
                surface=m.get("surface"), round=m.get("round"),
                ranking_p1=m.get("p1_ranking"), ranking_p2=m.get("p2_ranking"),
                p1_age=m.get("p1_age"), p2_age=m.get("p2_age"),
                p1_season_record=m.get("p1_season_record"), p2_season_record=m.get("p2_season_record"),
                p1_surface_record=m.get("p1_surface_record"), p2_surface_record=m.get("p2_surface_record"),
                p1_serve_pct=m.get("p1_serve_pct"), p2_serve_pct=m.get("p2_serve_pct"),
                p1_return_pct=m.get("p1_return_pct"), p2_return_pct=m.get("p2_return_pct"),
                p1_aces_avg=m.get("p1_aces_avg"), p2_aces_avg=m.get("p2_aces_avg"),
                p1_rest_days=m.get("p1_rest_days"), p2_rest_days=m.get("p2_rest_days"),
                h2h_surface=m.get("h2h_surface"), h2h_last3=m.get("h2h_last3", []) or [],
                home_rest_days=m.get("p1_rest_days"), away_rest_days=m.get("p2_rest_days"),
                model_prob_home=calc.home_prob, model_prob_away=calc.away_prob,
                edges=calc.edges, data_quality=calc.data_quality, data_score=calc.data_score,
            ))
        except Exception:
            continue

    return AIScanResponse(
        matches=matches, sport="tennis", source="claude_code",
        cached=from_cache,
        cached_at=datetime.fromtimestamp(cached_at_ts).isoformat() if cached_at_ts else None,
        research_duration_seconds=duration,
    )


@router.get("/scanner/ai-research", response_model=AIResearchResponse)
async def ai_research(
    sport: str = Query(default="football"),
    home: str = Query(..., description="Home team or player 1"),
    away: str = Query(..., description="Away team or player 2"),
    competition: str = Query(..., description="League or tournament"),
    date: str = Query(..., description="Match date"),
    force: bool = Query(default=False),
):
    """Deep research on a specific match via Claude Code web search."""
    from src.data.claude_researcher import ClaudeResearcher

    researcher = ClaudeResearcher()
    result = await researcher.deep_research(
        sport=sport, home=home, away=away,
        competition=competition, date=date, force=force,
    )

    if "_error" in result:
        raise HTTPException(
            status_code=502,
            detail=f"Claude research failed: {result['_error']}",
        )

    duration = result.get("_duration_seconds", 0.0)
    from_cache = result.get("_from_cache", False)
    cached_at_ts = result.get("_cached_at")

    if sport == "tennis":
        home_analysis = result.get("player1_analysis", {})
        away_analysis = result.get("player2_analysis", {})
    else:
        home_analysis = result.get("home_team_analysis", {})
        away_analysis = result.get("away_team_analysis", {})

    return AIResearchResponse(
        sport=sport,
        match_info=result.get("match_info", {}),
        odds=result.get("odds", {}),
        home_analysis=home_analysis,
        away_analysis=away_analysis,
        injuries=result.get("injuries_suspensions", result.get("injuries", {})),
        lineups=result.get("expected_lineups"),
        h2h=result.get("h2h", {}),
        key_players=result.get("key_players"),
        tactical_analysis=result.get("tactical_analysis", ""),
        expert_prediction=result.get("expert_prediction", {}),
        cached=from_cache,
        cached_at=datetime.fromtimestamp(cached_at_ts).isoformat() if cached_at_ts else None,
        research_duration_seconds=duration,
    )
