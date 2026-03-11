from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite:///./bettracker.db"

    # API Keys (optional, for live scanner)
    ODDS_API_KEY: str = ""
    API_FOOTBALL_KEY: str = ""
    OPENWEATHER_API_KEY: str = ""

    # ML Config
    KELLY_FRACTION: float = 0.125  # 1/8 Kelly (conservative)
    MAX_STAKE_PERCENT: float = 0.03
    MIN_EDGE_THRESHOLD: float = 0.05
    INITIAL_BANKROLL: float = 200.0

    # Strategy Config
    ALLOWED_OUTCOMES: list[str] = ["H", "D", "A"]  # All outcomes
    EXCLUDED_LEAGUES: list[str] = []  # No exclusions

    # ELO Config
    ELO_K_FACTOR: float = 32.0
    ELO_HOME_ADVANTAGE: float = 65.0
    ELO_INITIAL: float = 1500.0

    # Data collection
    FOOTBALL_DATA_BASE_URL: str = "https://www.football-data.co.uk/mmz4281"
    REQUEST_DELAY_SECONDS: float = 1.0
    MAX_RETRIES: int = 3

    # Redis (optional, for shared cache)
    REDIS_URL: str = ""

    # CORS
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

    # Email (Resend — optional, graceful skip if empty)
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "BetTracker <noreply@bettracker.fr>"
    ADMIN_EMAIL: str = "contact@bettracker.fr"
    FRONTEND_URL: str = "http://localhost:5173"

    # Auth / JWT (no default — MUST be set via env or .env)
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    TRIAL_DAYS: int = 7

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

if not settings.JWT_SECRET_KEY or settings.JWT_SECRET_KEY in ("", "change-me-in-production", "CHANGE-ME-IN-PRODUCTION"):
    import os
    if os.getenv("TESTING") != "1":
        raise RuntimeError(
            "JWT_SECRET_KEY must be set to a strong random value. "
            "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
        )
