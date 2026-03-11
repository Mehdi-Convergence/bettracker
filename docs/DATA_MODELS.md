# Modeles de Donnees BetTracker

Tous les modeles utilisent SQLAlchemy 2.0+ avec la syntaxe `Mapped`/`mapped_column`. La base de donnees est SQLite en developpement et PostgreSQL 16 en production.

## Base commune

`Base` et `TimestampMixin` (dans `src/models/base.py`) :
- `Base` : classe SQLAlchemy declarative
- `TimestampMixin` : ajoute `created_at` (DateTime, auto-rempli) et `updated_at` (DateTime, auto-mis a jour)

---

## User

**Table** : `users`

Modele d'authentification, d'abonnement et d'onboarding.

| Colonne | Type SQL | SQLAlchemy | Contraintes | Description |
|---------|----------|-----------|-------------|-------------|
| `id` | INTEGER | `int` | PK, autoincrement | Identifiant unique |
| `email` | VARCHAR(255) | `str` | UNIQUE, INDEX, NOT NULL | Adresse email (minuscule) |
| `hashed_password` | VARCHAR(255) | `str` | NOT NULL | Hash bcrypt du mot de passe |
| `display_name` | VARCHAR(100) | `str` | NOT NULL | Nom d'affichage |
| `is_active` | BOOLEAN | `bool` | DEFAULT true | Soft delete (false = compte desactive) |
| `token_version` | INTEGER | `int` | DEFAULT 0 | Incrementé a chaque logout-all ou changement de mdp |
| `tier` | VARCHAR(20) | `str` | DEFAULT 'free' | `free` / `pro` / `premium` |
| `trial_ends_at` | DATETIME | `datetime?` | NULLABLE | Fin de la periode d'essai |
| `stripe_customer_id` | VARCHAR(255) | `str?` | NULLABLE | ID client Stripe (futur) |
| `stripe_subscription_id` | VARCHAR(255) | `str?` | NULLABLE | ID abonnement Stripe (futur) |
| `onboarding_completed` | BOOLEAN | `bool` | DEFAULT false | Onboarding initial complete |
| `visited_modules` | VARCHAR(500) | `str?` | NULLABLE, DEFAULT '' | CSV de modules visites (tours guides) |
| `created_at` | DATETIME | `datetime` | TimestampMixin | Date de creation |
| `updated_at` | DATETIME | `datetime` | TimestampMixin | Date de modification |

**Propriete calculee** :
- `is_trial_active` : `True` si `tier == 'free'` ET `trial_ends_at` non nul ET `now < trial_ends_at`

**Logique metier** :
- `token_version` est compare avec le claim `ver` du JWT a chaque requete. Toute incohérence retourne 401.
- `visited_modules` est une chaine CSV (ex: `"dashboard,scanner"`) — un module visite ne relance plus le tour guide.
- La verification du tier se fait dans `require_tier(tier)` dans `deps.py` : `free` avec trial actif est traite comme `pro`.

---

## UserPreferences

**Table** : `user_preferences`

Un enregistrement par utilisateur (relation 1-1 avec `users`).

