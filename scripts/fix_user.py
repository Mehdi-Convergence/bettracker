"""Reset user password and check bets."""
from sqlalchemy import create_engine, text
from src.config import settings
import bcrypt

engine = create_engine(settings.DATABASE_URL)
with engine.connect() as conn:
    r = conn.execute(text("SELECT id, email, hashed_password FROM users WHERE id = 2"))
    row = r.fetchone()
    print(f"Email: {row[1]}")

    # Try common passwords
    for p in ["test1234", "password", "demo", "admin", "bettracker", "Test1234!", "123456"]:
        if bcrypt.checkpw(p.encode(), row[2].encode()):
            print(f"Current password: {p}")
            break
    else:
        print("Unknown password — resetting to test1234")
        new_hash = bcrypt.hashpw("test1234".encode(), bcrypt.gensalt()).decode()
        conn.execute(text("UPDATE users SET hashed_password = :h WHERE id = 2"), {"h": new_hash})
        conn.commit()
        print("Done — new password: test1234")

    # Also check the portfolio endpoint logic
    r2 = conn.execute(text("SELECT count(*) FROM bets WHERE user_id = 2"))
    print(f"Bets for user 2: {r2.scalar()}")

    # Check date range
    r3 = conn.execute(text("SELECT match_date FROM bets WHERE user_id = 2 ORDER BY match_date DESC LIMIT 3"))
    for row in r3.fetchall():
        print(f"  Latest match: {row[0]}")
