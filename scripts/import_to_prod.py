import json
import psycopg2

DB_URL = "postgresql://bettracker:bVdnDdM6Vu1jJNrkJlExMJXGTZQQY6flNUUJwFnt4o@postgres:5432/bettracker"

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

with open("/tmp/user_data.json") as f:
    data = json.load(f)

u = data["user"]
cur.execute(
    """
    INSERT INTO users (id, email, hashed_password, display_name, is_active, tier,
        trial_ends_at, stripe_customer_id, stripe_subscription_id, created_at, updated_at,
        token_version, onboarding_completed, visited_modules)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    ON CONFLICT (email) DO NOTHING
    """,
    (
        u["id"], u["email"], u["hashed_password"], u["display_name"], bool(u["is_active"]),
        u["tier"], u["trial_ends_at"], u["stripe_customer_id"], u["stripe_subscription_id"],
        u["created_at"], u["updated_at"], u["token_version"],
        bool(u["onboarding_completed"]), u["visited_modules"],
    ),
)
print("User inserted")

for c in data["campaigns"]:
    cur.execute(
        """
        INSERT INTO campaigns (id, name, user_id, status, initial_bankroll, flat_stake,
            min_edge, min_model_prob, min_odds, max_odds, allowed_outcomes, excluded_leagues,
            combo_mode, combo_max_legs, combo_min_odds, combo_max_odds, combo_top_n,
            target_bankroll, created_at, updated_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT DO NOTHING
        """,
        (
            c["id"], c["name"], c["user_id"], c["status"], c["initial_bankroll"], c["flat_stake"],
            c["min_edge"], c["min_model_prob"], c["min_odds"], c["max_odds"],
            c["allowed_outcomes"], c["excluded_leagues"], bool(c["combo_mode"]),
            c["combo_max_legs"], c["combo_min_odds"], c["combo_max_odds"], c["combo_top_n"],
            c["target_bankroll"], c["created_at"], c["updated_at"],
        ),
    )
print(f"{len(data['campaigns'])} campaigns inserted")

for b in data["bets"]:
    cur.execute(
        """
        INSERT INTO bets (id, user_id, campaign_id, sport, match_date, home_team, away_team,
            league, outcome_bet, odds_at_bet, odds_at_close, stake, result, profit_loss,
            clv, is_backtest, backtest_id, combo_group, source, bookmaker, edge_at_bet,
            note, campaign_version, created_at, updated_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT DO NOTHING
        """,
        (
            b["id"], b["user_id"], b["campaign_id"], b["sport"], b["match_date"],
            b["home_team"], b["away_team"], b["league"], b["outcome_bet"],
            b["odds_at_bet"], b["odds_at_close"], b["stake"], b["result"],
            b["profit_loss"], b["clv"], bool(b["is_backtest"]), b["backtest_id"],
            b["combo_group"], b["source"], b["bookmaker"], b["edge_at_bet"],
            b["note"], b["campaign_version"], b["created_at"], b["updated_at"],
        ),
    )
print(f"{len(data['bets'])} bets inserted")

for v in data["versions"]:
    snap = v["snapshot"]
    if isinstance(snap, dict):
        snap = json.dumps(snap)
    cur.execute(
        """
        INSERT INTO campaign_versions (id, campaign_id, version, snapshot, changed_at, change_summary)
        VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING
        """,
        (v["id"], v["campaign_id"], v["version"], snap, v["changed_at"], v["change_summary"]),
    )
print(f"{len(data['versions'])} versions inserted")

cur.execute("SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))")
cur.execute("SELECT setval('campaigns_id_seq', (SELECT MAX(id) FROM campaigns))")
cur.execute("SELECT setval('bets_id_seq', (SELECT MAX(id) FROM bets))")

conn.commit()

cur.execute("SELECT id, email, tier FROM users")
print("Users:", cur.fetchall())
cur.execute("SELECT COUNT(*) FROM bets")
print("Total bets:", cur.fetchone()[0])
cur.execute("SELECT COUNT(*) FROM campaigns")
print("Total campaigns:", cur.fetchone()[0])
conn.close()
print("Import OK")
