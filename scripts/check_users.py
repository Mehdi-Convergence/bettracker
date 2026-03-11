"""Check users, password hashing, and bet ownership."""
from sqlalchemy import create_engine, text
from src.config import settings

engine = create_engine(settings.DATABASE_URL)
with engine.connect() as conn:
    # Get column names for users table
    r = conn.execute(text("PRAGMA table_info(users)"))
    cols = [row[1] for row in r.fetchall()]
    print("Users columns:", cols)

    # Get users
    r = conn.execute(text("SELECT * FROM users"))
    rows = r.fetchall()
    print(f"\n{len(rows)} users:")
    for row in rows:
        row_dict = dict(zip(cols, row))
        pwd = row_dict.get("hashed_password", "")
        is_bcrypt = pwd.startswith("$2b$") if pwd else False
        print(f"  id={row_dict['id']} | {row_dict.get('email','')} | {row_dict.get('display_name','')} | tier={row_dict.get('tier','')} | bcrypt={is_bcrypt} | pwd={pwd[:25]}...")

    # Get column names for bets
    r = conn.execute(text("PRAGMA table_info(bets)"))
    bet_cols = [row[1] for row in r.fetchall()]
    print(f"\nBets columns: {bet_cols}")

    # Check if user_id exists in bets
    if "user_id" in bet_cols:
        r = conn.execute(text("SELECT user_id, count(*) FROM bets GROUP BY user_id"))
        print("\nBets par user_id:")
        for row in r.fetchall():
            print(f"  user_id={row[0]}: {row[1]} bets")
    else:
        print("\nWARNING: No user_id column in bets table!")
        print("  -> This means bets are not linked to users")
        print("  -> Frontend shows nothing because the API filters by current user")
