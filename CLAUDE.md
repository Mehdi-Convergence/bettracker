# BetTracker - Claude Code Instructions

## Project
Sports betting value bet detection platform. Full-stack: Python 3.12 + FastAPI backend, React 19 + TypeScript + Tailwind CSS v4 frontend.

## Commands

### Backend
- Run server: `uv run uvicorn src.main:app --reload`
- Run CLI: `uv run python -m src.cli.main <command>`
- Run tests: `uv run pytest`
- Lint: `uv run ruff check src/`
- Migrations: `uv run alembic upgrade head`

### Frontend
- Dev server: `cd frontend && npm run dev`
- Build: `cd frontend && npm run build`
- Type check: `cd frontend && npx tsc --noEmit`
- Lint: `cd frontend && npm run lint`

### Production (VPS OVH)
- Services systemd: `bettracker-api`, `bettracker-worker`
- Reverse proxy: Caddy 2 (natif, SSL auto Let's Encrypt)
- DB: PostgreSQL 16 (natif), Cache: Redis 7 (natif)
- Deploy: `git push origin main` (GitHub Actions: rsync + uv sync + npm build + systemctl restart)

## Architecture

### Backend (`src/`)
- `src/api/` - FastAPI REST endpoints (auth, campaigns, portfolio, scanner, backtest, dashboard, settings, notifications)
- `src/api/helpers.py` - Shared helpers (bet_to_response)
- `src/api/deps.py` - Auth dependencies (get_current_user, require_tier)
- `src/api/settings.py` - User preferences endpoints
- `src/api/notifications.py` - Notification endpoints
- `src/data/` - Data collection (football-data.co.uk CSVs, API-Football, SofaScore)
- `src/features/` - Feature engineering (ELO, form, H2H, shots, rest, standings)
- `src/ml/` - ML pipeline (XGBoost/LightGBM, calibration, SHAP)
- `src/backtest/` - Backtesting engine (chronological walk-forward simulation)
- `src/models/` - SQLAlchemy ORM models (Campaign, Bet, CampaignVersion, User, SavedBacktest, Notification, UserPreferences)
- `src/services/` - Business logic (probability calculator, live features, email, notifications)
- `src/cache.py` - Redis cache wrapper (with in-memory fallback)
- `src/rate_limit.py` - Rate limiting (slowapi + Redis)
- `src/cli/` - Typer CLI commands
- `src/config.py` - Pydantic Settings (env-based config)

### Frontend (`frontend/src/`)
- `pages/` - Route pages (Dashboard, Scanner, Campaign, CampaignDetail, Portfolio, Backtest, Settings, Parametres, AIAnalyste, Login, Register, ResetPassword, ForgotPassword)
- `components/` - Reusable components (Layout, TeamAutocomplete, TicketBuilder, TicketDetailDrawer, KanbanBoard, NotificationBell, OnboardingModal, SpotlightTour, AIScanMatchDetailPanel)
- `components/ui/` - Design system primitives (Button, Input, Card, Badge, Alert, PageHeader, StatCard, Toggle)
- `contexts/` - React contexts (AuthContext, BreadcrumbContext, TourContext)
- `hooks/` - Custom hooks (useTour)
- `tours/` - Guided tour step definitions
- `utils/` - Utility functions (campaign helpers)
- `services/api.ts` - API client (fetch with JWT refresh, 43 functions)
- `types/index.ts` - TypeScript interfaces

### Key patterns
- Auth: JWT access + refresh tokens, tier-based access (free/pro/premium)
- ORM: SQLAlchemy 2.0+ with `Mapped`/`mapped_column`
- Frontend routing: React Router v6 nested under Layout
- State: React hooks + contexts (no Redux)
- Charts: Recharts
- Icons: Lucide React
- Fonts: Plus Jakarta Sans (body), JetBrains Mono (numbers via `--font-mono`)

## Key Rules
- **No look-ahead bias**: features must only use data BEFORE match date
- **Walk-forward validation**: never use standard CV for time series
- **Calibration > accuracy**: optimize log_loss, not accuracy
- **CLV is the gold standard metric**: model must beat closing line
- **Realistic expectations**: edge 2-5%, ROI 2-8%, accuracy 55-67%
- **Pinnacle odds** are the reference (sharpest market)
- **Communicate in French** with the user
- **Never code without asking** — confirm approach before implementing

## Agents

Multi-agent system in `.claude/agents/`. Use `@orchestrateur` as the main entry point.

### Available agents
| Agent | Role | Model |
|-------|------|-------|
| `@orchestrateur` | CTO virtuel — planifie, delegue, rapporte | opus |
| `@codeur` | Ecrit le code backend + frontend | sonnet |
| `@testeur` | Genere et execute les tests | sonnet |
| `@gardien` | Review qualite, securite, conformite (lecture seule) | opus |
| `@migrateur` | Migrations Alembic, coherence ORM/DB | sonnet |
| `@deployeur` | Deploy VPS + verification post-deploy (lecture seule) | sonnet |
| `@moniteur` | Sante production (lecture seule) | haiku |
| `@ameliorateur` | Propose ameliorations, detecte dette technique (lecture seule) | opus |
| `@documenteur` | Maintient CLAUDE.md, MEMORY.md, doc projet a jour | sonnet |
| `@evolueur` | Ameliore les prompts des agents apres chaque workflow | opus |

### Workflow
```
User → @orchestrateur → plan → validation → @codeur → @testeur → @gardien
→ "ok commit" → commit → "ok push" → push → @deployeur → @moniteur
→ @documenteur (met a jour la doc) → @evolueur (ameliore les agents)
```

### Agent rules
- `@codeur` : ne commit jamais, ne push jamais
- `@gardien` : lecture seule, ne modifie jamais de fichiers
- `@testeur` : n'ecrit que dans `tests/` et `frontend/src/__tests__/`
- `@deployeur` : commandes deploy uniquement, ne modifie pas le code
- `@moniteur` : lecture seule, commandes SSH de diagnostic
- `@ameliorateur` : lecture seule, produit des rapports uniquement
- `@migrateur` : n'ecrit que dans `alembic/versions/` et `src/models/`
- `@documenteur` : n'ecrit que dans `CLAUDE.md`, `memory/`, `docs/`
- `@evolueur` : n'ecrit que dans `.claude/agents/` et `memory/`
