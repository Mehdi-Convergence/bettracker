"""Scrape Transfermarkt for injuries and player performance stats.

Uses the squad page (kader) for injury data and the performance page
(leistungsdaten) for season stats (appearances, goals, assists, cards, minutes).
Cache per team per day (TTL 24h) to avoid repeated scraping.
"""

import logging
import re
import time
from datetime import datetime

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Base URL
TM_BASE = "https://www.transfermarkt.com"

# Browser headers to avoid bot detection
TM_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# Team mapping: DB name -> (transfermarkt slug, transfermarkt ID)
# Covers major leagues: PL, Ligue 1, Serie A, Bundesliga, La Liga, Eredivisie, etc.
TEAM_MAP: dict[str, tuple[str, int]] = {
    # Premier League (E0)
    "Arsenal": ("arsenal-fc", 11),
    "Aston Villa": ("aston-villa", 405),
    "Bournemouth": ("afc-bournemouth", 989),
    "Brentford": ("brentford-fc", 1148),
    "Brighton": ("brighton-amp-hove-albion", 1237),
    "Chelsea": ("fc-chelsea", 631),
    "Crystal Palace": ("crystal-palace", 873),
    "Everton": ("fc-everton", 29),
    "Fulham": ("fc-fulham", 931),
    "Ipswich": ("ipswich-town", 677),
    "Leicester": ("leicester-city", 1003),
    "Liverpool": ("fc-liverpool", 31),
    "Man City": ("manchester-city", 281),
    "Man United": ("manchester-united", 985),
    "Newcastle": ("newcastle-united", 762),
    "Nott'm Forest": ("nottingham-forest", 703),
    "Southampton": ("fc-southampton", 180),
    "Tottenham": ("tottenham-hotspur", 148),
    "West Ham": ("west-ham-united", 379),
    "Wolves": ("wolverhampton-wanderers", 543),
    # Ligue 1 (F1)
    "PSG": ("paris-saint-germain", 583),
    "Marseille": ("olympique-marseille", 244),
    "Lyon": ("olympique-lyon", 1041),
    "Monaco": ("as-monaco", 162),
    "Lille": ("losc-lille", 1082),
    "Lens": ("rc-lens", 826),
    "Nice": ("ogc-nizza", 417),
    "Rennes": ("stade-rennais-fc", 273),
    "Strasbourg": ("rc-strasbourg-alsace", 667),
    "Nantes": ("fc-nantes", 995),
    "Toulouse": ("fc-toulouse", 415),
    "Reims": ("stade-reims", 1421),
    "Montpellier": ("montpellier-hsc", 969),
    "Brest": ("stade-brestois-29", 3911),
    "Le Havre": ("le-havre-ac", 738),
    "Auxerre": ("aj-auxerre", 290),
    "St Etienne": ("as-saint-etienne", 618),
    "Angers": ("angers-sco", 1420),
    # Serie A (I1)
    "Inter": ("inter-mailand", 46),
    "AC Milan": ("ac-mailand", 5),
    "Juventus": ("juventus-turin", 506),
    "Napoli": ("ssc-neapel", 6195),
    "Roma": ("as-rom", 12),
    "Lazio": ("lazio-rom", 398),
    "Atalanta": ("atalanta-bergamo", 800),
    "Fiorentina": ("ac-florenz", 430),
    "Bologna": ("fc-bologna", 1025),
    "Torino": ("fc-turin", 416),
    "Udinese": ("udinese-calcio", 410),
    "Genoa": ("genua-cfc", 252),
    "Cagliari": ("cagliari-calcio", 1390),
    "Lecce": ("us-lecce", 1005),
    "Parma": ("fc-parma", 130),
    "Empoli": ("fc-empoli", 749),
    "Verona": ("hellas-verona", 276),
    "Como": ("como-1907", 1047),
    "Monza": ("ac-monza", 2919),
    "Venezia": ("fc-venedig", 607),
    # Bundesliga (D1)
    "Bayern Munich": ("fc-bayern-munchen", 27),
    "Dortmund": ("borussia-dortmund", 16),
    "Leverkusen": ("bayer-04-leverkusen", 15),
    "RB Leipzig": ("rasenballsport-leipzig", 23826),
    "Stuttgart": ("vfb-stuttgart", 79),
    "Frankfurt": ("eintracht-frankfurt", 24),
    "Freiburg": ("sc-freiburg", 60),
    "Wolfsburg": ("vfl-wolfsburg", 82),
    "Hoffenheim": ("tsg-1899-hoffenheim", 533),
    "Werder Bremen": ("sv-werder-bremen", 86),
    "Mainz": ("1-fsv-mainz-05", 39),
    "Augsburg": ("fc-augsburg", 167),
    "M'gladbach": ("borussia-monchengladbach", 18),
    "Union Berlin": ("1-fc-union-berlin", 89),
    "Bochum": ("vfl-bochum", 80),
    "St Pauli": ("fc-st-pauli", 35),
    "Holstein Kiel": ("holstein-kiel", 2539),
    "Heidenheim": ("1-fc-heidenheim-1846", 2036),
    # La Liga (SP1)
    "Real Madrid": ("real-madrid", 418),
    "Barcelona": ("fc-barcelona", 131),
    "Atletico Madrid": ("atletico-madrid", 13),
    "Sevilla": ("fc-sevilla", 368),
    "Real Sociedad": ("real-sociedad-san-sebastian", 681),
    "Villarreal": ("fc-villarreal", 1050),
    "Real Betis": ("real-betis-sevilla", 150),
    "Athletic Bilbao": ("athletic-bilbao", 621),
    "Girona": ("fc-girona", 12321),
    "Celta Vigo": ("rc-celta-de-vigo", 940),
    "Osasuna": ("ca-osasuna", 331),
    "Mallorca": ("rcd-mallorca", 237),
    "Getafe": ("fc-getafe", 3709),
    "Vallecano": ("rayo-vallecano", 367),
    "Las Palmas": ("ud-las-palmas", 472),
    "Alaves": ("deportivo-alaves", 1108),
    "Espanol": ("rcd-espanyol-barcelona", 714),
    "Valencia": ("fc-valencia", 1049),
    "Valladolid": ("real-valladolid", 366),
    "Leganes": ("cd-leganes", 1244),
    # Eredivisie (N1)
    "PSV": ("psv-eindhoven", 383),
    "Ajax": ("afc-ajax", 610),
    "Feyenoord": ("feyenoord-rotterdam", 234),
    "AZ Alkmaar": ("az-alkmaar", 1090),
    "Twente": ("fc-twente-enschede", 317),
    "FC Utrecht": ("fc-utrecht", 200),
    # Liga Portugal (P1)
    "Benfica": ("sl-benfica", 294),
    "Porto": ("fc-porto", 720),
    "Sporting CP": ("sporting-lissabon", 336),
    "Braga": ("sporting-braga", 1075),
    # Belgian Pro League (B1)
    "Club Brugge": ("fc-brugge", 2282),
    "Anderlecht": ("rsc-anderlecht", 58),
    # Turkish Super Lig (T1)
    "Galatasaray": ("galatasaray-istanbul", 141),
    "Fenerbahce": ("fenerbahce-istanbul", 36),
    # Scottish Premiership (SC0)
    "Celtic": ("celtic-glasgow", 371),
    "Rangers": ("rangers-fc", 124),
    # Championship (E1)
    "Leeds": ("leeds-united", 399),
    "Sheffield Utd": ("sheffield-united", 350),
    "Burnley": ("fc-burnley", 1132),
    "Sunderland": ("afc-sunderland", 289),
    # 2. Bundesliga (D2)
    "Hamburg": ("hamburger-sv", 41),
    "Koln": ("1-fc-koln", 3),
    # Ligue 2 (F2)
    "Metz": ("fc-metz", 347),
    # Serie B (I2)
    "Palermo": ("us-palermo", 1548),
    "Sampdoria": ("uc-sampdoria", 1038),
}

