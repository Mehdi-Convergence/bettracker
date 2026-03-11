# Architecture BetTracker

## Stack technique (versions exactes)

### Backend
| Composant | Version | Role |
|-----------|---------|------|
| Python | 3.12 | Langage principal |
| FastAPI | 0.115+ | Framework API REST |
| SQLAlchemy | 2.0+ | ORM (style Mapped/mapped_column) |
| Alembic | - | Migrations de base de donnees |
| XGBoost | - | Modele de prediction principal |
| LightGBM | - | Modele de prediction secondaire |
| scikit-learn | - | IsotonicRegression (calibration) |
| pandas | - | Manipulation de donnees |
| numpy | - | Calcul numerique |
| joblib | - | Serialisation des modeles |
| bcrypt | - | Hachage des mots de passe |
| PyJWT | - | Tokens JWT |
| pydantic-settings | - | Configuration via variables d'environnement |
| slowapi | - | Rate limiting |
| redis | - | Cache distribue (optionnel) |
| uv | - | Gestionnaire de packages Python |
| ruff | - | Linter Python |
| pytest | - | Tests |

### Frontend
| Composant | Version | Role |
|-----------|---------|------|
| React | 19 | UI framework |
| TypeScript | 5+ | Typage statique |
| Tailwind CSS | v4 | Styling utility-first |
| React Router | v6 | Routing SPA |
| Recharts | - | Graphiques (LineChart, etc.) |
| Lucide React | - | Icones |
| Vite | - | Bundler |
| Node.js | 22 | Runtime dev/build |

### Infrastructure
| Composant | Version | Role |
|-----------|---------|------|
| PostgreSQL | 16-alpine | Base de donnees production |
| SQLite | - | Base de donnees developpement |
| Redis | 7-alpine | Cache et sessions |
| Docker | - | Containerisation |
| Docker Compose | - | Orchestration multi-services |
| Caddy | 2-alpine | Reverse proxy + SSL Let's Encrypt |
| GitHub Actions | - | CI/CD |

---

## Structure des dossiers

