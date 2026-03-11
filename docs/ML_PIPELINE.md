# Pipeline Machine Learning BetTracker

## Principes fondamentaux

**Regle n°1 — No look-ahead bias**
Toutes les features utilisees pour predire un match N sont calculees EXCLUSIVEMENT a partir des matchs qui ont eu lieu AVANT la date du match N. Le code garantit cela en construisant les features AVANT de mettre a jour les caches, puis en mettant a jour les caches APRES.

```python
# Pattern correct dans football_features.py
features = self._build_features_from_cache(match, ...)  # utilise le cache AVANT ce match
features_list.append(features)
self._update_caches(match, ...)  # met a jour le cache APRES extraction des features
```

**Regle n°2 — Walk-forward validation**
Jamais de cross-validation standard sur des series temporelles. Le modele est entraine sur les saisons precedentes et teste sur les saisons suivantes, en respectant l'ordre chronologique.

**Regle n°3 — Calibration prioritaire**
L'objectif est de minimiser le log-loss (calibration des probabilites), pas l'accuracy. Un modele bien calibre dit "60% de chance de victoire" et l'equipe gagne effectivement 60% du temps.

**Regle n°4 — CLV comme metrique gold standard**
La valeur d'une strategie se mesure au CLV moyen. Un CLV positif signifie que les paris sont places a de meilleures cotes que celles de cloture — signe que le modele detecte des inefficacites de marche avant qu'elles soient absorbees.

---

## Pipeline Football

### 1. Collecte des donnees

**Source** : football-data.co.uk CSVs
**Collecteur** : `src/data/football_collector.py` (classe `FootballDataCollector`)
**Saisons** : 1819, 1920, 2021, 2122, 2223, 2324, 2425 (7 saisons)
**Ligues** : E0, E1, E2, E3 (Angleterre), F1, F2 (France), D1, D2 (Allemagne), SP1, SP2 (Espagne), I1, I2 (Italie), B1 (Belgique), N1 (Pays-Bas), P1 (Portugal), SC0 (Ecosse)
**Total** : 38 799 matchs en base

Les CSV contiennent : equipes, date, buts (FT + HT), stats de jeu (tirs, corners, fautes, cartons), et cotes de plusieurs bookmakers dont Pinnacle (reference).

### 2. Feature Engineering Football

**Classe** : `FootballFeatureBuilder` dans `src/features/football_features.py`
**Execution** : `build_dataset(df)` — traitement chronologique avec caches incrementaux O(n)
**Minimum requis** : 3 matchs d'historique par equipe (les premiers matchs sont ignores)
**Output** : 38 006 lignes (matchs avec features) dans `data/processed/football_features.parquet`

#### Liste exhaustive des 67 features football (FEATURE_COLUMNS)

**ELO (3 features)**
- `elo_diff` : difference de rating ELO (home - away)
- `home_elo` : rating ELO absolu equipe domicile
- `away_elo` : rating ELO absolu equipe exterieure

**Forme globale (18 features)**
Rolling windows sur 3, 5 et 10 matchs, pour chaque equipe :
- `home_form_3`, `home_form_5`, `home_form_10` : points par match (PPG)
- `away_form_3`, `away_form_5`, `away_form_10` : PPG
- `home_goals_scored_3`, `home_goals_scored_5` : buts marqués/match en moyenne
- `home_goals_conceded_3`, `home_goals_conceded_5` : buts encaissés/match
- `away_goals_scored_3`, `away_goals_scored_5`
- `away_goals_conceded_3`, `away_goals_conceded_5`
- `home_goal_diff_3`, `home_goal_diff_5` : difference de buts moyenne
- `away_goal_diff_3`, `away_goal_diff_5`

**Forme specifique domicile/exterieur (2 features)**
- `home_home_form_5` : PPG equipe domicile dans ses matchs a domicile (last 5)
- `away_away_form_5` : PPG equipe exterieure dans ses matchs a l'exterieur (last 5)

