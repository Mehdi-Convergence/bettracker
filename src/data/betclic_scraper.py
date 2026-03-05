"""Betclic scraper via Playwright headless browser.

Scrapes betclic.fr to extract match data, odds, and all available markets.
Uses DOM selectors (data-qa attributes, .cardEvent, .marketBox) for reliable extraction.
"""

import asyncio
import locale
import logging
import re
import time
from datetime import datetime, timedelta

from playwright.async_api import async_playwright, Browser, BrowserContext, Page

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# League mapping: our code -> Betclic URL slug
# ---------------------------------------------------------------------------
LEAGUE_MAP: dict[str, str] = {
    "E0": "angl-premier-league-c3",
    "E1": "angl-championship-c28",
    "F1": "france-ligue-1-c4",
    "F2": "france-ligue-2-c5",
    "D1": "allemagne-bundesliga-c6",
    "D2": "allemagne-2-bundesliga-c59",
    "I1": "italie-serie-a-c8",
    "I2": "italie-serie-b-c84",
    "SP1": "espagne-laliga-c7",
    "SP2": "espagne-segunda-division-c56",
    "N1": "pays-bas-eredivisie-c13",
    "P1": "liga-betclic-c32",
    "B1": "belgique-jupiler-pro-league-c16",
    "T1": "turquie-super-lig-c19",
    "G1": "grece-super-league-c55",
    "SC0": "ecosse-premiership-c38",
}

# Reverse map: URL slug prefix -> league code
SLUG_TO_LEAGUE: dict[str, str] = {}
for _code, _slug in LEAGUE_MAP.items():
    # Extract prefix before the -cXX suffix
    _prefix = re.sub(r"-c\d+$", "", _slug)
    SLUG_TO_LEAGUE[_prefix] = _code

# Market title normalization: Betclic French title (lowercase) -> market_type key
MARKET_TITLE_MAP: dict[str, str] = {
    "resultat du match": "1x2",
    "double chance": "double_chance",
    "nombre total de buts": "over_under",
    "les 2 equipes marquent": "btts",
    "score exact": "correct_score",
    "1ere mi-temps (seule) - resultat": "half_time_result",
    "2eme mi-temps (seule) - resultat": "half_time_2_result",
    "ecart de buts": "goal_margin",
    "buteur (tps reg.)": "goalscorer",
    "buteur ou son remplacant": "goalscorer_sub",
    "joueur decisif": "assist_or_goal",
    "total de buts -": "team_total",
    "equipe qui marque": "team_to_score",
    "les 2 equipes marquent ou": "btts_or_over",
    "l'equipe possede 2 buts d'avance": "early_win",
    "double chance buteur": "double_chance_scorer",
}

# Cache settings
CACHE_TTL_PREMATCH = 900  # 15 min
CACHE_TTL_LIVE = 30  # 30 sec

# Module-level state
_cache: dict[str, dict] = {}
_browser: Browser | None = None
_context: BrowserContext | None = None
_pw_instance = None
_lock = asyncio.Lock()


# ---------------------------------------------------------------------------
# Browser management
# ---------------------------------------------------------------------------

async def _get_browser() -> BrowserContext:
    """Get or create a singleton browser context."""
    global _browser, _context, _pw_instance
    if _browser is None or not _browser.is_connected():
        _pw_instance = await async_playwright().start()
        _browser = await _pw_instance.chromium.launch(headless=True)
        _context = await _browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1920, "height": 1080},
            locale="fr-FR",
        )
    return _context


async def close_browser():
    """Close the browser (for clean shutdown)."""
    global _browser, _context, _pw_instance
    if _browser:
        await _browser.close()
        _browser = None
        _context = None
    if _pw_instance:
        await _pw_instance.stop()
        _pw_instance = None


async def _dismiss_cookie_banner(page: Page):
    """Dismiss the cookie consent banner if present."""
    try:
        btn = page.locator("#popin_tc_privacy_button_2")
        if await btn.count() > 0:
            await btn.click(timeout=3000)
            await asyncio.sleep(0.5)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _is_cached(key: str, ttl: int) -> bool:
    if key not in _cache:
        return False
    return (time.time() - _cache[key]["ts"]) < ttl


def _get_cached(key: str):
    return _cache[key]["data"]


def _set_cache(key: str, data):
    _cache[key] = {"data": data, "ts": time.time()}


def get_cached_at() -> str | None:
    """Return the most recent cache timestamp."""
    if not _cache:
        return None
    latest = max(v["ts"] for v in _cache.values())
    return datetime.fromtimestamp(latest).isoformat()