```
bettracker/
├── src/                        # Backend Python
│   ├── api/                    # Endpoints FastAPI
│   │   ├── auth.py             # Register, login, refresh, me, mot de passe
│   │   ├── backtest.py         # Run backtest, save/load resultats
│   │   ├── campaigns.py        # CRUD campagnes, paris, recommandations
│   │   ├── combos.py           # Generation de combinaisons
│   │   ├── dashboard.py        # Resumé tableau de bord
│   │   ├── deps.py             # Dependances auth (get_current_user, require_tier)
│   │   ├── feedback.py         # Widget de feedback utilisateur
│   │   ├── health.py           # Health check, model-info
│   │   ├── helpers.py          # Helpers partages (bet_to_response)
│   │   ├── matches.py          # Recherche de matchs, autocomplete equipes
│   │   ├── notifications.py    # Notifications in-app
│   │   ├── portfolio.py        # Paris utilisateur, stats, historique
│   │   ├── scanner.py          # Scanner AI (lecture cache, deep research)
│   │   ├── schemas.py          # Tous les schemas Pydantic request/response
│   │   └── settings.py         # Preferences utilisateur
│   ├── backtest/
│   │   ├── engine.py           # Moteur backtest football (simulation chronologique)
│   │   ├── metrics.py          # Calcul des metriques (ROI, drawdown, streaks)
│   │   ├── report.py           # Generation de rapports
│   │   └── tennis_engine.py    # Moteur backtest tennis
│   ├── data/
│   │   ├── api_football_client.py  # Client API-Football (cotes temps reel)
│   │   ├── claude_researcher.py    # Recherche web via Claude Code
│   │   ├── constants.py            # Ligues, saisons supportees
│   │   ├── football_collector.py   # Collecteur CSV football-data.co.uk
│   │   └── tennis_collector.py     # Collecteur XLSX tennis-data.co.uk
│   ├── features/
│   │   ├── common.py               # Fonctions utilitaires partagees
│   │   ├── elo.py                  # Systeme ELO (football + tennis)
│   │   ├── football_features.py    # FootballFeatureBuilder (67 features)
│   │   └── tennis_features.py      # TennisFeatureBuilder (42 features)
│   ├── ml/
│   │   ├── combo_engine.py         # Generation de combinaisons value bet
│   │   ├── football_model.py       # FootballModel (XGBoost + LightGBM, 3 classes H/D/A)
│   │   ├── goals_model.py          # Modele de prediction de buts (Poisson)
│   │   ├── tennis_model.py         # TennisModel (XGBoost + LightGBM, binaire)
│   │   ├── value_detector.py       # Detection de value bets (edge = prob_model - implied)
│   │   └── walk_forward.py         # WalkForwardSplitter (validation chronologique)
│   ├── models/                     # Modeles SQLAlchemy ORM
│   │   ├── base.py                 # Base + TimestampMixin
│   │   ├── bet.py                  # Bet (paris utilisateur)
│   │   ├── campaign.py             # Campaign (strategie autopilot)
│   │   ├── campaign_version.py     # CampaignVersion (historique modifications)
│   │   ├── match.py                # FootballMatch (38 799 matchs)
│   │   ├── notification.py         # Notification in-app
│   │   ├── password_reset.py       # PasswordResetToken
│   │   ├── saved_backtest.py       # SavedBacktest (resultats sauvegardes)
│   │   ├── tennis_match.py         # TennisMatch (17 048 matchs)
│   │   ├── user.py                 # User (auth, tier, trial)
│   │   └── user_preferences.py     # UserPreferences (bankroll, notifs, display)
│   ├── services/
│   │   ├── email.py                # Envoi emails via Resend API
│   │   ├── live_features.py        # Features en temps reel pour le scanner
│   │   ├── notifications.py        # Logique de creation de notifications
│   │   └── probability_calculator.py  # Calcul proba + edge (blend ML + Poisson)
│   ├── workers/
│   │   └── scan_worker.py          # Worker de scan periodique (background)
│   ├── cache.py                    # Wrapper Redis + fallback memoire
│   ├── config.py                   # Settings Pydantic (variables d'env)
│   ├── database.py                 # Session SQLAlchemy
│   ├── main.py                     # Entrypoint FastAPI (routers, CORS, rate limit)
│   └── rate_limit.py               # Configuration slowapi
├── frontend/
│   └── src/
│       ├── pages/                  # Pages React Router
│       │   ├── AIAnalyste.tsx      # Page analysee IA (deep research)
│       │   ├── Backtest.tsx        # Simulateur de strategies
│       │   ├── Campaign.tsx        # Liste des campagnes
│       │   ├── CampaignDetail.tsx  # Detail d'une campagne
│       │   ├── Dashboard.tsx       # Tableau de bord KPI
│       │   ├── ForgotPassword.tsx  # Demande de reinitialisation mot de passe
│       │   ├── Login.tsx           # Connexion
│       │   ├── Parametres.tsx      # Parametres du compte
│       │   ├── Portfolio.tsx       # Gestion des paris
│       │   ├── Register.tsx        # Inscription
│       │   ├── ResetPassword.tsx   # Reinitialisation mot de passe
│       │   ├── Scanner.tsx         # Scanner de value bets
│       │   └── Settings.tsx        # Preferences utilisateur
│       ├── components/
│       │   ├── AIScanMatchDetailPanel.tsx  # Panneau detail match scanner
│       │   ├── KanbanBoard.tsx             # Vue kanban des paris
│       │   ├── Layout.tsx                  # Layout global (sidebar, header)
│       │   ├── NotificationBell.tsx        # Cloche de notifications
│       │   ├── OnboardingModal.tsx         # Modal onboarding premier acces
│       │   ├── ShareTicketModal.tsx        # Modal partage de ticket
│       │   ├── SpotlightTour.tsx           # Tour guide interactif
│       │   ├── TeamAutocomplete.tsx        # Autocompletion nom d'equipe
│       │   ├── TicketBuilder.tsx           # Constructeur de ticket de paris
│       │   ├── TicketDetailDrawer.tsx      # Drawer detail d'un ticket
│       │   └── ui/                         # Design system primitifs
│       ├── contexts/
│       │   ├── AuthContext.tsx      # Contexte d'authentification
│       │   ├── BreadcrumbContext.tsx
│       │   └── TourContext.tsx
│       ├── hooks/
│       │   └── useTour.ts           # Hook pour les tours guides
│       ├── services/
│       │   └── api.ts               # Client API (fetch + JWT refresh, 43 fonctions)
│       ├── tours/                   # Definitions des etapes de tour guide
│       ├── types/
│       │   └── index.ts             # Interfaces TypeScript
│       └── utils/                   # Fonctions utilitaires
├── data/
│   ├── raw/                         # CSV/XLSX bruts
│   └── processed/
│       └── football_features.parquet  # Features pre-calculees (38 006 lignes)
├── models/
│   ├── football/
│   │   ├── model.joblib             # Modele entraine serialise
│   │   └── metadata.json            # Version, date, metriques
│   └── tennis/
│       └── model.joblib
├── migrations/                      # Alembic migrations SQL
├── .github/
│   └── workflows/
│       ├── ci.yml                   # CI (lint + tests + build)
│       └── deploy.yml               # Deploy auto sur VPS OVH
├── docker-compose.yml               # Stack de developpement
├── docker-compose.prod.yml          # Override production (Caddy, no ports)
├── Caddyfile                        # Configuration reverse proxy
├── Dockerfile                       # Image backend
├── frontend/Dockerfile              # Image frontend (Nginx)
└── pyproject.toml                   # Dependances Python (uv)
```