| Colonne | Type SQL | Defaut | Description |
|---------|----------|--------|-------------|
| `id` | INTEGER | PK | |
| `user_id` | INTEGER | FK users.id, UNIQUE, INDEX | Lien utilisateur |
| `initial_bankroll` | REAL | 1000.0 | Bankroll globale reference |
| `default_stake` | REAL | 30.0 | Mise par defaut en € |
| `stake_as_percentage` | BOOLEAN | false | Si true, utiliser `stake_percentage` |
| `stake_percentage` | REAL | 2.0 | % de bankroll par pari |
| `daily_stop_loss` | REAL | 10.0 | Seuil stop-loss journalier |
| `stop_loss_unit` | VARCHAR(5) | 'pct' | `pct` ou `eur` |
| `low_bankroll_alert` | REAL | 200.0 | Seuil d'alerte bankroll basse |
| `notif_new_ticket` | BOOLEAN | true | Notifier sur nouveau ticket algo |
| `notif_stop_loss` | BOOLEAN | true | Notifier sur stop-loss atteint |
| `notif_smart_stop` | BOOLEAN | true | Notifier sur smart stop |
| `notif_campaign_ending` | BOOLEAN | true | Notifier sur fin de campagne |
| `notif_low_bankroll` | BOOLEAN | true | Notifier sur bankroll basse |
| `share_pseudo` | VARCHAR(50) | '' | Pseudo public pour partage tickets |
| `share_show_stake` | BOOLEAN | false | Afficher la mise sur partage |
| `share_show_gain_euros` | BOOLEAN | true | Afficher les gains en € |
| `share_show_bookmaker` | BOOLEAN | true | Afficher le bookmaker |
| `share_show_clv` | BOOLEAN | true | Afficher le CLV |
| `theme` | VARCHAR(10) | 'light' | `light` / `dark` / `auto` |
| `language` | VARCHAR(5) | 'fr' | `fr` / `en` / `es` |
| `currency` | VARCHAR(5) | 'EUR' | `EUR` / `GBP` / `USD` / `CHF` |
| `odds_format` | VARCHAR(15) | 'decimal' | `decimal` / `fractional` / `american` |
| `default_tickets_view` | VARCHAR(15) | 'kanban' | `kanban` / `list` / `campaign` |
| `default_campaigns_view` | VARCHAR(15) | 'grid' | `grid` / `kanban` |
| `created_at` | DATETIME | TimestampMixin | |
| `updated_at` | DATETIME | TimestampMixin | |

---

## PasswordResetToken

**Table** : `password_reset_tokens`

| Colonne | Type SQL | Contraintes | Description |
|---------|----------|-------------|-------------|
| `id` | INTEGER | PK | |
| `user_id` | INTEGER | FK users.id, INDEX | Lien utilisateur |
| `token` | VARCHAR(255) | UNIQUE, INDEX | Token urlsafe 32 bytes |
| `expires_at` | DATETIME | NOT NULL | Expiration dans 1 heure |
| `used` | BOOLEAN | DEFAULT false | Marque comme utilise apres reset |

**Logique metier** : le token est supprime de la table apres utilisation reussie. Les tokens expires mais non utilises restent en base (nettoyage non implemente).

---

## Campaign

**Table** : `campaigns`

Strategie de paris autopilot definie par l'utilisateur.

| Colonne | Type SQL | Defaut | Description |
|---------|----------|--------|-------------|
| `id` | INTEGER | PK | |
| `user_id` | INTEGER | FK users.id, INDEX | Proprietaire |
| `name` | VARCHAR(100) | | Nom de la campagne |
| `status` | VARCHAR(20) | 'active' | `active` / `paused` / `archived` |
| `initial_bankroll` | REAL | | Bankroll de depart de la campagne |
| `flat_stake` | REAL | | Mise par pari = % de bankroll (ex: 0.05 = 5%) |
| `min_edge` | REAL | | Edge minimum pour accepter un pari |
| `min_model_prob` | REAL? | NULL | Probabilite modele minimum |
| `min_odds` | REAL? | NULL | Cote minimum (optionnel) |
| `max_odds` | REAL? | NULL | Cote maximum (optionnel) |
| `allowed_outcomes` | VARCHAR(20)? | NULL | CSV des issues autorisees (ex: "H,A") |
| `excluded_leagues` | TEXT? | NULL | CSV des ligues exclues (ex: "E2,F2") |
| `combo_mode` | BOOLEAN | false | Mode combinaisons actif |
| `combo_max_legs` | INTEGER | 4 | Nombre max de jambes en combi |
| `combo_min_odds` | REAL | 1.8 | Cote combinee minimum |
| `combo_max_odds` | REAL | 3.0 | Cote combinee maximum |
| `combo_top_n` | INTEGER | 3 | Top N paris selectionnes pour combi |
| `target_bankroll` | REAL? | NULL | Bankroll cible (objectif) |
| `created_at` | DATETIME | TimestampMixin | |
| `updated_at` | DATETIME | TimestampMixin | |

**Logique metier** :
- `current_bankroll = initial_bankroll + sum(profit_loss for settled bets)`
- `suggested_stake = current_bankroll * flat_stake`
- Les recommandations sont filtrees selon tous les criteres de la campagne

---

