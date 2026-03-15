# BetTracker - Documentation complete de la plateforme

## 1. Vue d'ensemble

BetTracker est une plateforme de detection de value bets sportifs. Elle combine des modeles ML (XGBoost + LightGBM + Poisson) avec des donnees en temps reel pour identifier les paris ou le marche sous-estime la probabilite reelle d'un evenement.

**Stack technique** :
- Backend : Python 3.12 + FastAPI + SQLAlchemy 2.0 + Alembic
- Frontend : React 19 + TypeScript + Tailwind CSS v4 + Recharts
- DB : SQLite (dev) / PostgreSQL 16 (prod)
- Cache : Redis 7
- ML : XGBoost + LightGBM + scikit-learn
- Infra : VPS OVH (Ubuntu 24.04), Caddy 2 (reverse proxy, SSL auto)
- CI/CD : GitHub Actions (rsync + uv sync + npm build + systemctl restart)
- Paiement : Stripe (checkout + portal + webhooks)
- Email : Resend
- IA : Groq (llama-3.3-70b-versatile)

---

## 2. Sports couverts

### 2.1 Football
- **Source fixtures/odds** : API-Football Pro (7500 req/jour)
- **Source historique** : football-data.co.uk CSVs (7 saisons : 2018-2025)
- **Matchs en DB** : 38 799
- **Modele** : XGBoost (80%) + LightGBM (20%), 3 classes (H/D/A)
- **Features** : 72 (ELO, form, H2H, shots, red cards, blessures par poste, implied odds, xG)
- **Blend live** : 45% ML + 55% Poisson
- **Accuracy** : ~56-60%
- **Calibration** : IsotonicRegression
- **Frequence scan** : toutes les 1h
- **Ligues** : toutes les ligues couvertes par API-Football (~130 pays)
- **Donnees enrichies** : blessures/suspensions, lineups, form 5 matchs, H2H 10 matchs, classement, xG (FBref)
- **Edge calcule** : model_prob - implied_prob (Pinnacle reference)

### 2.2 Tennis (ATP)
- **Source odds** : The Odds API (regions: eu, uk, us, us2, au)
- **Source historique** : tennis-data.co.uk .xlsx (2019-2025)
- **Source stats** : Sackmann CSV (GitHub raw) — ranking, form, surface record, serve/return %, H2H
- **Matchs en DB** : 17 048
- **Modele** : XGBoost (70%) + LightGBM (30%), binaire (P1 win vs P2 win)
- **Features** : 42 (ELO global + surface, ranking, win_rate, H2H, rest days, streak, sets, implied odds)
- **Accuracy** : 66.4%, AUC 0.73
- **Blend live** : 65% ML + 35% rule-based
- **Frequence scan** : toutes les 2h30
- **Surfaces** : Hard, Clay, Grass, Indoor
- **Contrainte** : SofaScore bloque (403 IP datacenter), fallback Sackmann CSV (lag 1-2j)

### 2.3 NBA
- **Source odds** : The Odds API
- **Source stats** : ESPN public API (free, no auth)
- **Source fallback** : API-Sports Basketball (100 req/jour partage)
- **Modele** : XGBoost, binaire (Home win vs Away win)
- **Features** : offensive/defensive rating, pace, recent form, standings
- **Frequence scan** : toutes les 2h30
- **Saison** : octobre a juin
- **Contrainte** : API-Sports quota epuise quand partage avec MLB/Rugby, ESPN = fallback gratuit

### 2.4 MLB
- **Source odds** : The Odds API
- **Source stats** : statsapi (API officielle MLB, gratuite)
- **Source fallback** : API-Sports Baseball
- **Matchs en DB** : 16 602
- **Modele** : XGBoost, binaire, accuracy 54.1%
- **Features** : win pct, ERA, H/AB ratio
- **Frequence scan** : toutes les 2h30
- **Saison** : avril a octobre

### 2.5 Rugby (Union)
- **Source odds** : The Odds API
- **Source stats** : API-Sports Rugby
- **Modele** : XGBoost + LightGBM, 3 classes (H/D/A)
- **Features** : tries, conversions, penalties, drop goals, ELO
- **Frequence scan** : toutes les 2h30
- **Ligues** : Top 14, Premiership, URC, Super Rugby, 6 Nations

### 2.6 PMU (Courses hippiques)
- **Source** : PMU.fr (scraping)
- **Modele** : XGBoost classifier
- **Features** : form string, 5 dernieres positions, age, poids, cotes
- **Frequence scan** : toutes les 30min
- **Donnees** : ~3000+ courses collectees
- **Types** : Plat, Trot attele, Trot monte, Obstacle

