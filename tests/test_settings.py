"""Tests for settings/preferences endpoints."""


def test_get_preferences_default(client, auth_headers):
    """First call auto-creates default preferences."""
    resp = client.get("/api/settings/preferences", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["initial_bankroll"] == 1000.0
    assert data["theme"] == "light"
    assert data["language"] == "fr"
    assert data["currency"] == "EUR"
    assert data["notif_new_ticket"] is True


def test_update_preferences(client, auth_headers):
    # Ensure default exists
    client.get("/api/settings/preferences", headers=auth_headers)

    resp = client.patch("/api/settings/preferences", headers=auth_headers, json={
        "initial_bankroll": 2000.0,
        "theme": "dark",
        "notif_new_ticket": False,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["initial_bankroll"] == 2000.0
    assert data["theme"] == "dark"
    assert data["notif_new_ticket"] is False
    # Unchanged fields should keep defaults
    assert data["language"] == "fr"


def test_update_preferences_partial(client, auth_headers):
    """Only update one field, rest unchanged."""
    client.get("/api/settings/preferences", headers=auth_headers)
    client.patch("/api/settings/preferences", headers=auth_headers, json={
        "currency": "USD",
    })
    resp = client.get("/api/settings/preferences", headers=auth_headers)
    assert resp.json()["currency"] == "USD"
    assert resp.json()["theme"] == "light"  # default


def test_preferences_no_auth(client):
    resp = client.get("/api/settings/preferences")
    assert resp.status_code == 401