# ---------------------------------------------------------------------------
# JS extraction scripts (kept as module-level strings)
# ---------------------------------------------------------------------------

# Extract match cards from overview/league pages using data-qa selectors
JS_EXTRACT_CARDS = """() => {
    const cards = document.querySelectorAll('a.cardEvent[href*="football"][href*="-m"]');
    const results = [];
    for (const card of cards) {
        const href = card.getAttribute('href') || '';

        // Team names from data-qa attributes
        const home_el = card.querySelector('[data-qa="contestant-1-label"]');
        const away_el = card.querySelector('[data-qa="contestant-2-label"]');
        if (!home_el || !away_el) continue;

        const home_team = home_el.innerText.trim();
        const away_team = away_el.innerText.trim();

        // Is live?
        const isLive = card.classList.contains('is-live');

        // League from breadcrumb
        const league_el = card.querySelector('.breadcrumb_itemLabel');
        const league_name = league_el ? league_el.innerText.trim() : '';

        // Date and time
        const date_el = card.querySelector('.scoreboard_date');
        const hour_el = card.querySelector('.scoreboard_hour');
        const date_str = date_el ? date_el.innerText.trim() : '';
        const hour_str = hour_el ? hour_el.innerText.trim() : '';

        // Score (live only)
        const score1 = card.querySelector('.scoreboard_score-1');
        const score2 = card.querySelector('.scoreboard_score-2');
        let score = null;
        if (score1 && score2) {
            const s1 = parseInt(score1.innerText.trim());
            const s2 = parseInt(score2.innerText.trim());
            if (!isNaN(s1) && !isNaN(s2)) {
                score = {home: s1, away: s2};
            }
        }

        // Timer (live only, e.g. "89' - MT 2")
        const timer_el = card.querySelector('scoreboards-timer');
        const timer = timer_el ? timer_el.innerText.trim() : '';

        // Odds: btn_label elements (skip the ones with is-top class, those are team names)
        const oddsLabels = card.querySelectorAll('bcdk-bet-button-label.btn_label:not(.is-top)');
        const odds = [];
        for (const ol of oddsLabels) {
            const txt = ol.innerText.trim().replace(',', '.');
            const val = parseFloat(txt);
            if (!isNaN(val) && val > 0) odds.push(val);
        }

        results.push({
            url: href,
            home_team: home_team,
            away_team: away_team,
            league_name: league_name,
            date_str: date_str + (hour_str ? ' ' + hour_str : ''),
            is_live: isLive,
            score: score,
            timer: timer,
            odds_h: odds[0] || null,
            odds_d: odds[1] || null,
            odds_a: odds[2] || null,
        });
    }
    return results;
}"""

# Extract all markets from a match detail page using marketBox selectors
JS_EXTRACT_MARKETS = """() => {
    const result = {};

    // Team names
    const home_el = document.querySelector('[data-qa="contestant-1-label"]');
    const away_el = document.querySelector('[data-qa="contestant-2-label"]');
    result.home_team = home_el ? home_el.innerText.trim() : '';
    result.away_team = away_el ? away_el.innerText.trim() : '';

    // Score
    const score1 = document.querySelector('.scoreboard_score-1');
    const score2 = document.querySelector('.scoreboard_score-2');
    result.score = null;
    if (score1 && score2) {
        const s1 = parseInt(score1.innerText.trim());
        const s2 = parseInt(score2.innerText.trim());
        if (!isNaN(s1) && !isNaN(s2)) {
            result.score = {home: s1, away: s2};
        }
    }

    // Date
    const date_el = document.querySelector('.scoreboard_date');
    const hour_el = document.querySelector('.scoreboard_hour');
    result.date_str = (date_el ? date_el.innerText.trim() : '') +
                      (hour_el ? ' ' + hour_el.innerText.trim() : '');

    // Timer
    const timer_el = document.querySelector('scoreboards-timer');
    result.timer = timer_el ? timer_el.innerText.trim() : '';

    // Available tabs
    const tabs = document.querySelectorAll('[data-qa="tab-btn"]');
    result.tabs = [...tabs].map(t => t.innerText.trim());

    // Extract all market boxes
    const markets = [];
    const marketBoxes = document.querySelectorAll('.marketBox');

    for (const box of marketBoxes) {
        const titleEl = box.querySelector('.marketBox_headTitle');
        if (!titleEl) continue;
        const title = titleEl.innerText.trim();

        const selections = [];
        const lines = box.querySelectorAll('.marketBox_lineSelection');

        for (const line of lines) {
            // Selection name: either from p.marketBox_label or from btn_label.is-top
            const labelEl = line.querySelector('p.marketBox_label');
            const topLabelEl = line.querySelector('bcdk-bet-button-label.is-top');

            let name = '';
            if (labelEl) {
                name = labelEl.innerText.trim();
            } else if (topLabelEl) {
                // Concatenate ellipsis + clip spans
                const parts = topLabelEl.querySelectorAll('.ellipsis, .clip');
                if (parts.length > 0) {
                    name = [...parts].map(p => p.innerText).join('').trim();
                } else {
                    name = topLabelEl.innerText.trim();
                }
            }

            // Odds: btn_label without is-top class
            const oddsEl = line.querySelector('bcdk-bet-button-label.btn_label:not(.is-top)');
            let odds = null;
            if (oddsEl) {
                const txt = oddsEl.innerText.trim().replace(',', '.');
                odds = parseFloat(txt);
                if (isNaN(odds)) odds = null;
            }

            if (name && odds && odds > 0) {
                selections.push({name: name, odds: odds});
            }
        }

        if (selections.length > 0) {
            markets.push({
                market_name: title,
                selections: selections
            });
        }
    }

    result.markets = markets;
    return result;
}"""