**Tirs (5 features)**
- `home_shots_avg_5`, `away_shots_avg_5` : tirs moyens last 5
- `home_sot_avg_5`, `away_sot_avg_5` : tirs cadres moyens last 5
- `home_shot_accuracy_5` : SOT / shots (precision)

**H2H (4 features)**
Derniers 6 confrontations entre les deux equipes :
- `h2h_home_win_rate` : taux de victoire de l'equipe domicile dans ces confrontations
- `h2h_draw_rate` : taux de nuls
- `h2h_avg_goals` : buts moyens par match
- `h2h_count` : nombre de confrontations disponibles

**Temps de repos (3 features)**
- `home_rest_days` : jours depuis le dernier match (equipe domicile)
- `away_rest_days` : jours depuis le dernier match (equipe exterieure)
- `rest_diff` : home_rest_days - away_rest_days

**Classement (3 features)**
- `home_position` : position au classement dans la ligue cette saison
- `away_position` : position
- `position_diff` : home_position - away_position

**xG (3 features, souvent NaN)**
- `home_xg_avg_5` : xG marque moyen last 5 (domicile)
- `away_xg_avg_5` : xG marque moyen last 5 (exterieur)
- `home_xg_diff_5` : xG marque - xG concede (domicile, last 5)

**Lambda Poisson standard (5 features)**
- `lambda_home_5` : home_goals_scored_5 * away_goals_conceded_5 (prediction buts domicile)
- `lambda_away_5` : away_goals_scored_5 * home_goals_conceded_5
- `lambda_ratio_5` : lambda_home_5 / lambda_away_5
- `lambda_home_venue` : buts domicile a domicile * buts concedes exterieur a l'exterieur
- `lambda_away_venue` : buts exterieur a l'exterieur * buts concedes domicile a domicile

**Lambda Poisson pondere (exponential decay) (3 features)**
Poids : [0.05, 0.075, 0.125, 0.25, 0.50] du plus ancien au plus recent
- `lambda_home_weighted`, `lambda_away_weighted` : lambdas avec decroissance exponentielle
- `lambda_ratio_weighted`

**Probabilites implicites des bookmakers (3 features)**
Cotes Pinnacle normalisees (division par le vig) :
- `implied_home`, `implied_draw`, `implied_away`

**Lambda ajuste par qualite de l'adversaire (6 features)**
Buts ponderes par le rating ELO de l'adversaire (goals contre equipes fortes valent plus) :
- `home_adj_gs_5`, `home_adj_gc_5` : buts marques/concedes ajustes (domicile)
- `away_adj_gs_5`, `away_adj_gc_5`
- `lambda_adj_home`, `lambda_adj_away`

**Contexte ligue & saison (2 features)**
- `league_draw_rate` : taux de nuls observé dans cette ligue cette saison (sans ce match)
- `season_progress` : avancement de la saison en matchs (0 = debut, 1 = fin)

**Momentum ELO (2 features)**
- `home_elo_change_5` : changement de rating ELO sur les 5 derniers matchs
- `away_elo_change_5`

**Serie en cours (2 features)**
- `home_streak` : serie positive (victoires consecutives) ou negative (defaites)
- `away_streak` : idem

**Taux de clean sheets (2 features)**
- `home_clean_sheet_5` : proportion de matchs sans but encaisse (last 5, domicile)
- `away_clean_sheet_5`

**Vig bookmaker (1 feature)**
- `bookmaker_vig` : overround Pinnacle = (1/H + 1/D + 1/A) - 1 (plus eleve = marche plus sur)

**Stats enrichies API-Football (4 features, souvent NaN)**
- `home_possession`, `away_possession` : possession moyenne (pas disponible dans CSV)
- `home_corners_avg`, `away_corners_avg` : corners moyens last 5
- `home_cards_avg`, `away_cards_avg` : cartons jaunes moyens last 5

Note : les features xG sont exclues du modele final (`MODEL_FEATURES = [f for f in FEATURE_COLUMNS if "xg" not in f]`) car non disponibles pour les matchs futurs. Total features utilisees par le modele : ~63 features.

