"""Fast PMU data collector using only stdlib (urllib + sqlite3).

Collects races and runners from PMU turfinfo API and stores in local SQLite.
No external dependencies needed — runs with plain `python`.

Usage:
    python scripts/collect_pmu_fast.py [--days 180] [--delay 0.3]
"""

import json
import sqlite3
import sys
import time
import urllib.request
from datetime import date, timedelta

DB_PATH = "bettracker.db"
PMU_API_BASE = "https://online.turfinfo.api.pmu.fr/rest/client/1/programme"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; BetTracker/1.0)",
    "Accept": "application/json",
}
DEFAULT_DAYS = 180
DEFAULT_DELAY = 0.3  # seconds between participant requests


def fetch_json(url: str, timeout: int = 8) -> dict | None:
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        return json.loads(resp.read())
    except Exception as e:
        print(f"  [WARN] {e}", file=sys.stderr)
        return None


def parse_heure(heure_depart) -> str | None:
    if heure_depart is None:
        return None
    if isinstance(heure_depart, (int, float)):
        from datetime import datetime
        try:
            dt = datetime.fromtimestamp(heure_depart / 1000)
            return dt.strftime("%Hh%M")
        except (OSError, ValueError):
            return None
    if isinstance(heure_depart, str):
        return heure_depart[:5].replace(":", "h")
    return None


def normalize_discipline(discipline: str) -> str:
    mapping = {
        "PLAT": "plat", "TROT_ATTELE": "trot_attele", "TROT_MONTE": "trot_monte",
        "ATTELE": "trot_attele", "MONTE": "trot_monte", "OBSTACLE": "obstacle",
        "HAIES": "obstacle", "STEEPLE": "obstacle", "STEEPLE_CHASE": "obstacle",
        "CROSS": "obstacle",
    }
    return mapping.get(discipline.upper(), "plat")


def normalize_terrain(terrain_raw) -> str | None:
    if not terrain_raw:
        return None
    t = str(terrain_raw).upper()
    mapping = {
        "BON": "bon", "BON_A_SEC": "bon", "SEC": "sec", "LEGER": "leger",
        "BON_A_SOUPLE": "souple", "SOUPLE": "souple", "TRES_SOUPLE": "tres_souple",
        "LOURD": "lourd", "COLLANT": "collant",
    }
    return mapping.get(t, t.lower())


def parse_musique(musique: str | None) -> str | None:
    if not musique:
        return None
    positions = []
    current = ""
    for char in str(musique):
        if char.isdigit():
            current += char
        else:
            if current:
                try:
                    positions.append(int(current))
                except ValueError:
                    pass
                current = ""
            if len(positions) >= 5:
                break
    if current and len(positions) < 5:
        try:
            positions.append(int(current))
        except ValueError:
            pass
    return json.dumps(positions[:5]) if positions else None


def to_float(val) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        return f if f > 0 else None
    except (ValueError, TypeError):
        return None


def collect_day(day: date, delay: float) -> list[dict]:
    date_str = day.strftime("%d%m%Y")
    data = fetch_json(f"{PMU_API_BASE}/{date_str}")
    if not data:
        return []

    reunions = data.get("programme", {}).get("reunions", [])
    if not reunions:
        reunions = data.get("reunions", [])
    if not reunions:
        return []

    all_races = []
    for reunion in reunions:
        hippodrome = (
            reunion.get("hippodrome", {}).get("libelleCourt")
            or reunion.get("hippodrome", {}).get("libelleLong")
            or "Inconnu"
        )
        reunion_num = reunion.get("numOfficiel", reunion.get("numero", 0))

        for course in reunion.get("courses", []):
            course_num = course.get("numOrdre", course.get("numOfficiel", 0))
            race_id = f"{day.isoformat()}-R{reunion_num}-C{course_num}"

            discipline = course.get("discipline", course.get("specialite", "PLAT"))
            race_type = normalize_discipline(str(discipline).upper())
            terrain_raw = course.get("conditionSol") or course.get("terrain") or course.get("etatPiste")
            is_quinteplus = bool(
                course.get("categorieParticularite") == "QUINTE_PLUS"
                or course.get("quinteplus")
            )

            # Fetch participants
            time.sleep(delay)
            part_url = f"{PMU_API_BASE}/{date_str}/R{reunion_num}/C{course_num}/participants"
            part_data = fetch_json(part_url)
            participants = part_data.get("participants", []) if part_data else []

            runners = []
            for p in participants:
                horse_name = p.get("nom")
                if not horse_name:
                    continue
                is_scratched = bool(p.get("nonPartant") or p.get("statut") == "NON_PARTANT")
                finish_position = p.get("ordreArrivee")
                if isinstance(finish_position, str):
                    try:
                        finish_position = int(finish_position)
                    except ValueError:
                        finish_position = None

                runners.append({
                    "number": p.get("numPmu", 0),
                    "horse_name": str(horse_name).strip(),
                    "jockey_name": str(p.get("driver") or p.get("jockey") or "").strip() or None,
                    "trainer_name": str(p.get("entraineur") or "").strip() or None,
                    "age": int(p["age"]) if p.get("age") is not None else None,
                    "weight": float(p.get("handicapValeur") or p.get("poidsConditionMontee") or 0) or None,
                    "odds_final": to_float(p.get("coteDirect") or (p.get("dernierRapportDirect") or {}).get("rapport")),
                    "odds_morning": to_float(p.get("rapportProbable")),
                    "finish_position": finish_position,
                    "is_scratched": is_scratched,
                    "form_string": str(p.get("musique") or "").strip() or None,
                    "last_5_positions": parse_musique(p.get("musique")),
                })

            all_races.append({
                "race_id": race_id,
                "race_date": day.isoformat(),
                "race_time": parse_heure(course.get("heureDepart")),
                "hippodrome": hippodrome,
                "race_number": course_num,
                "race_type": race_type,
                "distance": course.get("distance", 0),
                "terrain": normalize_terrain(terrain_raw),
                "prize_pool": course.get("montantPrix"),
                "num_runners": len([r for r in runners if not r["is_scratched"]]) or course.get("nombreDeclaresPartants"),
                "is_quinteplus": is_quinteplus,
                "runners": runners,
            })

    return all_races


