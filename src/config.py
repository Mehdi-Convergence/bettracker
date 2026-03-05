from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite:///./bettracker.db"

    # API Keys (optional, for live scanner)
    ODDS_API_KEY: str = ""
    API_FOOTBALL_KEY: str = ""

    # ML Config
    KELLY_FRACTION: float = 0.125  # 1/8 Kelly (conservative)
    MAX_STAKE_PERCENT: float = 0.03
    MIN_EDGE_THRESHOLD: float = 0.05
    INITIAL_BANKROLL: float = 200.0

    # Strategy Config
    ALLOWED_OUTCOMES: list[str] = ["H", "D", "A"]  # All outcomes
    EXCLUDED_LEAGUES: list[str] = []  # No exclusions
    FLAT_STAKE: float = 0.05  # 5% flat stake

    # ELO Config
    ELO_K_FACTOR: float = 32.0
    ELO_HOME_ADVANTAGE: float = 65.0
    ELO_INITIAL: float = 1500.0

    # Data collection
    FOOTBALL_DATA_BASE_URL: str = "https://www.football-data.co.uk/mmz4281"
    REQUEST_DELAY_SECONDS: float = 1.0
    MAX_RETRIES: int = 3

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