## CampaignVersion

**Table** : `campaign_versions`

Historique immuable des modifications d'une campagne.

| Colonne | Type SQL | Contraintes | Description |
|---------|----------|-------------|-------------|
| `id` | INTEGER | PK | |
| `campaign_id` | INTEGER | FK campaigns.id, INDEX | Campagne concernee |
| `version` | INTEGER | NOT NULL | Numero de version (commence a 1) |
| `snapshot` | JSON | | Etat complet des parametres a ce moment |
| `changed_at` | DATETIME | NOT NULL | Date du changement |
| `change_summary` | VARCHAR(500) | DEFAULT '' | Resume des champs modifies (ex: "flat_stake: 0.03 -> 0.05") |
| `created_at` | DATETIME | TimestampMixin | |

**Contrainte** : `UniqueConstraint("campaign_id", "version")` — pas deux fois la meme version pour une campagne.

**Logique metier** : Une version est creee automatiquement a chaque PATCH de campagne si au moins un parametre (hors name/status) a change. Le resume liste jusqu'a 5 changements.

---

## Bet

**Table** : `bets`

Paris individuels — a la fois paris reels des utilisateurs et resultats de backtests.

| Colonne | Type SQL | Defaut | Description |
|---------|----------|--------|-------------|
| `id` | INTEGER | PK | |
| `user_id` | INTEGER? | FK users.id, INDEX, NULLABLE | Proprietaire (null pour anciens backtests) |
| `sport` | VARCHAR(20) | | `football` ou `tennis` |
| `match_date` | DATETIME | | Date du match |
| `home_team` | VARCHAR(100) | | Equipe domicile (ou joueur 1 tennis) |
| `away_team` | VARCHAR(100) | | Equipe exterieure (ou joueur 2 tennis) |
| `outcome_bet` | VARCHAR(1) | | `H` / `D` / `A` |
| `odds_at_bet` | REAL | | Cote au moment du pari |
| `odds_at_close` | REAL? | NULLABLE | Cote de cloture Pinnacle (pour CLV) |
| `stake` | REAL | | Montant mise en € |
| `result` | VARCHAR(10)? | 'pending' | `pending` / `won` / `lost` / `void` |
| `profit_loss` | REAL? | NULLABLE | P&L calcule au settlement |
| `clv` | REAL? | NULLABLE | Closing Line Value = (odds_close/odds_bet) - 1 |
| `league` | VARCHAR(50)? | NULLABLE | Code de ligue |
| `campaign_id` | INTEGER? | FK campaigns.id, NULLABLE | Campagne associee |
| `combo_group` | VARCHAR(50)? | NULLABLE | UUID du groupe combi (partage par les jambes) |
| `source` | VARCHAR(10)? | 'scanner' | `algo` / `manual` / `scanner` |
| `bookmaker` | VARCHAR(50)? | NULLABLE | Bookmaker utilise |
| `edge_at_bet` | REAL? | NULLABLE | Edge au moment du pari |
| `note` | VARCHAR(500)? | NULLABLE | Note personnelle |
| `campaign_version` | INTEGER? | NULLABLE | Version de la campagne a l'acceptation |
| `is_backtest` | BOOLEAN | false | True = pari de simulation (ne compte pas dans les stats reelles) |
| `backtest_id` | VARCHAR(50)? | NULLABLE | ID du backtest parent |
| `created_at` | DATETIME | TimestampMixin | |

**Logique metier** :
- `profit_loss` est calcule a la mise a jour du result : `won` → `stake * (odds - 1)`, `lost` → `-stake`, `void` → `0`
- `clv` est calcule non-bloquant lors du settlement des paris football : lookup dans `football_matches` par equipes + date (±2 jours), formule : `odds_at_close / odds_at_bet - 1`
- Les paris `is_backtest = true` sont toujours exclus des stats portfolio

---

## FootballMatch

**Table** : `football_matches`

Donnees historiques des matchs de football (source : football-data.co.uk). 38 799 matchs au total.