### 3. Modele Football

**Classe** : `FootballModel` dans `src/ml/football_model.py`
**Type** : Ensemble XGBoost + LightGBM multiclasse (3 classes : H=0, D=1, A=2)
**Poids** : 80% XGBoost + 20% LightGBM

**XGBoost — hyperparametres Optuna v6 (150 essais)**
```
objective=multi:softprob, num_class=3
n_estimators=205, max_depth=2, learning_rate=0.03655
subsample=0.4579, colsample_bytree=0.7459
min_child_weight=33, reg_alpha=2.683, reg_lambda=0.716, gamma=3.796
log_loss (OOF): 0.9809
```

**LightGBM — hyperparametres Optuna v6 (120 essais)**
```
objective=multiclass, num_class=3
n_estimators=504, max_depth=3, learning_rate=0.00740
subsample=0.6054, colsample_bytree=0.5297
min_child_samples=7, reg_alpha=1.661, reg_lambda=1.486, num_leaves=34
log_loss (OOF): 0.9825
```

**Calibration** : IsotonicRegression optionnelle par classe. En pratique le modele non calibré est utilise (XGBoost softprob est bien calibre nativement).

**Sortie** : `predict_proba(X)` → tableau `[P(H), P(D), P(A)]` de forme `(n_samples, 3)`

**Serialisation** : `models/football/model.joblib` contient `{base_model, lgb_model, calibrators}`

### 4. Walk-Forward Validation Football

**Classe** : `WalkForwardSplitter` dans `src/ml/walk_forward.py`
**Principe** : minimum 2 saisons d'entrainement, la saison de test avance d'une saison a chaque fold

Exemple de folds (7 saisons disponibles) :
```
Fold 1 : Train [1819, 1920] → Test [2021]
Fold 2 : Train [1819, 1920, 2021] → Test [2122]
Fold 3 : Train [1819, 1920, 2021, 2122] → Test [2223]
Fold 4 : Train [1819, 1920, 2021, 2122, 2223] → Test [2324]
Fold 5 : Train [1819, 1920, 2021, 2122, 2223, 2324] → Test [2425]
```

Pour le backtest live, les saisons de test sont fixes a `["2324", "2425"]` (les deux dernieres).

### 5. Detection de Value Bets Football

**Classe** : `ValueDetector` dans `src/ml/value_detector.py`

Pour chaque issue (H, D, A) :
```
implied_prob = 1 / cote_bookmaker
edge = model_prob - implied_prob
value_bet si edge > min_edge_threshold (defaut 5%)
```

Le modele combine ML + Poisson :
- ML (XGBoost+LightGBM) : 45% du poids
- Poisson (lambda_home, lambda_away) : 55% du poids
- Le blend est presente comme "45% ML + 55% Poisson" dans `/scanner/model-info`

### 6. Inference en temps reel (Scanner)

Le worker (`src/workers/scan_worker.py`) :
1. Appelle API-Football pour les matchs des prochains 48h
2. Construit les features live via `src/services/live_features.py`
3. Charge le modele depuis `models/football/model.joblib`
4. Calcule les probabilites et edges
5. Stocke le resultat dans Redis (cle `scan:football:{hash}`) + fichier JSON (`data/cache/api_football/scan_result_{hash}.json`)
6. Met a jour `scan:meta:last_football` (timestamp)

Le backend lit simplement depuis le cache, sans recalcul.

---

## Pipeline Tennis

### 1. Collecte des donnees

**Source** : tennis-data.co.uk XLSX
**Collecteur** : `src/data/tennis_collector.py`
**Annees** : 2019-2025 (7 ans), ATP uniquement
**Total** : 17 048 matchs en base

### 2. Feature Engineering Tennis

**Classe** : `TennisFeatureBuilder` dans `src/features/tennis_features.py`
**Minimum requis** : 5 matchs d'historique par joueur
**Convention** : `p1`/`p2` sont assignes aleatoirement (seed=42, 50% flip) pour que la target soit equilibree a 50/50

