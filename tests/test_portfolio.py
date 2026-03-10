"""Tests for portfolio endpoints (requires pro tier)."""

from tests.conftest import TEST_PASSWORD


def test_portfolio_stats_empty(client, auth_headers):
    """Free trial user can access portfolio (trial gives full access)."""
    resp = client.get("/api/portfolio/stats", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_bets"] == 0
    assert data["total_pnl"] == 0


def test_create_bet(client, auth_headers):
    resp = client.post("/api/portfolio/bets", headers=auth_headers, json={
        "home_team": "PSG",
        "away_team": "Lyon",
        "league": "Ligue 1",
        "match_date": "2026-03-10",
        "outcome_bet": "H",
        "odds_at_bet": 1.85,
        "stake": 10.0,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["home_team"] == "PSG"
    assert data["result"] == "pending"
    assert data["stake"] == 10.0


def test_create_bet_and_update_result(client, auth_headers):
    resp = client.post("/api/portfolio/bets", headers=auth_headers, json={
        "home_team": "PSG",
        "away_team": "Lyon",
        "league": "Ligue 1",
        "match_date": "2026-03-10",
        "outcome_bet": "H",
        "odds_at_bet": 1.85,
        "stake": 10.0,
    })
    bet_id = resp.json()["id"]

    # Update to won
    resp2 = client.patch(f"/api/portfolio/bets/{bet_id}", headers=auth_headers, json={
        "result": "won",
    })
    assert resp2.status_code == 200
    data = resp2.json()
    assert data["result"] == "won"
    assert data["profit_loss"] > 0


def test_update_bet_note(client, auth_headers):
    resp = client.post("/api/portfolio/bets", headers=auth_headers, json={
        "home_team": "PSG",
        "away_team": "Lyon",
        "league": "Ligue 1",
        "match_date": "2026-03-10",
        "outcome_bet": "H",
        "odds_at_bet": 1.85,
        "stake": 10.0,
    })
    bet_id = resp.json()["id"]

    resp2 = client.patch(f"/api/portfolio/bets/{bet_id}/note", headers=auth_headers, json={
        "note": "Bon pari, PSG en forme",
    })
    assert resp2.status_code == 200
    assert resp2.json()["note"] == "Bon pari, PSG en forme"


def test_delete_bet(client, auth_headers):
    resp = client.post("/api/portfolio/bets", headers=auth_headers, json={
        "home_team": "PSG",
        "away_team": "Lyon",
        "league": "Ligue 1",
        "match_date": "2026-03-10",
        "outcome_bet": "H",
        "odds_at_bet": 1.85,
        "stake": 10.0,
    })
    bet_id = resp.json()["id"]

    resp2 = client.delete(f"/api/portfolio/bets/{bet_id}", headers=auth_headers)
    assert resp2.status_code == 204

    # Verify gone
    resp3 = client.get("/api/portfolio/bets", headers=auth_headers)
    assert len(resp3.json()) == 0


def test_list_bets(client, auth_headers):
    client.post("/api/portfolio/bets", headers=auth_headers, json={
        "home_team": "PSG",
        "away_team": "Lyon",
        "league": "Ligue 1",
        "match_date": "2026-03-10",
        "outcome_bet": "H",
        "odds_at_bet": 1.85,
        "stake": 10.0,
    })
    resp = client.get("/api/portfolio/bets", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_portfolio_history(client, auth_headers):
    resp = client.get("/api/portfolio/history", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_portfolio_no_auth(client):
    resp = client.get("/api/portfolio/stats")
    assert resp.status_code == 401