---

## Choix techniques justifies

### FastAPI (vs Django, Flask)
FastAPI offre validation automatique via Pydantic, generation OpenAPI automatique, support async natif, et performances superieures. La validation des schemas request/response est critique pour une API financiere.

### XGBoost + LightGBM (vs reseaux de neurones)
- XGBoost est le standard pour les donnees tabulaires structurees
- LightGBM est plus rapide a l'entrainement, bon sur features sparse
- Ensemble 80% XGBoost + 20% LightGBM (football) / 70/30 (tennis) pour diversite
- Les reseaux de neurones sont inadaptes : peu de features (~67), peu de donnees (~38 000 matchs), interpretabilite requise
- SHAP possible pour l'interpretabilite

### React 19 (vs Vue, Angular)
React ecosystem mature, hooks natifs, TypeScript support excellent. React 19 apporte useOptimistic et actions serveur pour future evolution.

### Tailwind CSS v4 (vs CSS modules, styled-components)
Tailwind v4 supprime le fichier de config JavaScript, utilise CSS natif. Productivite maximale pour un projet solo/petit equipe.

### SQLite (dev) / PostgreSQL (prod)
SQLite : zero configuration pour le developpement local. PostgreSQL 16 : ACID compliance, JSON natif, performance et concurrence en production.

### Redis (cache optionnel)
Redis stocke les scans pre-calcules (TTL 30 min) pour eviter de recalculer pour chaque requete. Fallback memoire in-process si Redis indisponible.

### Caddy (vs Nginx)
Caddy gere SSL Let's Encrypt automatiquement (zero config certbot), reverse proxy HTTP/2, et renouvellement automatique des certificats.

---

## Flux de donnees global

```
Browser
  |
  | HTTPS
  v
Caddy (port 443)
  |
  |-- /api/*  --> Backend FastAPI (port 8000 interne)
  |               |
  |               |-- SQLAlchemy --> PostgreSQL (port 5432 interne)
  |               |-- cache_get/set --> Redis (port 6379 interne)
  |               |-- joblib.load --> models/football/model.joblib
  |               |-- data/processed/football_features.parquet
  |
  |-- /*      --> Frontend Nginx (port 80 interne)
                  Sert les fichiers statiques React buildés

Worker (scan_worker.py) — processus separe
  |
  |-- API-Football API --> calcul features live --> calcul proba
  |-- stocke dans Redis (TTL 30 min) + data/cache/api_football/*.json
  |-- backend lit depuis Redis/fichier quand /scanner/ai-scan est appele
```

### Flux d'authentification
```
1. POST /auth/login → {access_token, refresh_token}
2. Toutes les requetes : Authorization: Bearer {access_token}
3. Sur 401 : POST /auth/refresh → nouveau pair de tokens
4. Sur 401 apres refresh : redirection /login
```