# Cache: {team_name: {"data": {...}, "timestamp": float}}
_cache: dict[str, dict] = {}
CACHE_TTL = 86400  # 24 hours


def _is_cached(team_name: str) -> tuple[bool, float | None]:
    """Check if team data is cached and still valid."""
    entry = _cache.get(team_name)
    if entry and (time.time() - entry["timestamp"]) < CACHE_TTL:
        return True, entry["timestamp"]
    return False, None


def _set_cache(team_name: str, data: dict) -> float:
    """Store team data in cache, return timestamp."""
    ts = time.time()
    _cache[team_name] = {"data": data, "timestamp": ts}
    return ts


def invalidate_cache(team_name: str) -> None:
    """Remove a team from cache (used for force refresh)."""
    _cache.pop(team_name, None)


def get_team_data(
    team_name: str, force: bool = False
) -> dict:
    """Get injuries + player stats for a team.

    Returns:
        {
            "team_name": str,
            "injuries": [{"player": ..., "position": ..., "injury": ..., "since": ..., "expected_return": ...}],
            "players": [{"player": ..., "position": ..., "appearances": ..., ...}],
            "scraped_at": str (ISO),
            "available": bool,
            "error": str | None,
        }
    """
    if force:
        invalidate_cache(team_name)

    cached, cached_ts = _is_cached(team_name)
    if cached:
        result = _cache[team_name]["data"].copy()
        result["scraped_at"] = datetime.fromtimestamp(cached_ts).isoformat()
        return result

    team_info = TEAM_MAP.get(team_name)
    if not team_info:
        return {
            "team_name": team_name,
            "injuries": [],
            "players": [],
            "scraped_at": None,
            "available": False,
            "error": f"Equipe non repertoriee: {team_name}",
        }

    slug, team_id = team_info

    try:
        injuries = _scrape_injuries(slug, team_id)
        time.sleep(2)  # Rate limit between requests
        players = _scrape_player_stats(slug, team_id)

        data = {
            "team_name": team_name,
            "injuries": injuries,
            "players": players,
            "available": True,
            "error": None,
        }
        ts = _set_cache(team_name, data)
        data["scraped_at"] = datetime.fromtimestamp(ts).isoformat()
        return data

    except Exception as e:
        logger.exception(f"Scraping failed for {team_name}")
        return {
            "team_name": team_name,
            "injuries": [],
            "players": [],
            "scraped_at": None,
            "available": False,
            "error": f"Scraping echoue: {e}",
        }