#### Liste exhaustive des 42 features tennis (TENNIS_FEATURE_COLUMNS)

**ELO global (3 features)**
- `p1_elo` : rating ELO global joueur 1
- `p2_elo` : rating ELO global joueur 2
- `elo_diff` : p1_elo - p2_elo

**ELO surface-specifique (3 features)**
ELO calcule separement pour chaque surface (Hard, Clay, Grass, Carpet) :
- `p1_elo_surface`, `p2_elo_surface`, `elo_surface_diff`

**Classement ATP (4 features)**
- `p1_rank`, `p2_rank` : classement ATP au moment du match
- `rank_diff` : p1_rank - p2_rank (negatif = p1 mieux classe)
- `rank_ratio` : p1_rank / p2_rank

**Forme globale (6 features)**
Win rate sur les N derniers matchs (tous surfaces) :
- `p1_win_rate_5`, `p2_win_rate_5` : 5 derniers
- `p1_win_rate_10`, `p2_win_rate_10` : 10 derniers
- `p1_win_rate_20`, `p2_win_rate_20` : 20 derniers

**Forme sur surface (3 features)**
- `p1_surface_win_rate` : win rate sur cette surface (last 10)
- `p2_surface_win_rate`
- `surface_win_rate_diff`

**H2H (4 features)**
- `p1_h2h_win_rate` : taux de victoire p1 dans l'historique (simplifie : win rate global last 10)
- `h2h_count` : nombre de confrontations disponibles
- `p1_h2h_surface_win_rate` : win rate p1 sur cette surface (last 6 sur surface)
- `h2h_surface_count`

**Temps de repos (3 features)**
- `p1_rest_days`, `p2_rest_days` : jours depuis le dernier match
- `rest_diff`

**Serie en cours (2 features)**
- `p1_streak` : serie positive (victoires) ou negative (defaites), capped a 10
- `p2_streak`

**Efficacite aux sets (6 features)**
Sur les 10 derniers matchs :
- `p1_sets_won_avg`, `p2_sets_won_avg` : sets gagnes en moyenne par match
- `p1_sets_lost_avg`, `p2_sets_lost_avg` : sets perdus en moyenne
- `p1_set_dominance` : sets_won / (sets_won + sets_lost) — ratio de domination
- `p2_set_dominance`

**Niveau du tournoi (1 feature)**
- `series_level` : encodage ordinal — Grand Slam=4, Masters=3, ATP500=2, ATP250=1, Autre=0

**Probabilites implicites (3 features)**
- `implied_p1`, `implied_p2` : probabilites normalisees des cotes Pinnacle
- `bookmaker_vig` : overround = (1/odds_p1 + 1/odds_p2) - 1

**Momentum ELO (2 features)**
- `p1_elo_change_5` : changement ELO sur les 5 derniers matchs
- `p2_elo_change_5`

**Experience sur la surface (2 features)**
- `p1_surface_matches` : total de matchs joues sur cette surface
- `p2_surface_matches`

### 3. Modele Tennis

**Classe** : `TennisModel` dans `src/ml/tennis_model.py`
**Type** : Ensemble XGBoost + LightGBM binaire (P(p1 gagne))
**Poids** : 70% XGBoost + 30% LightGBM

**XGBoost**
```
objective=binary:logistic
n_estimators=300, max_depth=3, learning_rate=0.02
subsample=0.6, colsample_bytree=0.7
min_child_weight=20, reg_alpha=1.0, reg_lambda=1.0, gamma=1.0
```

**LightGBM**
```
objective=binary
n_estimators=400, max_depth=3, learning_rate=0.015
subsample=0.6, colsample_bytree=0.6
min_child_samples=15, reg_alpha=0.5, reg_lambda=1.0, num_leaves=31
```

**Calibration** : IsotonicRegression 1D sur les probabilites ensemble

**Sortie** : `predict_proba(X)` → tableau 1D `P(p1 gagne)`, dimension `(n_samples,)`

