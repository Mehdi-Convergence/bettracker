"""Shared test fixtures: in-memory SQLite DB, FastAPI TestClient."""

import os
os.environ["TESTING"] = "1"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.models.base import Base
# Import all models so tables are registered on Base.metadata
from src.models.user import User  # noqa: F401
from src.models.bet import Bet  # noqa: F401
from src.models.campaign import Campaign  # noqa: F401
from src.models.password_reset import PasswordResetToken  # noqa: F401
from src.models.user_preferences import UserPreferences  # noqa: F401
from src.models.campaign_version import CampaignVersion  # noqa: F401
from src.models.saved_backtest import SavedBacktest  # noqa: F401
from src.models.notification import Notification  # noqa: F401
from src.database import get_db
from src.main import app

# Password that passes strength validation (uppercase + lowercase + digit, 8+ chars)
TEST_PASSWORD = "SecurePass1"


@pytest.fixture()
def db_session():
    """Create an in-memory SQLite database for each test."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine)
    session = TestSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    """FastAPI TestClient with overridden DB dependency."""
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    # Disable rate limiting during tests
    from src.rate_limit import limiter
    limiter.enabled = False
    with TestClient(app) as c:
        yield c
    limiter.enabled = True
    app.dependency_overrides.clear()


@pytest.fixture()
def auth_headers(client):
    """Register a user and return auth headers."""
    client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": TEST_PASSWORD,
        "display_name": "Test User",
    })
    resp = client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": TEST_PASSWORD,
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