# ---------------------------------------------------------------------------
# Overview / League scraping
# ---------------------------------------------------------------------------

def _extract_match_id(url: str) -> str | None:
    """Extract match ID from Betclic URL."""
    m = re.search(r"-m(\d+)", url)
    return m.group(1) if m else None


def _extract_league_code(url: str) -> str:
    """Extract our league code from a Betclic URL."""
    for slug_prefix, code in SLUG_TO_LEAGUE.items():
        if slug_prefix in url:
            return code
    return ""


# French day/month names for date parsing
_FR_MONTHS = {
    "janv": 1, "jan": 1, "fevr": 2, "fev": 2, "mars": 3, "mar": 3,
    "avr": 4, "avril": 4, "mai": 5, "juin": 6, "juil": 7, "jul": 7,
    "aout": 8, "aoû": 8, "sept": 9, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "janvier": 1, "fevrier": 2, "février": 2, "avril": 4, "juillet": 7,
    "août": 8, "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12,
}
_FR_DAYS = {"lun": 0, "mar": 1, "mer": 2, "jeu": 3, "ven": 4, "sam": 5, "dim": 6}


def _parse_betclic_date(date_str: str) -> str:
    """Convert Betclic French relative date to ISO format.

    Examples:
        "Demain 21:15" -> "2026-03-04T21:15:00Z"
        "Auj. 15:30" -> "2026-03-03T15:30:00Z"
        "Ven. 7 mars 21:00" -> "2026-03-07T21:00:00Z"
        "7 mars 21:00" -> "2026-03-07T21:00:00Z"
        "07/03 21:00" -> "2026-03-07T21:00:00Z"
    """
    if not date_str:
        return ""

    s = date_str.strip()
    now = datetime.now()

    # Extract time (HH:MM) from the string
    time_match = re.search(r"(\d{1,2}):(\d{2})", s)
    hour, minute = 0, 0
    if time_match:
        hour = int(time_match.group(1))
        minute = int(time_match.group(2))

    s_lower = s.lower()

    # "Auj." or "Aujourd'hui"
    if "auj" in s_lower:
        dt = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    # "Demain"
    if "demain" in s_lower:
        dt = (now + timedelta(days=1)).replace(hour=hour, minute=minute, second=0, microsecond=0)
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    # "DD/MM HH:MM" format
    slash_match = re.search(r"(\d{1,2})/(\d{1,2})", s)
    if slash_match:
        day = int(slash_match.group(1))
        month = int(slash_match.group(2))
        year = now.year
        if month < now.month - 1:
            year += 1
        try:
            dt = datetime(year, month, day, hour, minute)
            return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            pass

    # "Ven. 7 mars 21:00" or "7 mars 21:00" - day + French month
    for month_key, month_num in _FR_MONTHS.items():
        if month_key in s_lower:
            day_match = re.search(r"(\d{1,2})\s+" + re.escape(month_key), s_lower)
            if not day_match:
                day_match = re.search(re.escape(month_key) + r"\s+(\d{1,2})", s_lower)
            if day_match:
                day = int(day_match.group(1))
                year = now.year
                if month_num < now.month - 1:
                    year += 1
                try:
                    dt = datetime(year, month_num, day, hour, minute)
                    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                except ValueError:
                    pass
            break

    # Fallback: if we have a time but no recognized date, assume today
    if time_match:
        dt = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    # No parseable info at all
    return date_str


