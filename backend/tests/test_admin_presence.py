import asyncio
from datetime import UTC, datetime, timedelta

from test_presence import SOCKET, live, report
from test_sharing import share

from app.config import get_settings
from app.database import SessionLocal
from app.models import User
from app.presence import Window, deliver, hub


def test_subscribed_admin_sees_private_non_friend_activity_and_snapshot(client, other_client):
    share(other_client, "private")
    with client.websocket_connect(SOCKET) as admin:
        admin.send_json({"type": "admin_activity", "enabled": True})
        assert admin.receive_json() == {"type": "admin_activity_sync"}
        with other_client.websocket_connect(SOCKET) as phone:
            phone.send_json(report(workout=live()))
            message = admin.receive_json()
            assert message["type"] == "admin_activity"
            assert message["user_id"] == other_client.user["id"]
            assert message["presence"]["online"] is True
            assert message["presence"]["workout"]["name"] == "Push day"
            users = client.get("/api/admin/users").json()
            snapshot = next(user for user in users if user["id"] == other_client.user["id"])
            assert snapshot["presence"] == message["presence"]
            assert client.get("/api/sharing/friends").json()["friends"] == []

            phone.send_json(report(visible=False, workout=live()))
            hidden = admin.receive_json()["presence"]
            assert hidden["online"] is False
            assert hidden["workout"]["name"] == "Push day"
            assert datetime.now(UTC) - datetime.fromisoformat(
                hidden["last_active_at"].replace("Z", "+00:00")
            ) < timedelta(minutes=1)
            phone.send_json(report(visible=False))
            assert admin.receive_json()["presence"]["workout"] is None


def test_non_admin_cannot_subscribe_and_admin_can_stop_subscription(client, other_client):
    with client.websocket_connect(SOCKET) as admin:
        admin.send_json({"type": "admin_activity", "enabled": True})
        assert admin.receive_json()["type"] == "admin_activity_sync"
        with other_client.websocket_connect(SOCKET) as member:
            member.send_json({"type": "admin_activity", "enabled": True})
            member.send_json(report())
            assert admin.receive_json()["user_id"] == other_client.user["id"]
            assert [window.user_id for window in hub.admin_windows()] == [client.user["id"]]
            member.send_json(report(visible=False))
            assert admin.receive_json()["presence"]["online"] is False
        admin.send_json({"type": "admin_activity", "enabled": False})
        # A fresh enable is acknowledged after the preceding disable was processed.
        admin.send_json({"type": "admin_activity", "enabled": True})
        assert admin.receive_json()["type"] == "admin_activity_sync"
    assert hub.admin_windows() == []


def test_admin_delivery_rechecks_role_and_session(client):
    sent, closed = [], []

    class Socket:
        async def send_json(self, message):
            sent.append(message)

        async def close(self, code):
            closed.append(code)

    async def attempt():
        window = Window(
            Socket(), client.user["id"], client.cookies.get(get_settings().session_cookie)
        )
        await deliver(window, {"type": "admin_activity"}, admin_only=True)
        with SessionLocal() as db:
            db.get(User, client.user["id"]).is_admin = False
            db.commit()
        await deliver(window, {"type": "must_not_arrive"}, admin_only=True)
        # Role loss does not break the member's normal notification connection.
        await deliver(window, {"type": "notifications"})
        client.post("/api/auth/logout")
        await deliver(window, {"type": "also_must_not_arrive"}, admin_only=True)

    asyncio.run(attempt())
    assert sent == [{"type": "admin_activity"}, {"type": "notifications"}]
    assert closed == [4401]


def test_last_visible_socket_closing_pushes_admin_offline_state(client, other_client):
    sent = []

    class Socket:
        async def send_json(self, message):
            sent.append(message)

    async def close_phone():
        admin_id, member_id = client.user["id"], other_client.user["id"]
        hub.connect(admin_id, "admin", Socket(), client.cookies.get(get_settings().session_cookie))
        hub.connect(
            member_id, "phone", Socket(), other_client.cookies.get(get_settings().session_cookie)
        )
        hub.subscribe_admin(admin_id, "admin", True)
        hub.set_visible(member_id, "phone", True)
        from app.presence import leave

        await leave(member_id, "phone")
        await leave(admin_id, "admin")

    asyncio.run(close_phone())
    assert len(sent) == 1
    assert sent[0]["type"] == "admin_activity"
    assert sent[0]["user_id"] == other_client.user["id"]
    assert sent[0]["presence"]["online"] is False
    assert sent[0]["presence"]["last_active_at"] is not None
