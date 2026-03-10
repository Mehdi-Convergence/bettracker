"""Tests for notification endpoints."""

from src.models.notification import Notification


def test_notifications_empty(client, auth_headers):
    resp = client.get("/api/notifications", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_unread_count_zero(client, auth_headers):
    resp = client.get("/api/notifications/unread-count", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["count"] == 0


def test_notification_lifecycle(client, auth_headers, db_session):
    """Create notification in DB, list, mark read."""
    from src.models.user import User
    user = db_session.query(User).filter(User.email == "test@example.com").first()
    notif = Notification(
        user_id=user.id,
        type="test",
        title="Test notification",
        message="This is a test",
    )
    db_session.add(notif)
    db_session.commit()
    db_session.refresh(notif)

    # List
    resp = client.get("/api/notifications", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Test notification"
    assert data[0]["is_read"] is False

    # Unread count
    resp2 = client.get("/api/notifications/unread-count", headers=auth_headers)
    assert resp2.json()["count"] == 1

    # Mark read
    nid = data[0]["id"]
    resp3 = client.patch(f"/api/notifications/{nid}/read", headers=auth_headers)
    assert resp3.status_code == 200
    assert resp3.json()["is_read"] is True

    # Unread count should be 0
    resp4 = client.get("/api/notifications/unread-count", headers=auth_headers)
    assert resp4.json()["count"] == 0


def test_mark_all_read(client, auth_headers, db_session):
    from src.models.user import User
    user = db_session.query(User).filter(User.email == "test@example.com").first()
    for i in range(3):
        db_session.add(Notification(
            user_id=user.id,
            type="test",
            title=f"Notif {i}",
            message="msg",
        ))
    db_session.commit()

    resp = client.post("/api/notifications/read-all", headers=auth_headers)
    assert resp.status_code == 204

    resp2 = client.get("/api/notifications/unread-count", headers=auth_headers)
    assert resp2.json()["count"] == 0


def test_notifications_no_auth(client):
    resp = client.get("/api/notifications")
    assert resp.status_code == 401