def _normalize_card(raw: dict) -> dict:
    """Normalize a raw card extracted by JS into our standard format."""
    url = raw["url"]
    odds_1x2 = {}
    if raw.get("odds_h"):
        odds_1x2["H"] = raw["odds_h"]
    if raw.get("odds_d"):
        odds_1x2["D"] = raw["odds_d"]
    if raw.get("odds_a"):
        odds_1x2["A"] = raw["odds_a"]

    raw_date = raw.get("date_str", "")
    iso_date = _parse_betclic_date(raw_date)

    return {
        "match_id": _extract_match_id(url),
        "home_team": raw["home_team"],
        "away_team": raw["away_team"],
        "league": _extract_league_code(url),
        "league_name": raw.get("league_name", ""),
        "date_str": iso_date if iso_date else raw_date,
        "is_live": raw.get("is_live", False),
        "score": raw.get("score"),
        "timer": raw.get("timer", ""),
        "url": url,
        "odds_1x2": odds_1x2,
    }


async def scrape_football_overview(force: bool = False) -> list[dict]:
    """Scrape the main football page for all visible matches with 1X2 odds."""
    cache_key = "overview"
    if not force and _is_cached(cache_key, CACHE_TTL_PREMATCH):
        return _get_cached(cache_key)

    async with _lock:
        ctx = await _get_browser()
        page = await ctx.new_page()
        try:
            await page.goto(
                "https://www.betclic.fr/sport/football",
                wait_until="domcontentloaded",
                timeout=30000,
            )
            await asyncio.sleep(8)
            await _dismiss_cookie_banner(page)

            raw_cards = await page.evaluate(JS_EXTRACT_CARDS)
            parsed = [_normalize_card(c) for c in raw_cards]

            _set_cache(cache_key, parsed)
            logger.info("Betclic overview: %d matches", len(parsed))
            return parsed
        except Exception as e:
            logger.error("Betclic overview scrape failed: %s", e)
            return []
        finally:
            await page.close()


async def scrape_league(league_code: str, force: bool = False) -> list[dict]:
    """Scrape all matches for a specific league."""
    slug = LEAGUE_MAP.get(league_code)
    if not slug:
        return []

    cache_key = f"league_{league_code}"
    if not force and _is_cached(cache_key, CACHE_TTL_PREMATCH):
        return _get_cached(cache_key)

    async with _lock:
        ctx = await _get_browser()
        page = await ctx.new_page()
        try:
            url = f"https://www.betclic.fr/football-sfootball/{slug}"
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(8)
            await _dismiss_cookie_banner(page)

            # Scroll to load more matches
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(2)

            raw_cards = await page.evaluate(JS_EXTRACT_CARDS)
            parsed = [_normalize_card(c) for c in raw_cards]

            # Force league code (URL might differ slightly)
            for m in parsed:
                m["league"] = league_code

            _set_cache(cache_key, parsed)
            logger.info("Betclic league %s: %d matches", league_code, len(parsed))
            return parsed
        except Exception as e:
            logger.error("Betclic league %s scrape failed: %s", league_code, e)
            return []
        finally:
            await page.close()


# ---------------------------------------------------------------------------
# Match detail scraping: ALL markets
# ---------------------------------------------------------------------------

def _classify_market(title: str) -> str:
    """Classify a market title into a market_type key."""
    # Remove accents for matching (simple ASCII folding)
    normalized = title.lower()
    for char_from, char_to in [
        ("\u00e9", "e"), ("\u00e8", "e"), ("\u00ea", "e"),
        ("\u00e0", "a"), ("\u00e2", "a"),
        ("\u00f4", "o"), ("\u00fb", "u"), ("\u00ee", "i"),
        ("\u00e7", "c"),
    ]:
        normalized = normalized.replace(char_from, char_to)

    for pattern, market_type in MARKET_TITLE_MAP.items():
        if pattern in normalized:
            return market_type

    # Fallback: slugify the title
    slug = re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")
    return slug[:50] if slug else "unknown"


