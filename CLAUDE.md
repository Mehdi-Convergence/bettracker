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

### Docker
- Full stack: `docker-compose up --build`

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
