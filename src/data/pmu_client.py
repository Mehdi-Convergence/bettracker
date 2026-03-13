"""Client PMU live — recupere le programme du jour avec partants et cotes.

Utilise l'API semi-officielle turfinfo.api.pmu.fr.
"""

import logging
import time
from datetime import datetime, timezone

import requests

from src.data.pmu_collector import PMUCollector, PMU_API_BASE, _HEADERS

logger = logging.getLogger(__name__)

CACHE_TTL = 900  # 15 minutes


class PMUClient:
    """Client temps reel pour les courses PMU du jour."""

    def __init__(self):
        self._collector = PMUCollector(request_delay=0.5)
        self._session = requests.Session()
        self._session.headers.update(_HEADERS)
        self._cache: dict = {}
        self._cache_ts: float = 0.0

    # ------------------------------------------------------------------
    # API publique
    # ------------------------------------------------------------------

    def get_today_races(self, force: bool = False) -> dict:
        """Retourne les courses du jour avec partants et cotes.

        Dict retourne:
        {
            "races": [...],          # liste de dicts course
            "date": "YYYYMMDD",
            "_cached_at": float,
            "_from_cache": bool,
            "_error": str | None,
        }
        """
        today_str = datetime.now(timezone.utc).strftime("%Y%m%d")

        if not force and self._is_cache_valid():
            logger.debug("PMU cache hit pour %s", today_str)
            return {**self._cache, "_from_cache": True}

        races = self._collector.collect_day(today_str)

        result: dict = {
            "races": races,
            "date": today_str,
            "_cached_at": time.time(),
            "_from_cache": False,
            "_error": None if races else "no_data",
        }

        if races:
            self._cache = result
            self._cache_ts = time.time()

        return result

    def get_race_detail(self, race_id: str) -> dict | None:
        """Retourne le detail d'une course specifique par son race_id.

        Le race_id est au format 'YYYYMMDD-RX-CY'.
        Utilise les donnees deja chargees via get_today_races() si disponibles.
        """
        # Essai depuis le cache local
        if self._cache.get("races"):
            for race in self._cache["races"]:
                if race.get("race_id") == race_id:
                    return race

        # Parse le race_id pour reconstruire la requete
        parts = race_id.split("-")
        if len(parts) < 3:
            logger.warning("Format race_id invalide: %s", race_id)
            return None

        date_str = parts[0]
        reunion_part = parts[1]  # ex: "R1"
        course_part = parts[2]   # ex: "C3"

        if not reunion_part.startswith("R") or not course_part.startswith("C"):
            logger.warning("Format race_id invalide: %s", race_id)
            return None

        try:
            reunion_num = int(reunion_part[1:])
            course_num = int(course_part[1:])
        except ValueError:
            logger.warning("Impossible de parser race_id: %s", race_id)
            return None

        url = f"{PMU_API_BASE}/{date_str}/R{reunion_num}/C{course_num}"
        try:
            resp = self._session.get(url, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            logger.error("Echec recuperation course %s: %s", race_id, e)
            return None
        except ValueError as e:
            logger.error("Reponse non-JSON pour %s: %s", race_id, e)
            return None

        # Recup des infos hippodrome depuis le programme jour si possible
        hippodrome = (
            data.get("hippodrome", {}).get("libelleCourt")
            or data.get("hippodrome", {}).get("libelleLong")
            or "Inconnu"
        )

        try:
            parsed = self._collector._parse_course(
                data, hippodrome, reunion_num, date_str
            )
        except Exception as e:
            logger.error("Erreur parsing course %s: %s", race_id, e)
            return None

        return parsed

    def get_quinteplus_race(self) -> dict | None:
        """Retourne la course Quinte+ du jour, ou None si inexistante."""
        data = self.get_today_races()
        for race in data.get("races", []):
            if race.get("is_quinteplus"):
                return race
        return None

    # ------------------------------------------------------------------
    # Helpers internes
    # ------------------------------------------------------------------

    def _is_cache_valid(self) -> bool:
        """Verifie si le cache local est encore valide (TTL 15 min)."""
        if not self._cache or not self._cache_ts:
            return False
        return (time.time() - self._cache_ts) < CACHE_TTL
