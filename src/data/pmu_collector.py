"""Collecteur de resultats PMU via l'API semi-officielle turfinfo.

Endpoint de base: https://online.turfinfo.api.pmu.fr/rest/client/1/programme/
Format date: DDMMYYYY
Participants: appel separe par course /programme/{date}/R{num}/C{num}/participants
"""

import json
import logging
import time
from datetime import date, timedelta

import requests
from sqlalchemy.orm import Session

from src.database import SessionLocal
from src.models.pmu_race import PMURace, PMURunner

logger = logging.getLogger(__name__)

PMU_API_BASE = "https://online.turfinfo.api.pmu.fr/rest/client/1/programme"

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; BetTracker/1.0)",
    "Accept": "application/json",
}

REQUEST_DELAY = 1.5


class PMUCollector:
    """Collecte les courses PMU depuis l'API turfinfo et les stocke en base."""

    def __init__(self, request_delay: float = REQUEST_DELAY):
        self.request_delay = request_delay
        self.session = requests.Session()
        self.session.headers.update(_HEADERS)

    def collect_day(self, day: date) -> list[dict]:
        """Recupere toutes les courses pour un jour donne.

        Retourne une liste de dicts course avec leurs partants.
        """
        date_str = day.strftime("%d%m%Y")
        url = f"{PMU_API_BASE}/{date_str}"
        try:
            resp = self.session.get(url, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            logger.error("Echec programme PMU pour %s: %s", date_str, e)
            return []
        except ValueError:
            logger.error("Reponse PMU non-JSON pour %s", date_str)
            return []

        reunions = data.get("programme", {}).get("reunions", [])
        if not reunions:
            reunions = data.get("reunions", [])
        if not reunions:
            logger.warning("Aucune reunion pour %s", date_str)
            return []

        all_races: list[dict] = []
        for reunion in reunions:
            races = self._parse_reunion(reunion, day, date_str)
            all_races.extend(races)

        logger.info("%d courses recuperees pour %s", len(all_races), date_str)
        return all_races

    def collect_range(self, start_date: date, end_date: date) -> dict:
        """Collecte et ingere les courses sur une plage de dates."""
        db = SessionLocal()
        total_races = 0
        total_runners = 0
        current = start_date

        try:
            while current <= end_date:
                logger.info("Collecte PMU %s...", current.isoformat())
                races = self.collect_day(current)
                for race_data in races:
                    inserted = self.save_race(race_data, db)
                    if inserted:
                        total_races += 1
                        total_runners += len(race_data.get("runners", []))

                current += timedelta(days=1)
                time.sleep(self.request_delay)
        finally:
            db.close()

        logger.info("PMU: %d courses, %d partants inseres", total_races, total_runners)
        return {"total_races": total_races, "total_runners": total_runners}

    def save_race(self, race_data: dict, db: Session) -> bool:
        """Insere une course et ses partants en base (dedup sur race_id)."""
        race_id = race_data.get("race_id")
        if not race_id:
            return False

        existing = db.query(PMURace).filter(PMURace.race_id == race_id).first()
        if existing:
            return False

        try:
            race = PMURace(
                race_id=race_id,
                race_date=race_data["race_date"],
                race_time=race_data.get("race_time"),
                hippodrome=race_data.get("hippodrome", "Inconnu"),
                race_number=race_data.get("race_number", 0),
                race_type=race_data.get("race_type", "plat"),
                distance=race_data.get("distance", 0),
                terrain=race_data.get("terrain"),
                prize_pool=race_data.get("prize_pool"),
                num_runners=race_data.get("num_runners"),
                is_quinteplus=race_data.get("is_quinteplus", False),
            )
            db.add(race)
            db.flush()

            for runner_data in race_data.get("runners", []):
                runner = PMURunner(
                    race_id=race.id,
                    number=runner_data.get("number", 0),
                    horse_name=runner_data.get("horse_name", "Inconnu"),
                    jockey_name=runner_data.get("jockey_name"),
                    trainer_name=runner_data.get("trainer_name"),
                    age=runner_data.get("age"),
                    weight=runner_data.get("weight"),
                    odds_final=runner_data.get("odds_final"),
                    odds_morning=runner_data.get("odds_morning"),
                    finish_position=runner_data.get("finish_position"),
                    is_scratched=runner_data.get("is_scratched", False),
                    form_string=runner_data.get("form_string"),
                    last_5_positions=runner_data.get("last_5_positions"),
                )
                db.add(runner)

            db.commit()
            return True

        except Exception as e:
            db.rollback()
            logger.error("Erreur insertion course %s: %s", race_id, e)
            return False

    # ------------------------------------------------------------------
    # Parsing interne
    # ------------------------------------------------------------------

    def _parse_reunion(self, reunion: dict, day: date, date_str: str) -> list[dict]:
        """Parse une reunion PMU et retourne ses courses normalisees."""
        hippodrome = (
            reunion.get("hippodrome", {}).get("libelleCourt")
            or reunion.get("hippodrome", {}).get("libelleLong")
            or "Inconnu"
        )
        reunion_num = reunion.get("numOfficiel", reunion.get("numero", 0))

        courses = reunion.get("courses", [])
        races: list[dict] = []

        for course in courses:
            try:
                parsed = self._parse_course(course, hippodrome, reunion_num, day, date_str)
                if parsed:
                    races.append(parsed)
            except Exception as e:
                logger.warning("Erreur parsing course: %s", e)

        return races

    def _parse_course(
        self,
        course: dict,
        hippodrome: str,
        reunion_num: int,
        day: date,
        date_str: str,
    ) -> dict | None:
        """Parse une course et recupere les partants via appel API separe."""
        course_num = course.get("numOrdre", course.get("numOfficiel", 0))
        race_id = f"{day.isoformat()}-R{reunion_num}-C{course_num}"

        # Heure de depart
        heure_depart = course.get("heureDepart")
        race_time = self._parse_heure(heure_depart)

        # Type de course
        discipline = course.get("discipline", course.get("specialite", "PLAT"))
        race_type = self._normalize_discipline(str(discipline).upper())

        # Terrain
        terrain_raw = course.get("conditionSol") or course.get("terrain") or course.get("etatPiste")
        terrain = self._normalize_terrain(terrain_raw)

        # Quinte+
        is_quinteplus = bool(
            course.get("categorieParticularite") == "QUINTE_PLUS"
            or course.get("quinteplus")
        )

        # Recuperer les partants via appel separe
        participants = self._fetch_participants(date_str, reunion_num, course_num)
        runners = [self._parse_participant(p) for p in participants]
        runners = [r for r in runners if r is not None]

        return {
            "race_id": race_id,
            "race_date": day,
            "race_time": race_time,
            "hippodrome": hippodrome,
            "race_number": course_num,
            "race_type": race_type,
            "distance": course.get("distance", 0),
            "terrain": terrain,
            "prize_pool": course.get("montantPrix"),
            "num_runners": len(runners) or course.get("nombreDeclaresPartants"),
            "is_quinteplus": is_quinteplus,
            "runners": runners,
        }

    def _fetch_participants(self, date_str: str, reunion_num: int, course_num: int) -> list[dict]:
        """Recupere les partants d'une course via l'endpoint dedie."""
        url = f"{PMU_API_BASE}/{date_str}/R{reunion_num}/C{course_num}/participants"
        time.sleep(self.request_delay)
        try:
            resp = self.session.get(url, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            return data.get("participants", [])
        except requests.RequestException as e:
            logger.debug("Echec participants R%d/C%d: %s", reunion_num, course_num, e)
            return []
        except ValueError:
            return []

    def _parse_participant(self, p: dict) -> dict | None:
        """Parse un partant (cheval)."""
        horse_name = p.get("nom")
        if not horse_name:
            return None

        number = p.get("numPmu", 0)

        # Jockey/Driver
        jockey = p.get("driver") or p.get("jockey")

        # Entraineur
        trainer = p.get("entraineur")

        # Forme musicale (ex: "1a3p2p0a")
        musique = p.get("musique")

        # Non-partant
        is_scratched = bool(
            p.get("nonPartant")
            or p.get("statut") == "NON_PARTANT"
        )

        # Age et poids
        age = p.get("age")
        poids = p.get("handicapValeur") or p.get("poidsConditionMontee")

        # Cotes — rapport direct (live) et probable (matin)
        odds_final = self._to_float(p.get("coteDirect") or p.get("dernierRapportDirect", {}).get("rapport"))
        odds_morning = self._to_float(p.get("rapportProbable"))

        # Position d'arrivee (si course terminee)
        finish_position = p.get("ordreArrivee")
        if isinstance(finish_position, str):
            try:
                finish_position = int(finish_position)
            except ValueError:
                finish_position = None

        # Dernieres positions depuis la musique
        last_5 = self._parse_musique_positions(musique)
        last_5_json = json.dumps(last_5) if last_5 else None

        return {
            "number": number,
            "horse_name": str(horse_name).strip(),
            "jockey_name": str(jockey).strip() if jockey else None,
            "trainer_name": str(trainer).strip() if trainer else None,
            "age": int(age) if age is not None else None,
            "weight": float(poids) if poids is not None else None,
            "odds_final": odds_final,
            "odds_morning": odds_morning,
            "finish_position": finish_position,
            "is_scratched": is_scratched,
            "form_string": str(musique).strip() if musique else None,
            "last_5_positions": last_5_json,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_heure(heure_depart) -> str | None:
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

    @staticmethod
    def _normalize_discipline(discipline: str) -> str:
        mapping = {
            "PLAT": "plat",
            "TROT_ATTELE": "trot_attele",
            "TROT_MONTE": "trot_monte",
            "ATTELE": "trot_attele",
            "MONTE": "trot_monte",
            "OBSTACLE": "obstacle",
            "HAIES": "obstacle",
            "STEEPLE": "obstacle",
            "STEEPLE_CHASE": "obstacle",
            "CROSS": "obstacle",
        }
        return mapping.get(discipline.upper(), "plat")

    @staticmethod
    def _normalize_terrain(terrain_raw) -> str | None:
        if not terrain_raw:
            return None
        terrain_str = str(terrain_raw).upper()
        mapping = {
            "BON": "bon",
            "BON_A_SEC": "bon",
            "SEC": "sec",
            "LEGER": "leger",
            "BON_A_SOUPLE": "souple",
            "SOUPLE": "souple",
            "TRES_SOUPLE": "tres_souple",
            "LOURD": "lourd",
            "COLLANT": "collant",
        }
        return mapping.get(terrain_str, terrain_str.lower())

    @staticmethod
    def _parse_musique_positions(musique: str | None) -> list[int]:
        """Extrait les positions des 5 dernieres courses depuis la musique PMU.

        Format musique: '1a3p2p0a5a' -> [1, 3, 2, 0, 5]
        Les lettres indiquent le type de piste (a=attele, p=plat, etc.)
        """
        if not musique:
            return []
        positions: list[int] = []
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
        return positions[:5]

    @staticmethod
    def _to_float(val) -> float | None:
        if val is None:
            return None
        try:
            f = float(val)
            return f if f > 0 else None
        except (ValueError, TypeError):
            return None
