"""Test portfolio endpoint."""
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app, raise_server_exceptions=True)
r = client.post("/api/auth/login", json={"email": "admin@bettracker.fr", "password": "test1234"})
token = r.json()["access_token"]

print("--- Testing /api/portfolio/bets ---")
r2 = client.get("/api/portfolio/bets", headers={"Authorization": f"Bearer {token}"})
print(f"Status: {r2.status_code}")
data = r2.json()
print(f"Bets: {len(data)}")
if data:
    b = data[0]
    print(f"First: {b['home_team']} vs {b['away_team']} | {b['result']} | P&L: {b['profit_loss']}")

print("\n--- Testing /api/portfolio/stats ---")
r3 = client.get("/api/portfolio/stats", headers={"Authorization": f"Bearer {token}"})
print(f"Status: {r3.status_code}")
if r3.status_code == 200:
    s = r3.json()
    print(f"Stats: {s['total_bets']} bets, ROI {s['roi_pct']}%")
else:
    print(f"Error: {r3.text[:300]}")