---

## 3. Modules fonctionnels

### 3.1 Scanner IA
**Route** : `/scanner`
**API** : `GET /api/scanner/ai-scan?sport=&leagues=&timeframe=&force=&cache_only=`
**Tier** : Pro+

Fonctionnalites :
- Scan des matchs a venir (24h, 48h, 72h, 1 semaine)
- Calcul edge par issue (H/D/A pour foot/rugby, P1/P2 pour tennis/NBA/MLB)
- Filtres : ligue, cote min/max, edge min, score de donnees min
- Detail match : prediction, cotes par bookmaker, stats, form, H2H, blessures
- Ticket builder : construire des combis directement depuis le scan
- Badge "value" si edge > 0
- Tri par edge, cote, heure
- Mobile : ticket accessible via FAB button (bottom sheet)

Specifiques par sport :
- **Football** : Lambda Poisson, BTTS edge, Over 2.5 edge, handicap asiatique
- **Tennis** : classement ATP, stats serve/retour, surface record, aces, BP saved
- **NBA** : offensive/defensive rating, pace, standings
- **MLB** : ERA, batting avg, win pct
- **Rugby** : tries/match, standings, form
- **PMU** : carte de course, partants, jockeys, entraineurs, Quinte+

### 3.2 Dashboard
**Route** : `/dashboard`
**API** : `GET /api/dashboard/summary`
**Tier** : Pro+

Fonctionnalites :
- Widget bankroll (initiale, solde actuel, variation P&L)
- KPIs : ROI, win rate, paris en cours, paris settles
- Campagnes actives (resume)
- Derniers resultats (5 derniers paris)
- Graphique evolution bankroll

### 3.3 Portfolio
**Route** : `/portfolio`
**API** : `GET/POST/PATCH/DELETE /api/portfolio/bets`, `GET /api/portfolio/stats`, `GET /api/portfolio/history`
**Tier** : Pro+

Fonctionnalites :
- Liste de tous les paris (filtres : status, sport, campagne)
- Ajout manuel de paris (match, cote, mise, bookmaker)
- Settlement (won/lost/void) avec calcul CLV automatique
- Statistiques detaillees : ROI, win rate, CLV moyen, drawdown
- Historique P&L (graphique)
- Evolution des cotes (odds history)
- Notes par pari
- Suppression de paris

### 3.4 Backtest
**Route** : `/backtest`
**API** : `POST /api/backtest/run`, `GET/POST/DELETE /api/backtest/saved`
**Tier** : Pro+

Fonctionnalites :
- Selection du sport (6 sports)
- Strategies de staking : flat, Kelly fractionnel, % bankroll
- Parametres : bankroll initiale, edge min, proba min, cotes min/max
- Filtres : issues autorisees, ligues exclues
- Stop-loss : journalier et total (% bankroll)
- Mode combo : combis automatiques (max legs, cotes min/max)
- Resultats : metriques (ROI, win rate, drawdown, streaks), courbe bankroll, tableau des paris
- Sauvegarde et chargement de backtests

Periodes de test :
| Sport | Train | Test |
|-------|-------|------|
| Football | Toutes saisons < test | 2023-2025 (configurable) |
| Tennis | 2019-2023 | 2024-2025 (fixe) |
| NBA/MLB/Rugby/PMU | Historique | Walk-forward chronologique |

### 3.5 Campagnes
**Route** : `/campaign`, `/campaign/:id`
**API** : `GET/POST/PATCH/DELETE /api/campaigns`, recommendations, bets, history, versions
**Tier** : Premium+

Fonctionnalites :
- Creation de campagne (nom, bankroll, objectif, filtres)
- Filtres : edge min, proba min, cotes min/max, issues, ligues, sport
- Recommandations automatiques (scanner filtre par campagne)
- Acceptation de recommandation (cree un pari)
- Suivi bankroll en temps reel
- Version control (snapshot a chaque modification)
- Historique P&L
- Settlement de paris avec CLV auto

### 3.6 IA Analyste
**Route** : `/ai-analyst`
**API** : `POST /api/ai/chat` (streaming SSE)
**Tier** : Tous (rate limited)
**Restriction actuelle** : admin only (badge "Bientot" pour les autres)