async def scrape_match_markets(match_url: str, force: bool = False) -> dict:
    """Scrape ALL markets for a specific match.

    Returns dict with: home_team, away_team, score, date_str, timer, markets.
    Each market: {market_type, market_name, selections: [{name, odds}]}
    """
    if not match_url.startswith("http"):
        match_url = f"https://www.betclic.fr{match_url}"

    cache_key = f"match_{match_url}"
    ttl = CACHE_TTL_LIVE if "is-live" in match_url else CACHE_TTL_PREMATCH
    if not force and _is_cached(cache_key, ttl):
        return _get_cached(cache_key)

    async with _lock:
        ctx = await _get_browser()
        page = await ctx.new_page()
        try:
            await page.goto(match_url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(8)
            await _dismiss_cookie_banner(page)

            # Scroll to load all markets
            for _ in range(4):
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(1)

            # Click "Voir plus" / "See more" buttons to expand collapsed markets
            try:
                see_more = page.locator("button.is-seeMore")
                count = await see_more.count()
                for i in range(count):
                    try:
                        await see_more.nth(i).click(timeout=2000)
                        await asyncio.sleep(0.3)
                    except Exception:
                        pass
            except Exception:
                pass

            # Try clicking on key tabs to load more markets
            for tab_name in ["Buts", "Score exact et handicaps"]:
                try:
                    tabs = page.locator(f'[data-qa="tab-btn"]:has-text("{tab_name}")')
                    if await tabs.count() > 0:
                        await tabs.first.click(timeout=3000)
                        await asyncio.sleep(3)
                        # Scroll again to load new markets
                        for _ in range(3):
                            await page.evaluate(
                                "window.scrollTo(0, document.body.scrollHeight)"
                            )
                            await asyncio.sleep(0.5)
                except Exception:
                    pass

            # Now go back to "Le Top" tab which shows everything
            try:
                top_tab = page.locator('[data-qa="tab-btn"]:has-text("Le Top")')
                if await top_tab.count() > 0:
                    await top_tab.first.click(timeout=3000)
                    await asyncio.sleep(3)
                    for _ in range(3):
                        await page.evaluate(
                            "window.scrollTo(0, document.body.scrollHeight)"
                        )
                        await asyncio.sleep(0.5)
            except Exception:
                pass

            raw = await page.evaluate(JS_EXTRACT_MARKETS)

            # Post-process: classify markets
            markets = []
            for m in raw.get("markets", []):
                market_type = _classify_market(m["market_name"])
                markets.append({
                    "market_type": market_type,
                    "market_name": m["market_name"],
                    "selections": m["selections"],
                })

            raw_date = raw.get("date_str", "")
            result = {
                "home_team": raw.get("home_team", ""),
                "away_team": raw.get("away_team", ""),
                "score": raw.get("score"),
                "date_str": _parse_betclic_date(raw_date) or raw_date,
                "timer": raw.get("timer", ""),
                "tabs": raw.get("tabs", []),
                "url": match_url,
                "markets": markets,
            }

            _set_cache(cache_key, result)
            logger.info(
                "Betclic match detail: %s vs %s, %d markets",
                result["home_team"], result["away_team"], len(markets),
            )
            return result
        except Exception as e:
            logger.error("Betclic match detail scrape failed: %s", e)
            return {"home_team": "", "away_team": "", "markets": [], "url": match_url}
        finally:
            await page.close()


# ---------------------------------------------------------------------------
# Live matches
# ---------------------------------------------------------------------------

async def scrape_live_matches(force: bool = False) -> list[dict]:
    """Scrape live/in-play football matches."""
    cache_key = "live"
    if not force and _is_cached(cache_key, CACHE_TTL_LIVE):
        return _get_cached(cache_key)

    async with _lock:
        ctx = await _get_browser()
        page = await ctx.new_page()
        try:
            await page.goto(
                "https://www.betclic.fr/live",
                wait_until="domcontentloaded",
                timeout=30000,
            )
            await asyncio.sleep(8)
            await _dismiss_cookie_banner(page)

            raw_cards = await page.evaluate(JS_EXTRACT_CARDS)
            # Filter only football matches (JS already filters by href)
            parsed = [_normalize_card(c) for c in raw_cards]
            for m in parsed:
                m["is_live"] = True

            _set_cache(cache_key, parsed)
            logger.info("Betclic live: %d football matches", len(parsed))
            return parsed
        except Exception as e:
            logger.error("Betclic live scrape failed: %s", e)
            return []
        finally:
            await page.close()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_betclic_matches(
    leagues: list[str] | None = None,
    force: bool = False,
) -> list[dict]:
    """Get all matches from Betclic for specified leagues.

    If no leagues specified, scrapes the overview page (faster, fewer matches).
    """
    if leagues:
        all_matches = []
        for league in leagues:
            matches = await scrape_league(league, force=force)
            all_matches.extend(matches)
            await asyncio.sleep(2)  # Rate limit between pages
        return all_matches
    return await scrape_football_overview(force=force)


async def get_betclic_match_detail(
    match_url: str, force: bool = False
) -> dict:
    """Get all markets for a specific match."""
    return await scrape_match_markets(match_url, force=force)


async def get_betclic_live(force: bool = False) -> list[dict]:
    """Get live football matches from Betclic."""
    return await scrape_live_matches(force=force)
