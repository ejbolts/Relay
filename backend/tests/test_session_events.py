from datetime import timedelta

import pytest
from conftest import TEST_PASSWORD
from fastapi.testclient import TestClient
from sqlalchemy import select
from starlette.websockets import WebSocketDisconnect

from app.auth import create_user_session, utc_now
from app.database import SessionLocal
from app.models import ActiveWorkoutReminder, PushSubscription, User, UserSession
from app.session_events import session_user_id


def another_device(client):
    browser = TestClient(client.app)
    with SessionLocal() as db:
        token = create_user_session(db, db.get(User, client.user["id"]), client.app.state.settings)
    browser.cookies.set(client.app.state.settings.session_cookie, token)
    return browser, token


def expect_signed_out(socket):
    with pytest.raises(WebSocketDisconnect) as closed:
        socket.receive_json()
    assert closed.value.code == 4401


def test_logout_closes_all_devices_and_preserves_other_accounts(client, other_client):
    mobile, mobile_token = another_device(client)
    with mobile.websocket_connect("/api/auth/ws") as socket:
        assert socket.receive_json() == {"type": "session", "user_id": client.user["id"]}
        assert client.post("/api/auth/logout").status_code == 204
        expect_signed_out(socket)
    assert mobile.get("/api/auth/me").status_code == 401
    assert session_user_id(mobile_token) is None
    assert other_client.get("/api/auth/me").status_code == 200


def test_replayed_or_expired_logout_cannot_revoke_new_sessions(client):
    stale, token = another_device(client)
    client.post("/api/auth/logout")
    fresh, fresh_token = another_device(client)
    stale.post("/api/auth/logout")
    assert fresh.get("/api/auth/me").status_code == 200
    assert session_user_id(fresh_token) == client.user["id"]
    assert session_user_id(token) is None
    with SessionLocal() as db:
        db.scalar(select(UserSession)).expires_at = utc_now() - timedelta(seconds=1)
        db.commit()
    newer, newer_token = another_device(client)
    fresh.post("/api/auth/logout")
    assert newer.get("/api/auth/me").status_code == 200
    assert session_user_id(newer_token) == client.user["id"]


def test_password_change_closes_other_device_but_keeps_current_session(client):
    mobile, _ = another_device(client)
    with mobile.websocket_connect("/api/auth/ws") as socket:
        socket.receive_json()
        response = client.put(
            "/api/profile/password",
            json={"current_password": TEST_PASSWORD, "new_password": "a new secure password"},
        )
        assert response.status_code == 204
        expect_signed_out(socket)
    assert client.get("/api/auth/me").status_code == 200


@pytest.mark.parametrize("action", ["disable", "delete", "expire"])
def test_socket_obeys_account_and_session_lifecycle(client, other_client, monkeypatch, action):
    monkeypatch.setattr("app.session_events.SESSION_CHECK_SECONDS", 0.05)
    with other_client.websocket_connect("/api/auth/ws") as socket:
        socket.receive_json()
        if action == "disable":
            assert (
                client.patch(
                    f"/api/admin/users/{other_client.user['id']}", json={"disabled": True}
                ).status_code
                == 200
            )
        elif action == "delete":
            assert (
                other_client.request(
                    "DELETE", "/api/profile", json={"password": TEST_PASSWORD}
                ).status_code
                == 204
            )
        else:
            with SessionLocal() as db:
                row = db.scalar(
                    select(UserSession).where(UserSession.user_id == other_client.user["id"])
                )
                row.expires_at = utc_now() - timedelta(seconds=1)
                db.commit()
        expect_signed_out(socket)
    assert client.get("/api/auth/me").status_code == 200


def test_socket_requires_valid_cookie_and_same_origin(anonymous_client):
    with anonymous_client.websocket_connect("/api/auth/ws") as socket:
        expect_signed_out(socket)
    with pytest.raises(WebSocketDisconnect) as denied:
        with anonymous_client.websocket_connect(
            "/api/auth/ws", headers={"origin": "https://evil.example"}
        ):
            pytest.fail("Cross-origin handshake accepted")
    assert denied.value.code == 1008


def test_logout_stops_account_alerts_and_keeps_other_subscriptions(client, other_client):
    for browser in (client, other_client):
        endpoint = f"https://push.example/{browser.user['id']}"
        with SessionLocal() as db:
            db.add(
                PushSubscription(
                    user_id=browser.user["id"], endpoint=endpoint, p256dh="x", auth="y"
                )
            )
            db.add(
                ActiveWorkoutReminder(
                    user_id=browser.user["id"],
                    endpoint=endpoint,
                    timer_id="sample",
                    due_at=utc_now() + timedelta(hours=1),
                )
            )
            db.commit()
    assert client.post("/api/auth/logout").status_code == 204
    with SessionLocal() as db:
        assert list(db.scalars(select(PushSubscription.user_id))) == [other_client.user["id"]]
        assert list(db.scalars(select(ActiveWorkoutReminder.user_id))) == [other_client.user["id"]]