def _scrape_injuries(slug: str, team_id: int) -> list[dict]:
    """Scrape current injuries from the squad (kader) page."""
    url = f"{TM_BASE}/{slug}/kader/verein/{team_id}/plus/1"
    logger.info(f"Scraping injuries: {url}")

    with httpx.Client(headers=TM_HEADERS, follow_redirects=True, timeout=15) as client:
        resp = client.get(url)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")
    injuries: list[dict] = []

    injury_spans = soup.find_all("span", class_="verletzt-table")
    for span in injury_spans:
        title = span.get("title", "")
        if not title:
            continue

        # Find parent row to get player info
        row = span.find_parent("tr")
        if not row:
            continue

        # Player name
        name_cell = row.find("td", class_="hauptlink")
        player_name = "?"
        if name_cell:
            links = name_cell.find_all("a")
            for link in links:
                text = link.get_text(strip=True)
                if text:
                    player_name = text
                    break

        # Position from jersey number cell title
        number_cell = row.find("td", class_="rueckennummer")
        position = number_cell.get("title", "") if number_cell else ""

        # Parse injury title: "Injury type - Return expected on DD/MM/YYYY"
        injury_type = title
        expected_return = "?"
        match = re.match(r"(.+?)\s*-\s*Return expected on\s*(\S+)", title)
        if match:
            injury_type = match.group(1).strip()
            expected_return = match.group(2).strip()
        elif " - " in title:
            parts = title.split(" - ", 1)
            injury_type = parts[0].strip()
            expected_return = parts[1].strip()

        injuries.append({
            "player": player_name,
            "position": position,
            "injury": injury_type,
            "since": "",
            "expected_return": expected_return,
        })

    return injuries


def _scrape_player_stats(slug: str, team_id: int) -> list[dict]:
    """Scrape player performance stats from the leistungsdaten page."""
    url = f"{TM_BASE}/{slug}/leistungsdaten/verein/{team_id}/plus/1?reldata=%262024"
    logger.info(f"Scraping player stats: {url}")

    with httpx.Client(headers=TM_HEADERS, follow_redirects=True, timeout=15) as client:
        resp = client.get(url)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")
    table = soup.find("table", class_="items")
    if not table:
        return []

    tbody = table.find("tbody")
    if not tbody:
        return []

    players: list[dict] = []
    rows = tbody.find_all("tr", recursive=False)

    for row in rows:
        cells = row.find_all("td", recursive=False)
        if len(cells) < 15:
            continue

        # col0: jersey number (title = position)
        number_cell = cells[0]
        position = number_cell.get("title", "")
        if not position:
            continue  # Skip sub-rows or empty rows

        # col1: Player name (inside posrela cell)
        # First <a> is the photo link (empty text), name is in subsequent <a> tags
        name_cell = cells[1]
        links = name_cell.find_all("a")
        player_name = ""
        for link in links:
            text = link.get_text(strip=True)
            if text:
                player_name = text
                break
        if not player_name:
            continue

        def safe_int(cell) -> int:
            text = cell.get_text(strip=True).replace("'", "").replace(".", "")
            if text in ("-", "", "Not used during this seas"):
                return 0
            try:
                return int(text)
            except ValueError:
                return 0

        # col5: appearances, col6: goals, col7: assists
        # col8: yellow, col9: second yellow, col10: red
        # col14: minutes (with ' suffix)
        appearances = safe_int(cells[5])
        goals = safe_int(cells[6])
        assists = safe_int(cells[7])
        yellow_cards = safe_int(cells[8])
        red_cards = safe_int(cells[10])
        minutes = safe_int(cells[14])

        players.append({
            "player": player_name,
            "position": position,
            "appearances": appearances,
            "goals": goals,
            "assists": assists,
            "minutes": minutes,
            "yellow_cards": yellow_cards,
            "red_cards": red_cards,
        })

    # Sort by appearances desc, take top 20
    players.sort(key=lambda p: p["appearances"], reverse=True)
    return players[:20]
