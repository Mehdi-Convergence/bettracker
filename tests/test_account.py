"""Tests for account management endpoints (PATCH /me, change-password, forgot/reset-password, DELETE /me)."""

from datetime import datetime, timedelta, timezone

from src.models.password_reset import PasswordResetToken
from tests.conftest import TEST_PASSWORD


# --- PATCH /auth/me (update profile) ---


def test_update_display_name(client, auth_headers):
    resp = client.patch("/api/auth/me", json={"display_name": "Nouveau Nom"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Nouveau Nom"


def test_update_email(client, auth_headers):
    resp = client.patch("/api/auth/me", json={"email": "newemail@example.com"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "newemail@example.com"


def test_update_email_duplicate(client, auth_headers):
    # Register another user
    client.post("/api/auth/register", json={
        "email": "other@example.com",
        "password": TEST_PASSWORD,
        "display_name": "Other",
    })
    resp = client.patch("/api/auth/me", json={"email": "other@example.com"}, headers=auth_headers)
    assert resp.status_code == 409


def test_update_profile_no_auth(client):
    resp = client.patch("/api/auth/me", json={"display_name": "Hacker"})
    assert resp.status_code == 401


# --- POST /auth/change-password ---


def test_change_password_success(client, auth_headers):
    resp = client.post("/api/auth/change-password", json={
        "current_password": TEST_PASSWORD,
        "new_password": "NewPassword456",
    }, headers=auth_headers)
    assert resp.status_code == 200

    # Verify new password works
    login_resp = client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": "NewPassword456",
    })
    assert login_resp.status_code == 200


def test_change_password_wrong_current(client, auth_headers):
    resp = client.post("/api/auth/change-password", json={
        "current_password": "WrongPass1",
        "new_password": "NewPassword456",
    }, headers=auth_headers)
    assert resp.status_code == 400


def test_change_password_too_short(client, auth_headers):
    resp = client.post("/api/auth/change-password", json={
        "current_password": TEST_PASSWORD,
        "new_password": "short",
    }, headers=auth_headers)
    assert resp.status_code == 422


# --- POST /auth/forgot-password ---


def test_forgot_password_existing_email(client, auth_headers, db_session):
    resp = client.post("/api/auth/forgot-password", json={"email": "test@example.com"})
    assert resp.status_code == 200
    # Token should be created in DB
    token = db_session.query(PasswordResetToken).first()
    assert token is not None
    assert token.expires_at > datetime.now(timezone.utc).replace(tzinfo=None)


def test_forgot_password_nonexistent_email(client):
    # Should still return 200 (anti-enumeration)
    resp = client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"})
    assert resp.status_code == 200


def test_forgot_password_invalid_email(client):
    resp = client.post("/api/auth/forgot-password", json={"email": "not-an-email"})
    assert resp.status_code == 422


# --- POST /auth/reset-password ---


def test_reset_password_success(client, auth_headers, db_session):
    # Create a reset token
    client.post("/api/auth/forgot-password", json={"email": "test@example.com"})
    token_obj = db_session.query(PasswordResetToken).first()
    assert token_obj is not None

    resp = client.post("/api/auth/reset-password", json={
        "token": token_obj.token,
        "new_password": "ResetPassword789",
    })
    assert resp.status_code == 200

    # Token should be deleted from DB
    remaining = db_session.query(PasswordResetToken).filter(
        PasswordResetToken.token == token_obj.token
    ).first()
    assert remaining is None

    # Verify new password works
    login_resp = client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": "ResetPassword789",
    })
    assert login_resp.status_code == 200


def test_reset_password_invalid_token(client):
    resp = client.post("/api/auth/reset-password", json={
        "token": "invalid-token-xyz",
        "new_password": "NewPassword456",
    })
    assert resp.status_code == 400


def test_reset_password_expired_token(client, auth_headers, db_session):
    # Create expired token directly in DB
    from src.models.user import User
    user = db_session.query(User).filter(User.email == "test@example.com").first()
    expired = PasswordResetToken(
        user_id=user.id,
        token="expired-token-abc",
        expires_at=datetime.now(timezone.utc) - timedelta(hours=2),
    )
    db_session.add(expired)
    db_session.commit()

    resp = client.post("/api/auth/reset-password", json={
        "token": "expired-token-abc",
        "new_password": "NewPassword456",
    })
    assert resp.status_code == 400


# --- DELETE /auth/me ---


def test_delete_account(client, auth_headers, db_session):
    resp = client.delete("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200

    # User should not be able to login anymore
    login_resp = client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": TEST_PASSWORD,
    })
    assert login_resp.status_code == 401


def test_delete_account_no_auth(client):
    resp = client.delete("/api/auth/me")
    assert resp.status_code == 401