def save_races(conn: sqlite3.Connection, races: list[dict]) -> tuple[int, int]:
    inserted_races = 0
    inserted_runners = 0

    for race in races:
        rid = race["race_id"]
        existing = conn.execute("SELECT id FROM pmu_races WHERE race_id = ?", (rid,)).fetchone()
        if existing:
            continue

        conn.execute(
            """INSERT INTO pmu_races
            (race_id, race_date, race_time, hippodrome, race_number, race_type,
             distance, terrain, prize_pool, num_runners, is_quinteplus, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
            (rid, race["race_date"], race.get("race_time"), race["hippodrome"],
             race["race_number"], race["race_type"], race["distance"],
             race.get("terrain"), race.get("prize_pool"), race.get("num_runners"),
             int(race.get("is_quinteplus", False))),
        )
        race_pk = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        inserted_races += 1

        for runner in race.get("runners", []):
            conn.execute(
                """INSERT INTO pmu_runners
                (race_id, number, horse_name, jockey_name, trainer_name, age, weight,
                 odds_final, odds_morning, finish_position, is_scratched, form_string,
                 last_5_positions, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
                (race_pk, runner["number"], runner["horse_name"], runner.get("jockey_name"),
                 runner.get("trainer_name"), runner.get("age"), runner.get("weight"),
                 runner.get("odds_final"), runner.get("odds_morning"),
                 runner.get("finish_position"), int(runner.get("is_scratched", False)),
                 runner.get("form_string"), runner.get("last_5_positions")),
            )
            inserted_runners += 1

    conn.commit()
    return inserted_races, inserted_runners


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Fast PMU data collector")
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS, help="Number of days to collect (default: 180)")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY, help="Delay between API calls in seconds (default: 0.3)")
    parser.add_argument("--start", type=str, default=None, help="Start date YYYY-MM-DD (default: end - days)")
    parser.add_argument("--end", type=str, default=None, help="End date YYYY-MM-DD (default: 2026-03-12)")
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)
    end_date = date.fromisoformat(args.end) if args.end else date(2026, 3, 12)
    start_date = date.fromisoformat(args.start) if args.start else end_date - timedelta(days=args.days - 1)
    num_days = (end_date - start_date).days + 1

    print(f"Collecting PMU data: {start_date} -> {end_date} ({num_days} days)")
    print(f"API delay: {args.delay}s between participant calls")

    total_races = 0
    total_runners = 0
    failed_days = []
    current = start_date

    while current <= end_date:
        print(f"\n[{current.isoformat()}] Collecting...", end=" ", flush=True)
        try:
            races = collect_day(current, args.delay)
            if races:
                nr, nrun = save_races(conn, races)
                total_races += nr
                total_runners += nrun
                print(f"{len(races)} races fetched, {nr} new inserted ({nrun} runners)")
            else:
                print("no races found")
                failed_days.append(current.isoformat())
        except Exception as e:
            print(f"ERROR: {e}")
            failed_days.append(current.isoformat())

        current += timedelta(days=1)

    conn.close()
    print(f"\nDone! Total: {total_races} races, {total_runners} runners inserted")
    print(f"Failed days: {len(failed_days)}")
    print(f"DB: {DB_PATH}")


if __name__ == "__main__":
    main()
