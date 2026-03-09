"""Tests for portfolio endpoints (requires pro tier)."""


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


def test_portfolio_no_auth(client):
    resp = client.get("/api/portfolio/stats")
    assert resp.status_code == 401