Fonctionnalites :
- Chat en streaming (SSE) avec Groq llama-3.3-70b-versatile
- Rendu Markdown (gras, listes, tableaux, code blocks, blockquotes)
- 4 outils contextuels :
  - `get_recent_bets` : derniers paris de l'utilisateur
  - `get_user_stats` : ROI, win rate, P&L par sport
  - `get_today_scan` : value bets du jour
  - `get_campaign_summary` : resume des campagnes actives
- Boucle agentique (max 3 rounds d'outils)
- Gestion des conversations (creer, charger, supprimer)
- Historique persistant en DB
- Rate limit par tier (10/50/200 msg/jour)
- Ecran d'accueil avec suggestions
- Panel contexte : quota, conversations, questions suggerees

### 3.7 Settings
**Route** : `/settings`
**Tier** : Tous (authentifie)

Onglets :
- **Compte** : nom, email, mot de passe, 2FA (TOTP)
- **Abonnement** : plans Free/Pro/Elite, upgrade via Stripe checkout, portal billing
- **Preferences** : bankroll par defaut, dark mode, notifications

### 3.8 Admin Dashboard
**Route** : `/admin`
**Tier** : is_admin uniquement

Sections :
- Etat systeme : Redis, DB, Worker, dernier deploy
- Scans par sport : dernier scan, age cache, matchs, erreurs 24h, force scan
- Quota API Odds : journalier/mensuel, repartition par sport
- Analytique paris : par sport (7j/30j, ROI, CLV, users actifs)
- Utilisateurs : liste complete, tier, paris, ROI, P&L, sports preferes
- IA Analyste : conversations, messages 24h/7j, users actifs IA, usage par user
- Alertes actives : quota, cache vieux, scan 0 resultats, erreurs repetees
- Erreurs recentes : log avec traceback

---

## 4. Authentification et securite

### JWT
- Access token : 60 min (Bearer header)
- Refresh token : 30 jours (httpOnly cookie)
- Token version : incremente au logout (invalide tous les tokens)
- Rotation automatique

### 2FA
- TOTP (Google Authenticator, Authy)
- Enable/verify/disable endpoints
- Secret stocke chiffre en DB

### Email verification
- Token envoye a l'inscription (Resend)
- Banniere dans le header si non verifie
- Renvoyer l'email depuis le profil

### Password reset
- Token temporaire (30 min TTL)
- Email avec lien de reset
- Verification de l'ancien mot de passe pour changement depuis le profil

### Rate limiting
- Global : 100 req/h par IP
- Scanner : 30 req/min
- Backtest : 10 req/min
- AI Chat : 20 req/min
- Auth : 5 req/min
- Implementation : slowapi + Redis

### Headers securite
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin
- Content-Security-Policy: default-src 'self'

---

## 5. Infrastructure

### Serveur prod
- **VPS OVH** : vps-aeac00b1.vps.ovh.net (54.37.231.149)
- **OS** : Ubuntu 24.04 LTS
- **Localisation** : Gravelines (GRA), France
- **Domaine** : betracker.fr (SSL auto via Caddy)
- **App path** : /opt/bettracker
- **User** : ubuntu (SSH key auth)

### Services systemd
- `bettracker-api` : FastAPI (uvicorn)
- `bettracker-worker` : scan worker

### Reverse proxy
- Caddy 2.11.2
- SSL auto Let's Encrypt
- Caddyfile : `/etc/caddy/Caddyfile`

### CI/CD
- GitHub Actions : push sur main -> rsync -> uv sync -> npm build -> alembic migrate -> restart
- Backup DB automatique avant chaque deploy (10 backups conserves)
- Rollback automatique si health check echoue
- Deep health check : DB + tables + modeles ML + frontend dist

### Monitoring
- Health endpoints : `/health`, `/health/data`, `/health/deep`
- Admin dashboard en temps reel (refresh 60s)
- Alertes automatiques (quota, cache, scan 0 resultats, worker crash)

---

## 6. Base de donnees

### Tables principales
| Table | Lignes | Description |
|-------|--------|-------------|
| users | Variable | Comptes, tiers, trial, Stripe, 2FA |
| campaigns | Per user | Strategies avec filtres |
| campaign_versions | Per campaign | Snapshots historiques |
| bets | Per user | Paris (live + backtest) |
| football_matches | 38 799 | Historique football |
| tennis_matches | 17 048 | Historique ATP |
| nba_games | Per season | Historique NBA |
| mlb_games | 16 602 | Historique MLB |
| rugby_matches | Per season | Historique rugby |
| pmu_races | Ongoing | Courses hippiques |
| pmu_runners | Ongoing | Partants PMU |
| saved_backtests | Per user | Backtests sauvegardes |
| notifications | Per user | Notifications in-app |
| user_preferences | 1 per user | Bankroll, notifs, display |
| ai_conversations | Per user | Conversations IA |
| ai_messages | Per user | Messages IA |
| odds_snapshots | Per sport | Snapshots cotes (30j) |

### Cache Redis
| Cle | TTL | Description |
|-----|-----|-------------|
| `scanner:{sport}:latest` | 2h30 | Dernier scan |
| `scan:stats:{sport}:*` | 7j | Metriques scan |
| `odds_api_daily:{date}` | 24h | Budget Odds API |
| `ai:daily:{user_id}` | 24h | Rate limit IA |

---

## 7. APIs externes — couts et contraintes

| API | Quota | Cout mensuel | Contraintes |
|-----|-------|-------------|-------------|
| API-Football Pro | 7500 req/jour | ~20$ | Football uniquement |
| The Odds API | 20K credits/jour | ~30$ | Tennis/NBA/MLB/Rugby |
| Groq | Free tier (rate limited) | 0$ | 30 req/min, 14.4K tokens/min |
| ESPN | Illimite | 0$ | NBA uniquement, scraping |
| statsapi | Illimite | 0$ | MLB uniquement |
| Resend | 100 emails/jour (free) | 0$ | Emails transactionnels |
| Stripe | Per transaction | ~2.9% + 0.30$ | Paiements |

**Cout total infrastructure** : ~50$/mois (APIs) + ~10 EUR/mois (VPS OVH) = ~60 EUR/mois

---

## 8. Frontend — pages et composants

### Pages (12)
| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` | Homepage, plans, features, CTA |
| Login | `/login` | Connexion |
| Register | `/register` | Inscription + trial 7j |
| ForgotPassword | `/forgot-password` | Demande reset |
| ResetPassword | `/reset-password` | Reset avec token |
| Dashboard | `/dashboard` | Vue d'ensemble |
| Scanner | `/scanner` | Scan matchs + ticket builder |
| Backtest | `/backtest` | Backtesting parametrique |
| Campaign | `/campaign` | Liste campagnes |
| CampaignDetail | `/campaign/:id` | Detail campagne |
| Portfolio | `/portfolio` | Suivi paris |
| AIAnalyste | `/ai-analyst` | Chat IA |
| Settings | `/settings` | Profil, abonnement, preferences |
| Admin | `/admin` | Monitoring (admin only) |

### Composants cles
- **Layout** : sidebar collapsible, header, notifications bell, breadcrumbs
- **AIScanMatchDetailPanel** : detail match (prediction, cotes, stats, form, H2H)
- **TicketBuilder** : constructeur de combis
- **PMURaceCard** : carte de course hippique
- **NotificationBell** : cloche notifications temps reel
- **OnboardingModal** : premier lancement
- **SpotlightTour** : visite guidee

### Design system
- Fonts : Plus Jakarta Sans (body), JetBrains Mono (nombres)
- Icons : Lucide React
- Charts : Recharts
- Dark mode : supporte (CSS variables)
- Mobile : responsive (max-sm breakpoints)

---

## 9. Modeles ML — details techniques

### Football
```
Type : 3 classes (Home / Draw / Away)
Ensemble : XGBoost (80%) + LightGBM (20%)
Features : 72
  - ELO (global, home/away) : 3
  - Form (5 derniers matchs) : 6
  - H2H (10 derniers) : 4
  - Shots (tirs cadres/match) : 4
  - Red cards (moyenne 5 matchs) : 2
  - Blessures par poste : 8 (GK -10%, ATT -7%, MID -5%, DEF -3%)
  - Standings (points, position) : 6
  - Rest days : 2
  - xG (expected goals FBref) : 4
  - Implied odds (Pinnacle) : 3
  - Autres (home advantage, league strength) : 30
Calibration : IsotonicRegression
Blend live : 45% ML + 55% Poisson
Train : 2018-2023 (5 saisons)
Test : 2023-2025 (2 saisons)
Validation : Walk-forward chronologique
Metrique cible : log_loss
Fichier : models/football/model.joblib
```

### Tennis
```
Type : binaire (P1 win / P2 win)
Ensemble : XGBoost (70%) + LightGBM (30%)
Features : 42
  - ELO (global + par surface) : 4
  - Ranking ATP : 2
  - Win rate (overall + surface) : 4
  - H2H (historique + surface) : 4
  - Rest days : 2
  - Streak (victoires consecutives) : 2
  - Serve stats (1st serve %, aces, BP saved) : 8
  - Return stats : 4
  - Sets (avg sets played) : 2
  - Implied odds : 2
  - Autres : 8
Target : 50/50 equilibre (roles P1/P2 assignes aleatoirement)
Accuracy : 66.4%
AUC : 0.73
Blend live : 65% ML + 35% rule-based
Train : 2019-2023
Test : 2024-2025 (fixe)
Fichier : models/tennis/model.joblib
```

### NBA
```
Type : binaire (Home win / Away win)
Modele : XGBoost
Features : offensive/defensive rating, pace, form, standings
Fichier : models/nba/model.joblib
```

### MLB
```
Type : binaire (Home win / Away win)
Modele : XGBoost
Accuracy : 54.1%
Features : win pct, ERA, H/AB ratio
Fichier : models/mlb/model.joblib
```

### Rugby
```
Type : 3 classes (H/D/A)
Ensemble : XGBoost + LightGBM
Features : tries, conversions, penalties, ELO
Fichier : models/rugby/model.joblib
```

### PMU
```
Type : classifier (top N finishers)
Modele : XGBoost
Features : form, positions, age, poids, cotes
Fichier : models/pmu/model.joblib
```

---

## 10. Worker — scan automatique

### Architecture
- Process Python autonome : `python -m src.workers.scan_worker`
- Service systemd : `bettracker-worker`
- Boucle infinie avec sleep entre les scans

### Planning des scans
| Sport | Intervalle | Source odds | Source stats | Budget API/scan |
|-------|-----------|------------|-------------|----------------|
| Football | 1h | API-Football | API-Football | ~10 req |
| Tennis | 2h30 | Odds API | Sackmann CSV | ~5-15 credits |
| NBA | 2h30 | Odds API | ESPN | ~5 credits |
| MLB | 2h30 | Odds API | statsapi | ~3 credits |
| Rugby | 2h30 | Odds API | API-Sports | ~12 credits |
| PMU | 30min | PMU.fr | PMU.fr | 0 (scraping) |

### Budget Odds API
- Budget quotidien : 650 credits/jour (auto-equilibrant)
- Compteur Redis : `odds_api_daily:{date}`
- Si budget epuise : reutilise le cache existant
- Sync avec headers API (usage reel)

### Resilience
- Try/except par sport (un sport en erreur n'arrete pas les autres)
- File fallback si Redis indisponible
- Metriques persistees pour monitoring admin
- Alertes automatiques si scan echoue ou retourne 0 matchs

---

## 11. Endpoints API (84+)

### Auth (12)
POST /api/auth/register, login, refresh, logout, change-password, forgot-password, reset-password, verify-email
POST /api/auth/two-factor/enable, verify, disable
GET /api/auth/me | PATCH /api/auth/me

### Scanner (3)
GET /api/scanner/ai-scan, research, pmu

### Backtest (5)
POST /api/backtest/run, save
GET /api/backtest/saved, saved/{id}
DELETE /api/backtest/saved/{id}

### Campaigns (13)
POST /api/campaigns, campaigns/{id}/accept
GET /api/campaigns, campaigns/{id}, campaigns/{id}/recommendations, bets, history, versions, versions/{v}
PATCH /api/campaigns/{id}, campaigns/{id}/bets/{bet_id}
DELETE /api/campaigns/{id}, campaigns/{id}/bets/{bet_id}

### Portfolio (7)
GET /api/portfolio/bets, stats, history, bets/{id}/odds-history
POST /api/portfolio/bets
PATCH /api/portfolio/bets/{id}, bets/{id}/note
DELETE /api/portfolio/bets/{id}

### Dashboard (1)
GET /api/dashboard/summary

### AI Analyste (5)
POST /api/ai/chat (streaming SSE)
GET /api/ai/conversations, conversations/{id}/messages, rate-limit
DELETE /api/ai/conversations/{id}

### Settings (4)
GET /api/settings/preferences
PATCH /api/settings/preferences
POST /api/settings/onboarding, tour-visited

### Notifications (3)
GET /api/notifications, unread-count
PATCH /api/notifications/{id}
DELETE /api/notifications/{id}

### Stripe (3)
POST /api/stripe/checkout, portal, webhook

### Admin (9)
GET /api/admin/system, scans, quota, analytics/sports, alerts, errors, users, ai
POST /api/admin/scan/{sport}/force

### Health (3)
GET /health, health/data, health/deep

### Autres (3)
POST /api/feedback
GET /api/matches, teams/search
