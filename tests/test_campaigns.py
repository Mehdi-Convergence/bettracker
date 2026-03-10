"""Tests for campaign endpoints (requires premium tier — trial gives full access)."""

from tests.conftest import TEST_PASSWORD


def _create_campaign(client, auth_headers, name="Test Campaign"):
    return client.post("/api/campaigns", headers=auth_headers, json={
        "name": name,
        "initial_bankroll": 500.0,
        "flat_stake": 0.05,
        "min_edge": 0.03,
    })


def test_create_campaign(client, auth_headers):
    resp = _create_campaign(client, auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test Campaign"
    assert data["status"] == "active"
    assert data["initial_bankroll"] == 500.0
    assert data["flat_stake"] == 0.05


def test_list_campaigns(client, auth_headers):
    _create_campaign(client, auth_headers, "Camp A")
    _create_campaign(client, auth_headers, "Camp B")
    resp = client.get("/api/campaigns", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_get_campaign_detail(client, auth_headers):
    create_resp = _create_campaign(client, auth_headers)
    cid = create_resp.json()["id"]
    resp = client.get(f"/api/campaigns/{cid}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "campaign" in data
    assert "stats" in data
    assert data["stats"]["total_bets"] == 0


def test_update_campaign(client, auth_headers):
    create_resp = _create_campaign(client, auth_headers)
    cid = create_resp.json()["id"]
    resp = client.patch(f"/api/campaigns/{cid}", headers=auth_headers, json={
        "flat_stake": 0.10,
        "min_edge": 0.05,
    })
    assert resp.status_code == 200
    assert resp.json()["flat_stake"] == 0.10


def test_update_creates_version(client, auth_headers):
    create_resp = _create_campaign(client, auth_headers)
    cid = create_resp.json()["id"]
    client.patch(f"/api/campaigns/{cid}", headers=auth_headers, json={
        "flat_stake": 0.10,
    })
    resp = client.get(f"/api/campaigns/{cid}/versions", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["current_version"] == 2
    assert len(data["versions"]) == 2


def test_delete_campaign(client, auth_headers):
    create_resp = _create_campaign(client, auth_headers)
    cid = create_resp.json()["id"]
    resp = client.delete(f"/api/campaigns/{cid}", headers=auth_headers)
    assert resp.status_code == 204
    # Verify deleted
    resp2 = client.get(f"/api/campaigns/{cid}", headers=auth_headers)
    assert resp2.status_code == 404


def test_campaign_not_found(client, auth_headers):
    resp = client.get("/api/campaigns/9999", headers=auth_headers)
    assert resp.status_code == 404


def test_campaign_bets_lifecycle(client, auth_headers):
    """Create campaign, accept a bet, update result, verify stats."""
    create_resp = _create_campaign(client, auth_headers)
    cid = create_resp.json()["id"]

    # Accept a recommendation (manual bet creation via accept)
    bet_resp = client.post(f"/api/campaigns/{cid}/accept", headers=auth_headers, json={
        "home_team": "PSG",
        "away_team": "Marseille",
        "league": "F1",
        "match_date": "2026-03-15T20:00:00",
        "outcome": "H",
        "odds": 1.75,
        "stake": 25.0,
    })
    assert bet_resp.status_code == 200
    bet_id = bet_resp.json()["id"]
    assert bet_resp.json()["source"] == "algo"

    # List bets
    bets_resp = client.get(f"/api/campaigns/{cid}/bets", headers=auth_headers)
    assert len(bets_resp.json()) == 1

    # Update to won
    update_resp = client.patch(f"/api/campaigns/{cid}/bets/{bet_id}", headers=auth_headers, json={
        "result": "won",
    })
    assert update_resp.status_code == 200
    assert update_resp.json()["profit_loss"] > 0

    # Check stats
    detail_resp = client.get(f"/api/campaigns/{cid}", headers=auth_headers)
    stats = detail_resp.json()["stats"]
    assert stats["total_bets"] == 1
    assert stats["won"] == 1
    assert stats["total_pnl"] > 0


def test_campaign_history(client, auth_headers):
    create_resp = _create_campaign(client, auth_headers)
    cid = create_resp.json()["id"]
    resp = client.get(f"/api/campaigns/{cid}/history", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert data[0]["date"] == "start"


def test_delete_campaign_bet(client, auth_headers):
    create_resp = _create_campaign(client, auth_headers)
    cid = create_resp.json()["id"]
    bet_resp = client.post(f"/api/campaigns/{cid}/accept", headers=auth_headers, json={
        "home_team": "PSG",
        "away_team": "Lyon",
        "league": "F1",
        "match_date": "2026-03-15T20:00:00",
        "outcome": "H",
        "odds": 1.75,
        "stake": 25.0,
    })
    bet_id = bet_resp.json()["id"]
    resp = client.delete(f"/api/campaigns/{cid}/bets/{bet_id}", headers=auth_headers)
    assert resp.status_code == 204


def test_campaign_no_auth(client):
    resp = client.get("/api/campaigns")
    assert resp.status_code == 401


def test_campaign_versions_initial(client, auth_headers):
    create_resp = _create_campaign(client, auth_headers)
    cid = create_resp.json()["id"]
    resp = client.get(f"/api/campaigns/{cid}/versions", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["current_version"] == 1
    assert len(data["versions"]) == 1
    assert data["versions"][0]["change_summary"] == "Création"