| Colonne | Type SQL | Description |
|---------|----------|-------------|
| `id` | INTEGER | PK |
| `season` | VARCHAR(4) | Code saison : `1819`, `1920`, `2021`, `2122`, `2223`, `2324`, `2425` |
| `league` | VARCHAR(4) | Code ligue : `E0`, `E1`, `E2`, `E3`, `F1`, `F2`, `D1`, `D2`, `SP1`, `SP2`, `I1`, `I2`, `B1`, `N1`, `P1`, `SC0` |
| `date` | DATETIME | Date du match |
| `home_team` | VARCHAR(100) | Equipe domicile |
| `away_team` | VARCHAR(100) | Equipe exterieure |
| `fthg` | INTEGER | Buts domicile en temps reglementaire |
| `ftag` | INTEGER | Buts exterieur en temps reglementaire |
| `ftr` | VARCHAR(1) | Resultat : `H` / `D` / `A` |
| `hthg` | INTEGER? | Buts domicile mi-temps |
| `htag` | INTEGER? | Buts exterieur mi-temps |
| `home_shots` | INTEGER? | Tirs domicile |
| `away_shots` | INTEGER? | Tirs exterieur |
| `home_shots_target` | INTEGER? | Tirs cadrés domicile |
| `away_shots_target` | INTEGER? | Tirs cadrés extérieur |
| `home_corners` | INTEGER? | Corners domicile |
| `away_corners` | INTEGER? | Corners extérieur |
| `home_fouls` | INTEGER? | Fautes domicile |
| `away_fouls` | INTEGER? | Fautes extérieur |
| `home_yellow` | INTEGER? | Cartons jaunes domicile |
| `away_yellow` | INTEGER? | Cartons jaunes extérieur |
| `home_red` | INTEGER? | Cartons rouges domicile |
| `away_red` | INTEGER? | Cartons rouges extérieur |
| `home_xg` | REAL? | xG domicile (enrichissement FBref) |
| `away_xg` | REAL? | xG extérieur |
| `odds_home` | REAL? | Cote domicile Pinnacle (ouverture) |
| `odds_draw` | REAL? | Cote nul Pinnacle (ouverture) |
| `odds_away` | REAL? | Cote extérieur Pinnacle (ouverture) |
| `odds_home_close` | REAL? | Cote domicile Pinnacle (cloture) |
| `odds_draw_close` | REAL? | Cote nul Pinnacle (cloture) |
| `odds_away_close` | REAL? | Cote extérieur Pinnacle (cloture) |
| `max_odds_home` | REAL? | Meilleure cote domicile tous bookmakers |
| `max_odds_draw` | REAL? | Meilleure cote nul |
| `max_odds_away` | REAL? | Meilleure cote extérieur |
| `avg_odds_home` | REAL? | Cote moyenne domicile |
| `avg_odds_draw` | REAL? | Cote moyenne nul |
| `avg_odds_away` | REAL? | Cote moyenne extérieur |

**Index** :
- `idx_match_date` sur `date`
- `idx_match_league_season` sur `(league, season)`
- `idx_match_teams` sur `(home_team, away_team)`

**Usage** : Ce modele est la source de verite pour le calcul du CLV au settlement des paris. Il est aussi la source des features historiques pour l'entrainement des modeles.

---

## TennisMatch

**Table** : `tennis_matches`

Donnees historiques des matchs ATP (source : tennis-data.co.uk). 17 048 matchs, 2019-2025.