**Performances observees** :
- Accuracy : ~67%
- AUC ROC : ~0.73
- Brier score : ~0.21

### 4. Walk-Forward Validation Tennis

Split unique (pas de folds multiples) :
```
Train : 2019, 2020, 2021, 2022, 2023 (5 ans, ~13 000 matchs)
Test  : 2024, 2025 (2 ans, ~4 000 matchs)
```

Les NaN sont remplaces par la mediane de la colonne d'entrainement.

### 5. Detection de Value Bets Tennis

Pour chaque joueur (P1 ou P2) :
```
implied_prob = 1 / cote_bookmaker
edge = model_prob - implied_prob
value_bet si edge > min_edge_threshold
```

---

## Metriques cibles et interpretations

### Metriques realistes
| Metrique | Plage realiste | Interpretation |
|----------|---------------|----------------|
| Edge moyen | 2% - 5% | Avantage sur le marche |
| ROI annuel | 2% - 8% | Rendement sur les mises |
| Accuracy | 55% - 67% | Taux de bonnes predictions |
| Log-loss | 0.96 - 1.02 | Qualite de calibration (inferieur = mieux) |
| AUC ROC | 0.70 - 0.76 | Pouvoir discriminant du modele |

### Closing Line Value (CLV)

Le CLV est la metrique la plus importante pour evaluer une strategie a long terme.

**Definition** :
```
CLV = (cote_cloture / cote_au_bet) - 1
```

- `CLV > 0` : vous avez parie a de meilleures cotes que la cloture → le marche a confirme votre analyse → signal positif
- `CLV < 0` : le marche a bouge contre vous → late money est arrive dans votre direction

**Pourquoi le CLV est la metrique gold standard** :
1. Les cotes de cloture Pinnacle sont les plus efficaces du marche (sharp money absorbé)
2. Un joueur avec CLV moyen positif sur long terme est rentable, meme avec un ROI court terme negatif
3. Le CLV filtre la variance courte terme (chance) pour mesurer l'edge reel

**Implementation dans BetTracker** :
- Au settlement d'un pari (`update_bet_result` dans campaigns.py)
- Lookup dans `football_matches` par home_team + away_team + date (±2 jours)
- Cotes de cloture Pinnacle : `odds_home_close`, `odds_draw_close`, `odds_away_close`
- Non-bloquant : si le match n'est pas trouve, CLV reste NULL

**Calcul pour le backtest** :
Le moteur de backtest calcule le CLV directement depuis les donnees historiques (cotes ouverture vs cloture disponibles dans le parquet).

---

## Systeme ELO

**Classe** : `EloRatingSystem` dans `src/features/elo.py`

**Parametres football** :
- K-factor : 32 (defaut)
- Home advantage : 65 points (equipe domicile part avec +65 ELO de facto)
- Rating initial : 1500

**Parametres tennis** :
- K-factor : 32
- Home advantage : 0 (pas d'avantage domicile au tennis)
- ELO separes par surface (Hard, Clay, Grass, Carpet)

**Formule** :
```
Expected_A = 1 / (1 + 10^((ELO_B - ELO_A) / 400))
K_adjusted = K * goal_diff_multiplier(goal_diff)
ELO_A_new = ELO_A + K_adjusted * (result_A - Expected_A)
```

Le multiplicateur `goal_diff_multiplier` amplifie les mises a jour ELO pour les victoires avec grand ecart (meilleure estimation de la vraie force).

---

## Fichiers de modele persistants

```
models/
├── football/
│   ├── model.joblib        # {base_model, lgb_model, calibrators}
│   └── metadata.json       # {version, trained_at, features_count, log_loss, ...}
└── tennis/
    ├── model.joblib        # {base_model, lgb_model, calibrator, feature_columns}
    └── metadata.json
```

**Chargement** : a chaque requete de scan, le modele est charge depuis le disque via `joblib.load()` (en pratique: le worker garde le modele en memoire apres le premier chargement).
