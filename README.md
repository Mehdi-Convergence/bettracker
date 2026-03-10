# BetTracker

Plateforme SaaS de detection de value bets sportifs. Modele ML (XGBoost/LightGBM) calibre sur les cotes Pinnacle, backtesting walk-forward, gestion de campagnes et portfolio.

## Stack technique

| Couche | Technologies |
|--------|-------------|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic |
| Frontend | React 19, TypeScript, Tailwind CSS v4, Recharts |
| ML | LightGBM, scikit-learn, SHAP, Optuna |
| Auth | JWT (access + refresh tokens), tiers (free/pro/premium) |
| Base de donnees | SQLite (dev) / PostgreSQL 16 (prod) |
| Cache | Redis 7 (optionnel, fallback in-memory) |
| Email | Resend (optionnel) |
| CI/CD | GitHub Actions (lint + tests + type-check + build) |
| Deploy | Docker Compose (backend + frontend + PostgreSQL + Redis) |

## Demarrage rapide

### Prerequis

- Python 3.12+
- Node.js 22+
- [uv](https://docs.astral.sh/uv/) (gestionnaire de packages Python)

### Installation

```bash
# Cloner le repo
git clone <repo-url> && cd bettracker

# Backend
cp .env.example .env
# Editer .env : definir JWT_SECRET_KEY (obligatoire)
# python -c "import secrets; print(secrets.token_urlsafe(64))"
uv sync

# Frontend
cd frontend && npm install && cd ..
```

### Lancer en dev

```bash
# Terminal 1 — Backend
uv run alembic upgrade head
uv run uvicorn src.main:app --reload

# Terminal 2 — Frontend
cd frontend && npm run dev
```

L'app est accessible sur `http://localhost:5173`, l'API sur `http://localhost:8000/docs`.

### Docker (production)

```bash
# Definir les variables d'environnement
export JWT_SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(64))")
export POSTGRES_PASSWORD=$(python -c "import secrets; print(secrets.token_urlsafe(32))")

# Lancer
docker compose up --build -d
```

L'app est accessible sur `http://localhost:80`.

## Tests

```bash
uv run pytest tests/ -v     # 74 tests (auth, portfolio, campaigns, backtest, etc.)
uv run ruff check src/      # Lint Python
cd frontend && npx tsc --noEmit  # Type-check TypeScript
```

## Architecture

```
src/
├── api/           # Endpoints FastAPI (auth, campaigns, portfolio, scanner, backtest, dashboard, settings, notifications)
├── backtest/      # Moteur de backtesting walk-forward
├── data/          # Collecte de donnees (football-data.co.uk, API-Football)
├── features/      # Feature engineering (ELO, forme, H2H, tirs, repos)
├── ml/            # Pipeline ML (LightGBM, calibration, SHAP)
├── models/        # Modeles SQLAlchemy (User, Bet, Campaign, SavedBacktest, etc.)
├── services/      # Logique metier (probabilites, email, notifications)
├── config.py      # Configuration Pydantic Settings
├── database.py    # Setup SQLAlchemy
└── main.py        # Application FastAPI

frontend/src/
├── pages/         # 13 pages (Dashboard, Scanner, Portfolio, Backtest, Campaign, etc.)
├── components/    # Composants reutilisables (Layout, KanbanBoard, SpotlightTour, etc.)
├── components/ui/ # Design system (Button, Card, Badge, Input, etc.)
├── contexts/      # React contexts (Auth, Breadcrumb, Tour)
├── services/      # Client API (fetch + JWT refresh)
└── types/         # Interfaces TypeScript
```

## Fonctionnalites

- **Scanner IA** — Detection de value bets en temps reel (football + tennis)
- **Backtest** — Simulation walk-forward avec 4 strategies de mise (flat, Kelly, % bankroll, Kelly dynamique)
- **Campagnes** — Gestion de portefeuilles avec versioning, recommandations, stop-loss
- **Portfolio** — Suivi des paris (kanban/liste), stats avec plages de dates
- **Dashboard** — KPIs, courbe P&L, repartition par sport, series
- **Notifications** — Alertes personnalisables (stop-loss, fin de campagne, etc.)
- **Tours guides** — Onboarding interactif par module

## Variables d'environnement

Voir [.env.example](.env.example) pour la liste complete. Seul `JWT_SECRET_KEY` est obligatoire.

## Licence

Proprietaire — tous droits reserves.
