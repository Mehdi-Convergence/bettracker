"""PMU scan worker — pre-computes PMU scans on schedule.

Contient run_pmu_scan() et ses helpers (model loader).
"""

import json
import logging
import time
from pathlib import Path

from src.cache import cache_set
from src.workers.scan_common import (
    PMU_SCAN_INTERVAL,
    _track_scan_result,
)

logger = logging.getLogger("scan_worker.pmu")

_PMU_FILE_CACHE_DIR = Path("data/cache/pmu")


def _load_pmu_models():
    """Charge les modeles PMU win + place si disponibles. Retourne (win_model, place_model) ou (None, None)."""
    try:
        from src.ml.pmu_model import PMUWinModel, PMUPlaceModel, MODEL_DIR_WIN, MODEL_DIR_PLACE
        if not (MODEL_DIR_WIN / "model.joblib").exists():
            return None, None
        if not (MODEL_DIR_PLACE / "model.joblib").exists():
            return None, None
        win_model = PMUWinModel.load_from_dir(MODEL_DIR_WIN)
        place_model = PMUPlaceModel.load_from_dir(MODEL_DIR_PLACE)
        return win_model, place_model
    except Exception as exc:
        logger.warning("PMU models not available: %s", exc)
        return None, None


def _collect_today_pmu():
    """Collecte les courses PMU du jour si pas deja en base."""
    try:
        import datetime as _dt
        from src.database import SessionLocal
        from src.models.pmu_race import PMURace
        from src.data.pmu_collector import PMUCollector

        db = SessionLocal()
        today = _dt.date.today()
        existing = db.query(PMURace).filter(PMURace.race_date == today).count()
        db.close()

        if existing > 0:
            logger.debug("PMU: %d courses deja en base pour %s — skip collect", existing, today)
            return

        logger.info("PMU: collecte du programme du jour %s...", today)
        collector = PMUCollector(request_delay=1.0)
        result = collector.collect_range(today, today)
        logger.info("PMU: collecte terminee — %d courses, %d partants", result["total_races"], result["total_runners"])
    except Exception as exc:
        logger.error("PMU collect error: %s", exc)


