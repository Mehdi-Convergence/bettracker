"""Tests for authentication endpoints."""

from tests.conftest import TEST_PASSWORD


def test_register_success(client):
    resp = client.post("/api/auth/register", json={
        "email": "new@example.com",
        "password": TEST_PASSWORD,
        "display_name": "New User",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "new@example.com"
    assert data["display_name"] == "New User"
    assert data["tier"] == "free"
    assert data["trial_ends_at"] is not None


def test_register_duplicate_email(client):
    payload = {
        "email": "dup@example.com",
        "password": TEST_PASSWORD,
        "display_name": "User",
    }
    client.post("/api/auth/register", json=payload)
    resp = client.post("/api/auth/register", json=payload)
    assert resp.status_code == 409


def test_register_short_password(client):
    resp = client.post("/api/auth/register", json={
        "email": "short@example.com",
        "password": "abc",
        "display_name": "User",
    })
    assert resp.status_code == 422


def test_register_weak_password_no_uppercase(client):
    resp = client.post("/api/auth/register", json={
        "email": "weak@example.com",
        "password": "securepass1",
        "display_name": "User",
    })
    assert resp.status_code == 422


def test_register_weak_password_no_digit(client):
    resp = client.post("/api/auth/register", json={
        "email": "weak@example.com",
        "password": "SecurePass",
        "display_name": "User",
    })
    assert resp.status_code == 422


def test_register_invalid_email(client):
    resp = client.post("/api/auth/register", json={
        "email": "not-an-email",
        "password": TEST_PASSWORD,
        "display_name": "User",
    })
    assert resp.status_code == 422


def test_login_success(client):
    client.post("/api/auth/register", json={
        "email": "login@example.com",
        "password": TEST_PASSWORD,
        "display_name": "User",
    })
    resp = client.post("/api/auth/login", json={
        "email": "login@example.com",
        "password": TEST_PASSWORD,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client):
    client.post("/api/auth/register", json={
        "email": "wrong@example.com",
        "password": TEST_PASSWORD,
        "display_name": "User",
    })
    resp = client.post("/api/auth/login", json={
        "email": "wrong@example.com",
        "password": "WrongPass1",
    })
    assert resp.status_code == 401


def test_login_nonexistent_user(client):
    resp = client.post("/api/auth/login", json={
        "email": "ghost@example.com",
        "password": TEST_PASSWORD,
    })
    assert resp.status_code == 401


def test_refresh_token(client):
    client.post("/api/auth/register", json={
        "email": "refresh@example.com",
        "password": TEST_PASSWORD,
        "display_name": "User",
    })
    login_resp = client.post("/api/auth/login", json={
        "email": "refresh@example.com",
        "password": TEST_PASSWORD,
    })
    refresh_token = login_resp.json()["refresh_token"]

    resp = client.post("/api/auth/refresh", json={
        "refresh_token": refresh_token,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_refresh_invalid_token(client):
    resp = client.post("/api/auth/refresh", json={
        "refresh_token": "invalid.token.here",
    })
    assert resp.status_code == 401


def test_me_authenticated(client, auth_headers):
    resp = client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "test@example.com"
    assert data["display_name"] == "Test User"


def test_me_no_token(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_logout_all(client, auth_headers):
    resp = client.post("/api/auth/logout-all", headers=auth_headers)
    assert resp.status_code == 200
    # Old token should be invalidated
    resp2 = client.get("/api/auth/me", headers=auth_headers)
    assert resp2.status_code == 401


def test_user_stats(client, auth_headers):
    resp = client.get("/api/auth/stats", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "member_since" in data
    assert data["total_bets"] == 0
