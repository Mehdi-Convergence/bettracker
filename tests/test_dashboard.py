"""Tests for dashboard endpoints."""


def test_dashboard_summary_empty(client, auth_headers):
    resp = client.get("/api/dashboard/summary", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["active_campaigns"] == 0
    assert data["pending_bets"] == 0
    assert data["recent_results"]["won"] == 0
    assert data["recent_results"]["lost"] == 0


def test_dashboard_summary_with_data(client, auth_headers):
    """Create a campaign + bet, verify dashboard reflects it."""
    # Create campaign
    camp_resp = client.post("/api/campaigns", headers=auth_headers, json={
        "name": "Dashboard Test",
        "initial_bankroll": 500.0,
        "flat_stake": 0.05,
        "min_edge": 0.03,
    })
    cid = camp_resp.json()["id"]

    # Add a bet
    client.post(f"/api/campaigns/{cid}/accept", headers=auth_headers, json={
        "home_team": "PSG",
        "away_team": "Lyon",
        "league": "F1",
        "match_date": "2026-03-15T20:00:00",
        "outcome": "H",
        "odds": 1.75,
        "stake": 25.0,
    })

    resp = client.get("/api/dashboard/summary", headers=auth_headers)
    data = resp.json()
    assert data["active_campaigns"] == 1
    assert data["pending_bets"] == 1
    assert len(data["campaign_summaries"]) == 1
    assert data["campaign_summaries"][0]["total_bets"] == 1


def test_dashboard_no_auth(client):
    resp = client.get("/api/dashboard/summary")
    assert resp.status_code == 401