async def run_pmu_scan():
    """Run PMU scan — recupere le programme du jour et calcule les edges."""
    from src.services.probability_calculator import calculate_pmu
    from src.api.schemas import PMURaceCard, PMURunnerCard

    t0 = time.time()

    # Collecte auto du programme du jour si pas en base
    _collect_today_pmu()

    # Charger les modeles PMU si disponibles
    win_model, place_model = _load_pmu_models()
    if win_model and place_model:
        from src.features.pmu_features import PMU_FEATURE_COLUMNS
        logger.info("PMU ML models loaded (%d features)", len(PMU_FEATURE_COLUMNS))
    else:
        logger.info("PMU ML models not available — using implied probabilities only")

    # Recuperer les courses PMU depuis la base de donnees (races du jour ou a venir)
    races_out: list[PMURaceCard] = []
    try:
        import datetime as _dt
        from src.database import SessionLocal
        from src.models.pmu_race import PMURace, PMURunner

        db = SessionLocal()
        today = _dt.date.today()
        races = (
            db.query(PMURace)
            .filter(PMURace.race_date >= today)
            .order_by(PMURace.race_date, PMURace.race_number)
            .all()
        )
        race_ids = {r.id for r in races}
        runners_all = (
            db.query(PMURunner)
            .filter(PMURunner.race_id.in_(race_ids), PMURunner.is_scratched.is_(False))
            .all()
        )
        db.close()

        # Regrouper les partants par course
        runners_by_race: dict[int, list[PMURunner]] = {}
        for ru in runners_all:
            runners_by_race.setdefault(ru.race_id, []).append(ru)

        for race in races:
            race_runners = runners_by_race.get(race.id, [])

            # Construire les runners cards avec enrichissement ML si dispo
            runner_dicts: list[dict] = []
            for ru in sorted(race_runners, key=lambda x: x.number):
                # Parsing last_5_positions JSON
                last5: list[int] | None = None
                if ru.last_5_positions:
                    try:
                        import json as _json_inner
                        last5 = _json_inner.loads(ru.last_5_positions)
                    except Exception:
                        pass

                runner_dicts.append({
                    "number": ru.number,
                    "horse_name": ru.horse_name,
                    "jockey": ru.jockey_name,
                    "trainer": ru.trainer_name,
                    "weight": ru.weight,
                    "odds": ru.odds_final,
                    "odds_morning": ru.odds_morning,
                    "form": ru.form_string,
                    "last_5": last5,
                    "model_prob_win": None,
                    "model_prob_place": None,
                    "edge_win": None,
                    "edge_place": None,
                })

            # Enrichir avec ML si disponible
            if win_model and place_model and runner_dicts:
                try:
                    from src.features.pmu_features import PMUFeatureBuilder, PMU_FEATURE_COLUMNS
                    import numpy as np
                    import json as _json

                    # Charger les medians du modele pour imputer les NaN
                    metadata_path = Path("models/pmu/win_model/metadata.json")
                    col_medians = None
                    if metadata_path.exists():
                        meta = _json.loads(metadata_path.read_text())
                        col_medians = np.array(meta.get("col_medians", []))

                    # Construire le feature builder avec l'historique complet
                    builder = PMUFeatureBuilder()

                    # Charger les courses passees pour construire les caches
                    db2 = SessionLocal()
                    past_races = (
                        db2.query(PMURace)
                        .filter(PMURace.race_date < today)
                        .order_by(PMURace.race_date)
                        .all()
                    )
                    past_race_ids = {r.id for r in past_races}
                    past_runners = (
                        db2.query(PMURunner)
                        .filter(PMURunner.race_id.in_(past_race_ids), PMURunner.is_scratched.is_(False))
                        .all()
                    )
                    db2.close()

                    # Alimenter les caches du builder avec les courses passees
                    past_runners_by_race: dict[int, list] = {}
                    for ru in past_runners:
                        past_runners_by_race.setdefault(ru.race_id, []).append(ru)

                    for pr in past_races:
                        for ru in past_runners_by_race.get(pr.id, []):
                            finish = ru.finish_position
                            if finish is None:
                                continue
                            builder._update_cache(
                                runner={
                                    "horse_name": ru.horse_name,
                                    "jockey_name": ru.jockey_name,
                                    "trainer_name": ru.trainer_name,
                                    "finish_position": finish,
                                    "weight": ru.weight,
                                },
                                race_date=pr.race_date,
                                hippodrome=pr.hippodrome,
                                race_type=pr.race_type,
                                distance=pr.distance or 0,
                                terrain=pr.terrain or "",
                                prize_pool=pr.prize_pool or 0,
                            )

                    logger.info(
                        "PMU feature builder: %d horses, %d jockeys, %d trainers in cache",
                        len(builder.horse_history),
                        len(builder.jockey_history),
                        len(builder.trainer_history),
                    )

                    # Construire les features pour les runners du jour
                    feat_rows = []
                    for rd in runner_dicts:
                        horse = rd.get("horse_name", "")
                        jockey = rd.get("jockey", "")
                        trainer = rd.get("trainer", "")
                        h_hist = builder.horse_history.get(horse, [])
                        j_hist = builder.jockey_history.get(jockey, [])
                        t_hist = builder.trainer_history.get(trainer, [])
                        c_hist = builder.combo_history.get((horse, jockey), [])

                        if h_hist:  # cheval a de l'historique
                            f = builder._build_features(
                                runner={
                                    "horse_name": horse,
                                    "jockey_name": jockey,
                                    "trainer_name": trainer,
                                    "weight": rd.get("weight"),
                                    "age": None,  # pas dispo en live
                                    "number": rd.get("number"),
                                    "odds_final": rd.get("odds"),
                                },
                                horse=horse,
                                jockey=jockey,
                                trainer=trainer,
                                h_hist=h_hist,
                                j_hist=j_hist,
                                t_hist=t_hist,
                                c_hist=c_hist,
                                race_date=race.race_date,
                                hippodrome=race.hippodrome or "",
                                race_type=race.race_type or "",
                                distance=race.distance or 0,
                                terrain=race.terrain or "",
                                prize_pool=race.prize_pool or 0,
                                num_runners_race=len(runner_dicts),
                                is_quinteplus=int(bool(race.is_quinteplus)),
                            )
                        else:  # pas d'historique - features minimales
                            odds_val = rd.get("odds")
                            implied = (1.0 / float(odds_val)) if odds_val and float(odds_val) > 1.0 else np.nan
                            f = {col: np.nan for col in PMU_FEATURE_COLUMNS}
                            f["odds_implied_prob"] = implied
                            f["num_runners"] = float(len(runner_dicts))
                            f["post_position"] = float(rd.get("number", 0))
                            f["is_quinteplus"] = float(int(bool(race.is_quinteplus)))
                            # Remplir jockey/trainer stats meme sans historique cheval
                            if j_hist:
                                f["jockey_win_rate_20"] = builder._win_rate(j_hist, 20)
                                f["jockey_place_rate_20"] = builder._place_rate(j_hist, 20)
                            if t_hist:
                                f["trainer_win_rate_20"] = builder._win_rate(t_hist, 20)
                                f["trainer_place_rate_20"] = builder._place_rate(t_hist, 20)

                        feat_rows.append(f)

                    X = np.array([[r.get(col, np.nan) for col in PMU_FEATURE_COLUMNS] for r in feat_rows], dtype=float)

                    # Imputer NaN avec les medians du training (pas 0!)
                    if col_medians is not None and len(col_medians) == X.shape[1]:
                        for col_idx in range(X.shape[1]):
                            mask = np.isnan(X[:, col_idx])
                            X[mask, col_idx] = col_medians[col_idx]
                    else:
                        X = np.where(np.isnan(X), 0.0, X)

                    proba_win = win_model.predict_proba(X)
                    proba_place = place_model.predict_proba(X)

                    for i, rd in enumerate(runner_dicts):
                        rd["model_prob_win"] = round(float(proba_win[i]), 4)
                        rd["model_prob_place"] = round(float(proba_place[i]), 4)
                        # Stocker le nb de features non-NaN pour data quality
                        rd["_features_available"] = int(np.sum(~np.isnan(np.array([feat_rows[i].get(c, np.nan) for c in PMU_FEATURE_COLUMNS]))))

                    # Enrichir avec stats pour le frontend
                    for i, rd in enumerate(runner_dicts):
                        horse = rd.get("horse_name", "")
                        jockey = rd.get("jockey", "")
                        trainer = rd.get("trainer", "")
                        h_hist = builder.horse_history.get(horse, [])
                        j_hist = builder.jockey_history.get(jockey, [])
                        t_hist = builder.trainer_history.get(trainer, [])

                        if h_hist:
                            rd["horse_win_rate"] = round(builder._win_rate(h_hist, 10), 3)
                            rd["horse_place_rate"] = round(builder._place_rate(h_hist, 10), 3)
                            rest = builder._rest_days(h_hist, race.race_date)
                            rd["rest_days"] = rest
                            rd["horse_runs"] = len(h_hist)
                        if j_hist:
                            rd["jockey_win_rate"] = round(builder._win_rate(j_hist, 20), 3)
                            rd["jockey_place_rate"] = round(builder._place_rate(j_hist, 20), 3)
                            rd["jockey_runs"] = len(j_hist)
                        if t_hist:
                            rd["trainer_win_rate"] = round(builder._win_rate(t_hist, 20), 3)
                            rd["trainer_place_rate"] = round(builder._place_rate(t_hist, 20), 3)
                            rd["trainer_runs"] = len(t_hist)

                except Exception as ml_exc:
                    logger.error("PMU ML enrichment failed: %s", ml_exc, exc_info=True)

            # Calculer edges via probability_calculator
            enriched = calculate_pmu(runner_dicts)

            runner_cards = []
            for rd in enriched:
                try:
                    runner_cards.append(PMURunnerCard(
                        number=rd["number"],
                        horse_name=rd["horse_name"],
                        jockey=rd.get("jockey"),
                        trainer=rd.get("trainer"),
                        weight=rd.get("weight"),
                        odds=rd.get("odds"),
                        odds_morning=rd.get("odds_morning"),
                        model_prob_win=rd.get("model_prob_win"),
                        model_prob_place=rd.get("model_prob_place"),
                        edge_win=rd.get("edge_win"),
                        edge_place=rd.get("edge_place"),
                        form=rd.get("form"),
                        last_5=rd.get("last_5"),
                    ))
                except Exception:
                    continue

            # Build ISO post_time from race_date + race_time (e.g. "14h30")
            _post_time: str | None = None
            if race.race_time and race.race_date:
                try:
                    _rt = race.race_time.replace("h", ":").replace("H", ":")
                    if len(_rt) == 4 and ":" not in _rt:
                        _rt = f"{_rt[:2]}:{_rt[2:]}"
                    _post_time = f"{race.race_date.isoformat()}T{_rt}:00"
                except Exception:
                    _post_time = race.race_time

            races_out.append(PMURaceCard(
                race_id=race.race_id,
                hippodrome=race.hippodrome,
                race_number=race.race_number,
                race_type=race.race_type,
                distance=race.distance,
                terrain=race.terrain,
                post_time=_post_time,
                prize_pool=race.prize_pool,
                num_runners=race.num_runners or len(runner_cards),
                is_quinteplus=race.is_quinteplus,
                runners=runner_cards,
            ))

    except Exception as exc:
        logger.error("PMU scan failed: %s", exc)
        return

    duration = time.time() - t0

    cache_payload = {
        "_cached_at": time.time(),
        "duration": duration,
        "races": [r.model_dump() for r in races_out],
    }
    cache_set("scan:pmu:all", cache_payload, ttl=PMU_SCAN_INTERVAL)
    cache_set("scan:meta:last_pmu", time.time(), ttl=86400)

    # File backup
    try:
        _PMU_FILE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        backup_file = _PMU_FILE_CACHE_DIR / "scan_result_pmu_latest.json"
        backup_file.write_text(json.dumps(cache_payload, ensure_ascii=False, default=str), encoding="utf-8")
    except Exception as exc:
        logger.warning("PMU file backup failed: %s", exc)

    _track_scan_result("pmu", len(races_out))

    logger.info("PMU scan completed: %d races in %.1fs", len(races_out), duration)
