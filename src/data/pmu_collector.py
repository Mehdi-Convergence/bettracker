"""Collecteur de resultats PMU via l'API semi-officielle turfinfo.

Endpoint de base: https://online.turfinfo.api.pmu.fr/rest/client/1/programme/
"""

import json
import logging
import time
from datetime import date, timedelta

import requests
from rich.console import Console
from sqlalchemy.orm import Session

from src.database import SessionLocal
from src.models.pmu_race import PMURace, PMURunner

logger = logging.getLogger(__name__)
console = Console()

PMU_API_BASE = "https://online.turfinfo.api.pmu.fr/rest/client/1/programme"

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; BetTracker/1.0)",
    "Accept": "application/json",
}

# Delai entre chaque requete (respecter les serveurs PMU)
REQUEST_DELAY = 2.0


class PMUCollector:
    """Collecte les courses PMU depuis l'API turfinfo et les stocke en base."""

    def __init__(self, request_delay: float = REQUEST_DELAY):
        self.request_delay = request_delay
        self.session = requests.Session()
        self.session.headers.update(_HEADERS)

    # ------------------------------------------------------------------
    # API publique
    # ------------------------------------------------------------------

    def collect_day(self, date_str: str) -> list[dict]:
        """Recupere toutes les courses pour un jour donne (format YYYYMMDD).

        Retourne une liste de dicts course avec leurs partants.
        Retourne une liste vide en cas d'echec.
        """
        url = f"{PMU_API_BASE}/{date_str}"
        try:
            resp = self.session.get(url, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            logger.error("Echec recuperation programme PMU pour %s: %s", date_str, e)
            return []
        except ValueError as e:
            logger.error("Reponse PMU invalide (non-JSON) pour %s: %s", date_str, e)
            return []

        reunions = data.get("programme", {}).get("reunions", [])
        if not reunions:
            # Certaines API retournent directement une liste de reunions
            reunions = data.get("reunions", [])

        if not reunions:
            logger.warning("Aucune reunion trouvee pour %s", date_str)
            return []

        all_races: list[dict] = []
        for reunion in reunions:
            races = self._parse_reunion(reunion, date_str)
            all_races.extend(races)
            time.sleep(self.request_delay)

        logger.info("%d courses recuperees pour %s", len(all_races), date_str)
        return all_races

    def collect_range(self, start_date: date, end_date: date) -> dict:
        """Collecte et ingere les courses sur une plage de dates.

        Retourne un dict avec les statistiques d'ingestion.
        """
        db = SessionLocal()
        total_races = 0
        total_runners = 0
        current = start_date

        try:
            while current <= end_date:
                date_str = current.strftime("%Y%m%d")
                console.print(f"[dim]Collecte PMU {date_str}...[/dim]")

                races = self.collect_day(date_str)
                for race_data in races:
                    inserted = self.save_race(race_data, db)
                    if inserted:
                        total_races += 1
                        total_runners += len(race_data.get("runners", []))

                current += timedelta(days=1)
                time.sleep(self.request_delay)
        finally:
            db.close()

        console.print(
            f"[bold green]PMU: {total_races} courses, "
            f"{total_runners} partants inseres[/bold green]"
        )
        return {"total_races": total_races, "total_runners": total_runners}

    def save_race(self, race_data: dict, db: Session) -> bool:
        """Insere une course et ses partants en base (dedup sur race_id).

        Retourne True si insere, False si existant ou erreur.
        """
        race_id = race_data.get("race_id")
        if not race_id:
            logger.warning("Course sans race_id, ignoree")
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
            db.flush()  # obtenir l'id avant d'inserer les runners

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

    def _parse_reunion(self, reunion: dict, date_str: str) -> list[dict]:
        """Parse une reunion PMU et retourne ses courses normalisees."""
        hippodrome = (
            reunion.get("hippodrome", {}).get("libelleCourt")
            or reunion.get("hippodrome", {}).get("libelleLong")
            or reunion.get("libelle", "Inconnu")
        )
        reunion_num = reunion.get("numOfficiel", reunion.get("numero", 0))

        courses = reunion.get("courses", [])
        races: list[dict] = []

        for course in courses:
            try:
                parsed = self._parse_course(course, hippodrome, reunion_num, date_str)
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
        date_str: str,
    ) -> dict | None:
        """Parse une course individuelle."""
        course_num = course.get("numOfficiel", course.get("numero", 0))
        race_id = f"{date_str}-R{reunion_num}-C{course_num}"

        # Date
        race_date = date(
            int(date_str[:4]),
            int(date_str[4:6]),
            int(date_str[6:8]),
        )

        # Heure de depart
        heure_depart = course.get("heureDepart")
        race_time = self._parse_heure(heure_depart)

        # Type de course
        discipline = course.get("discipline", "PLAT").upper()
        race_type = self._normalize_discipline(discipline)

        # Terrain
        terrain_raw = course.get("terrain", course.get("etatPiste"))
        terrain = self._normalize_terrain(terrain_raw)

        # Partants
        participants = course.get("participants", [])
        runners = [self._parse_participant(p) for p in participants]
        runners = [r for r in runners if r is not None]

        # Quinte+
        is_quinteplus = bool(
            course.get("categorieParticularite") == "QUINTE_PLUS"
            or course.get("quinteplus")
        )

        return {
            "race_id": race_id,
            "race_date": race_date,
            "race_time": race_time,
            "hippodrome": hippodrome,
            "race_number": course_num,
            "race_type": race_type,
            "distance": course.get("distance", 0),
            "terrain": terrain,
            "prize_pool": course.get("montantPrix", course.get("allocations")),
            "num_runners": len(runners) or course.get("nombreDeclaresPartants"),
            "is_quinteplus": is_quinteplus,
            "runners": runners,
        }

    def _parse_participant(self, participant: dict) -> dict | None:
        """Parse un partant (cheval)."""
        horse_name = (
            participant.get("nom")
            or participant.get("cheval", {}).get("nom")
        )
        if not horse_name:
            return None

        number = participant.get("numPmu", participant.get("numero", 0))

        jockey = (
            participant.get("jockey", {}).get("nom")
            or participant.get("nomJockey")
        )
        trainer = (
            participant.get("entraineur", {}).get("nom")
            or participant.get("nomEntraineur")
        )

        # Cotes
        cote_final = participant.get("cote", participant.get("coteDirect"))
        cote_matin = participant.get("coteMatin", participant.get("coteOuverture"))

        # Forme: convertir la liste de derniers resultats en string JSON
        derniers_resultats = participant.get("dernieresCourses", [])
        positions = self._extract_last_positions(derniers_resultats)
        last_5_positions = json.dumps(positions) if positions else None

        # Forme string PMU (ex: "1a3p2p")
        form_string = participant.get("ordreArrivee", participant.get("formule"))

        # Non-partant
        is_scratched = bool(
            participant.get("nonPartant")
            or participant.get("statut") == "NON_PARTANT"
        )

        # Age et poids
        age = participant.get("age")
        if age is None:
            age = participant.get("cheval", {}).get("age")
        poids = participant.get("poidsConditionMontee", participant.get("poids"))

        # Position d'arrivee (resultat si course terminee)
        finish_position = participant.get("ordreArrivee")
        if isinstance(finish_position, str):
            try:
                finish_position = int(finish_position)
            except ValueError:
                finish_position = None

        return {
            "number": number,
            "horse_name": str(horse_name).strip(),
            "jockey_name": str(jockey).strip() if jockey else None,
            "trainer_name": str(trainer).strip() if trainer else None,
            "age": int(age) if age is not None else None,
            "weight": float(poids) if poids is not None else None,
            "odds_final": self._to_float(cote_final),
            "odds_morning": self._to_float(cote_matin),
            "finish_position": finish_position,
            "is_scratched": is_scratched,
            "form_string": str(form_string).strip() if form_string else None,
            "last_5_positions": last_5_positions,
        }

    # ------------------------------------------------------------------
    # Helpers de normalisation
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_heure(heure_depart) -> str | None:
        """Convertit un timestamp ou string heure en format 'HHhMM'."""
        if heure_depart is None:
            return None
        if isinstance(heure_depart, int):
            # Timestamp en millisecondes depuis minuit
            total_minutes = heure_depart // 60000
            hours = total_minutes // 60
            minutes = total_minutes % 60
            return f"{hours:02d}h{minutes:02d}"
        if isinstance(heure_depart, str):
            return heure_depart[:5].replace(":", "h")
        return None

    @staticmethod
    def _normalize_discipline(discipline: str) -> str:
        """Convertit la discipline PMU vers les constantes internes."""
        mapping = {
            "PLAT": "plat",
            "TROT_ATTELE": "trot_attele",
            "TROT_MONTE": "trot_monte",
            "OBSTACLE": "obstacle",
            "HAIES": "obstacle",
            "STEEPLE": "obstacle",
            "CROSS": "obstacle",
        }
        return mapping.get(discipline.upper(), "plat")

    @staticmethod
    def _normalize_terrain(terrain_raw) -> str | None:
        """Normalise le terrain vers les constantes internes."""
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
    def _extract_last_positions(derniers_resultats: list) -> list[int]:
        """Extrait les 5 dernieres positions d'arrivee depuis la liste PMU."""
        positions = []
        for r in derniers_resultats[:5]:
            pos = r.get("ordreArrivee") if isinstance(r, dict) else None
            if pos is not None:
                try:
                    positions.append(int(pos))
                except (ValueError, TypeError):
                    pass
        return positions

    @staticmethod
    def _to_float(val) -> float | None:
        if val is None:
            return None
        try:
            f = float(val)
            return f if f > 0 else None
        except (ValueError, TypeError):
            return None
