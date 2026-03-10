"""Tests for backtest save/load/delete endpoints."""


def _save_backtest(client, auth_headers, name="Mon backtest"):
    return client.post("/api/backtest/save", headers=auth_headers, json={
        "name": name,
        "sport": "football",
        "params": {"staking_strategy": "half_kelly", "min_edge": 0.05},
        "metrics": {"total_bets": 100, "roi_pct": 5.2, "win_rate": 0.58},
        "bets": [{"date": "2025-01-01", "match": "PSG vs Lyon", "pnl": 10.0}],
        "bankroll_curve": [200.0, 210.0, 205.0, 215.0],
        "config": {"staking_strategy": "half_kelly"},
    })


def test_save_backtest(client, auth_headers):
    resp = _save_backtest(client, auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Mon backtest"
    assert data["sport"] == "football"
    assert data["roi_pct"] == 5.2
    assert data["total_bets"] == 100


def test_list_saved_backtests(client, auth_headers):
    _save_backtest(client, auth_headers, "BT 1")
    _save_backtest(client, auth_headers, "BT 2")
    resp = client.get("/api/backtest/saved", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_get_saved_backtest(client, auth_headers):
    save_resp = _save_backtest(client, auth_headers)
    bt_id = save_resp.json()["id"]
    resp = client.get(f"/api/backtest/saved/{bt_id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Mon backtest"
    assert data["params"]["staking_strategy"] == "half_kelly"
    assert len(data["bets"]) == 1
    assert len(data["bankroll_curve"]) == 4


def test_delete_saved_backtest(client, auth_headers):
    save_resp = _save_backtest(client, auth_headers)
    bt_id = save_resp.json()["id"]
    resp = client.delete(f"/api/backtest/saved/{bt_id}", headers=auth_headers)
    assert resp.status_code == 204
    # Verify deleted
    resp2 = client.get(f"/api/backtest/saved/{bt_id}", headers=auth_headers)
    assert resp2.status_code == 404


def test_saved_backtest_not_found(client, auth_headers):
    resp = client.get("/api/backtest/saved/9999", headers=auth_headers)
    assert resp.status_code == 404


def test_saved_backtest_isolation(client, auth_headers):
    """User A cannot access User B's backtests."""
    save_resp = _save_backtest(client, auth_headers)
    bt_id = save_resp.json()["id"]

    # Register user B
    from tests.conftest import TEST_PASSWORD
    client.post("/api/auth/register", json={
        "email": "userb@example.com",
        "password": TEST_PASSWORD,
        "display_name": "User B",
    })
    login_resp = client.post("/api/auth/login", json={
        "email": "userb@example.com",
        "password": TEST_PASSWORD,
    })
    headers_b = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    # User B cannot access user A's backtest
    resp = client.get(f"/api/backtest/saved/{bt_id}", headers=headers_b)
    assert resp.status_code == 404


def test_saved_backtest_no_auth(client):
    resp = client.get("/api/backtest/saved")
    assert resp.status_code == 401