### Flux de scan (lecture cache)
```
1. Worker (periodique) : scan API-Football → calcul features → calcul proba → stockage Redis
2. GET /scanner/ai-scan → lecture Redis → fallback fichier JSON (30 min max)
3. Si force=True et pas de cache : scan inline (fallback synchrone)
```

---

## Docker Compose services

### docker-compose.yml (developpement / base)

| Service | Image | Port expose | Role |
|---------|-------|-------------|------|
| backend | Dockerfile local | 8000:8000 | API FastAPI |
| worker | Dockerfile local | aucun | Scan periodique background |
| frontend | frontend/Dockerfile | 80:80 | SPA React + Nginx |
| postgres | postgres:16-alpine | 5432:5432 | Base de donnees |
| redis | redis:7-alpine | 6379:6379 | Cache |

Volumes persistants : `pg-data`, `model-data` (/app/models), `cache-data` (/app/data/cache)

### docker-compose.prod.yml (override production)
- Ajout service `caddy` (ports 80, 443) avec auto-SSL
- `frontend` : port 80 retire (Caddy gere)
- `backend` : port 8000 retire (Caddy proxifie)
- `postgres` : port 5432 retire (acces interne uniquement)
- `redis` : port 6379 retire (acces interne uniquement)
- `FRONTEND_URL=https://{DOMAIN}` et `ALLOWED_ORIGINS` ajustes

---

## Variables d'environnement completes

| Variable | Obligatoire | Defaut | Description |
|----------|-------------|--------|-------------|
| `JWT_SECRET_KEY` | OUI | - | Cle secrete JWT (64 bytes random) |
| `DATABASE_URL` | OUI (prod) | `sqlite:///./bettracker.db` | URL de connexion DB |
| `POSTGRES_PASSWORD` | OUI (Docker) | - | Mot de passe PostgreSQL |
| `POSTGRES_USER` | Non | `bettracker` | Utilisateur PostgreSQL |
| `POSTGRES_DB` | Non | `bettracker` | Nom de la base |
| `REDIS_URL` | Non | `""` | URL Redis (ex: redis://redis:6379/0) |
| `DOMAIN` | OUI (prod) | - | Domaine public (ex: betracker.fr) |
| `FRONTEND_URL` | Non | `http://localhost:5173` | URL du frontend (pour reset password) |
| `ALLOWED_ORIGINS` | Non | localhost variants | Origins CORS autorises |
| `API_FOOTBALL_KEY` | Non | `""` | Cle API-Football (scanner live) |
| `ODDS_API_KEY` | Non | `""` | Cle The Odds API |
| `OPENWEATHER_API_KEY` | Non | `""` | Cle OpenWeather |
| `RESEND_API_KEY` | Non | `""` | Cle Resend (emails) |
| `RESEND_FROM_EMAIL` | Non | `BetTracker <noreply@bettracker.fr>` | Expediteur email |
| `ADMIN_EMAIL` | Non | `contact@bettracker.fr` | Email admin (feedback) |
| `JWT_ALGORITHM` | Non | `HS256` | Algorithme JWT |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Non | `60` | Duree token d'acces (minutes) |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | Non | `30` | Duree token de rafraichissement (jours) |
| `TRIAL_DAYS` | Non | `7` | Duree de l'essai gratuit |
| `KELLY_FRACTION` | Non | `0.125` | Fraction Kelly par defaut |
| `MAX_STAKE_PERCENT` | Non | `0.03` | Mise max en % de la bankroll |
| `MIN_EDGE_THRESHOLD` | Non | `0.05` | Edge minimum par defaut (5%) |
| `INITIAL_BANKROLL` | Non | `200.0` | Bankroll initiale par defaut |
| `ELO_K_FACTOR` | Non | `32.0` | Facteur K pour l'ELO |
| `ELO_HOME_ADVANTAGE` | Non | `65.0` | Avantage domicile ELO |
| `ELO_INITIAL` | Non | `1500.0` | Rating ELO initial |

Secrets GitHub Actions necessaires pour le deploiement :
- `VPS_HOST` : IP du serveur (54.37.231.149)
- `VPS_USER` : ubuntu
- `VPS_SSH_KEY` : cle privee SSH
- `VPS_PORT` : 22 (defaut)