| Colonne | Type SQL | Description |
|---------|----------|-------------|
| `id` | INTEGER | PK |
| `year` | INTEGER | Annee du tournoi |
| `tournament` | VARCHAR(150)? | Nom du tournoi |
| `location` | VARCHAR(150)? | Ville/pays |
| `surface` | VARCHAR(20)? | `Hard` / `Clay` / `Grass` / `Carpet` |
| `series` | VARCHAR(50)? | `Grand Slam` / `Masters` / `ATP500` / `ATP250` / etc. |
| `court` | VARCHAR(20)? | `Indoor` / `Outdoor` |
| `round` | VARCHAR(30)? | Tour du tournoi |
| `best_of` | INTEGER? | Nombre de sets a gagner (2 ou 3) |
| `date` | DATETIME | Date du match |
| `winner` | VARCHAR(100) | Nom du vainqueur |
| `loser` | VARCHAR(100) | Nom du perdant |
| `winner_rank` | INTEGER? | Classement ATP du vainqueur |
| `loser_rank` | INTEGER? | Classement ATP du perdant |
| `winner_rank_pts` | INTEGER? | Points ATP du vainqueur |
| `loser_rank_pts` | INTEGER? | Points ATP du perdant |
| `w1` - `w5` | INTEGER? | Sets gagnes par le vainqueur (sets 1 a 5) |
| `l1` - `l5` | INTEGER? | Sets gagnes par le perdant |
| `wsets` | INTEGER? | Total sets gagnes par le vainqueur |
| `lsets` | INTEGER? | Total sets gagnes par le perdant |
| `comment` | VARCHAR(50)? | `Completed` / `Retired` / `W/O` (walkover) |
| `odds_winner` | REAL? | Cote ouverture Pinnacle vainqueur (PSW) |
| `odds_loser` | REAL? | Cote ouverture Pinnacle perdant (PSL) |
| `odds_winner_close` | REAL? | Cote cloture Pinnacle vainqueur |
| `odds_loser_close` | REAL? | Cote cloture Pinnacle perdant |
| `max_odds_winner` | REAL? | Meilleure cote vainqueur tous bookmakers |
| `max_odds_loser` | REAL? | Meilleure cote perdant |
| `avg_odds_winner` | REAL? | Cote moyenne vainqueur |
| `avg_odds_loser` | REAL? | Cote moyenne perdant |

**Index** :
- `idx_tennis_date` sur `date`
- `idx_tennis_year_tournament` sur `(year, tournament)`
- `idx_tennis_players` sur `(winner, loser)`

---

## SavedBacktest

**Table** : `saved_backtests`

Resultats de backtests sauvegardes par l'utilisateur.

| Colonne | Type SQL | Description |
|---------|----------|-------------|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | FK users.id, INDEX |
| `name` | VARCHAR(150) | Nom donne par l'utilisateur |
| `sport` | VARCHAR(30) | `football` ou `tennis` |
| `params` | TEXT | JSON : BacktestRequest serialise |
| `metrics` | TEXT | JSON : BacktestMetricsResponse serialise |
| `bets` | TEXT | JSON : list[BacktestBetResponse] serialise |
| `bankroll_curve` | TEXT | JSON : list[float] serialise |
| `config` | TEXT | JSON : config echo du moteur |
| `created_at` | DATETIME | TimestampMixin |

Note : colonnes TEXT (pas JSON natif) pour compatibilite SQLite. Deserialisation explicite avec `json.loads()` a la lecture.

---

## Notification

**Table** : `notifications`

Notifications in-app generees automatiquement par les evenements systeme.

| Colonne | Type SQL | Description |
|---------|----------|-------------|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | FK users.id, INDEX |
| `type` | VARCHAR(50) | `stop_loss` / `low_bankroll` / `smart_stop` / `campaign_ending` / `new_ticket` |
| `title` | VARCHAR(200) | Titre de la notification |
| `message` | VARCHAR(500) | Message detaille |
| `is_read` | BOOLEAN | DEFAULT false |
| `metadata` | JSON? | Donnees contextuelles (seuils, montants, etc.) |
| `created_at` | DATETIME | DEFAULT utcnow |

**Declencheurs** :
- `stop_loss` : loss journalier >= `daily_stop_loss` des preferences (lors de PATCH /portfolio/bets)
- `low_bankroll` : bankroll actuelle <= `low_bankroll_alert` (lors de settlement d'un pari perdu)
- `smart_stop` : ROI sur les 20 derniers paris < -10% (verifie apres chaque settlement)

---

## Relations entre modeles

```
User 1-N Bet                    (user_id FK)
User 1-N Campaign               (user_id FK)
User 1-1 UserPreferences        (user_id FK UNIQUE)
User 1-N PasswordResetToken     (user_id FK)
User 1-N SavedBacktest          (user_id FK)
User 1-N Notification           (user_id FK)

Campaign 1-N Bet                (campaign_id FK)
Campaign 1-N CampaignVersion    (campaign_id FK)

FootballMatch -- standalone (pas de FK vers Bet, lookup par equipes + date)
TennisMatch -- standalone
```
