import pytest
import requests
from sqlalchemy import select

from app.config import get_settings
from app.database import SessionLocal
from app.models import PushSubscription
from app.notifications import send_push_notification
from app.push_security import MAX_PUSH_SUBSCRIPTIONS, PushSession, validate_push_endpoint


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://127.0.0.1/sink",
        "https://127.0.0.1/sink",
        "https://[::1]/sink",
        "https://169.254.169.254/latest",
        "https://10.0.0.1/sink",
        "https://example.com/push",
        "https://web.push.apple.com.evil.test/push",
        "https://evil.web.push.apple.com/push",
        "https://web.push.apple.com@localhost/push",
        "https://user@web.push.apple.com/push",
        "https://web.push.apple.com:8443/push",
        "https://web.push.apple.com/push#fragment",
        "https://web.push.apple.com\\@localhost/push",
        " https://web.push.apple.com/push",
        "https://web.push.apple.com/push\n",
        "file:///tmp/push",
        "https://web.push.apple.com/",
    ],
)
def test_rejects_arbitrary_destinations(client, endpoint):
    response = client.post(
        "/api/notifications/push/subscriptions",
        json={"endpoint": endpoint, "p256dh": "k", "auth": "a"},
    )
    assert response.status_code == 422
    with SessionLocal() as db:
        assert db.scalar(select(PushSubscription)) is None


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://web.push.apple.com/token",
        "https://fcm.googleapis.com/wp/token",
        "https://updates.push.services.mozilla.com/wpush/v2/token",
        "https://wns2-db5p.notify.windows.com/w/?token=sample",
    ],
)
def test_accepts_browser_vendors(endpoint):
    assert validate_push_endpoint(endpoint) == endpoint


def test_transport_disables_redirects(monkeypatch):
    calls = []

    def request(self, method, url, **kwargs):
        calls.append((url, kwargs))
        response = requests.Response()
        response.status_code = 302
        response.headers["Location"] = "http://127.0.0.1/sink"
        return response

    monkeypatch.setattr(requests.Session, "request", request)
    with PushSession() as transport:
        response = transport.post("https://web.push.apple.com/token", allow_redirects=True)
        assert response.status_code == 302
        with pytest.raises(ValueError):
            transport.post("http://127.0.0.1/sink")
    assert len(calls) == 1
    assert calls[0][1]["allow_redirects"] is False
    assert calls[0][1]["verify"] is True


def test_legacy_invalid_subscription_never_reaches_transport(client, monkeypatch):
    with SessionLocal() as db:
        db.add(
            PushSubscription(
                user_id=client.user["id"], endpoint="http://127.0.0.1/sink", p256dh="k", auth="a"
            )
        )
        db.commit()

    def forbidden(**kwargs):
        pytest.fail("Unsafe legacy endpoint reached webpush")

    monkeypatch.setattr("pywebpush.webpush", forbidden)
    assert not send_push_notification(
        SessionLocal, get_settings(), user_id=client.user["id"], title="test", body="test"
    )
    with SessionLocal() as db:
        assert db.scalar(select(PushSubscription)) is None


def test_device_limit_allows_existing_device_refresh(client):
    for i in range(MAX_PUSH_SUBSCRIPTIONS):
        assert (
            client.post(
                "/api/notifications/push/subscriptions",
                json={
                    "endpoint": f"https://web.push.apple.com/device-{i}",
                    "p256dh": "k",
                    "auth": "a",
                },
            ).status_code
            == 204
        )
    assert (
        client.post(
            "/api/notifications/push/subscriptions",
            json={"endpoint": "https://web.push.apple.com/overflow", "p256dh": "k", "auth": "a"},
        ).status_code
        == 409
    )
    assert (
        client.post(
            "/api/notifications/push/subscriptions",
            json={
                "endpoint": "https://web.push.apple.com/device-0",
                "p256dh": "new",
                "auth": "new",
            },
        ).status_code
        == 204
    )


def test_test_alerts_are_rate_limited_even_for_admin(client, monkeypatch):
    monkeypatch.setattr("app.main.send_push_notification", lambda *a, **k: True)
    for _ in range(3):
        assert client.post("/api/notifications/push/test").status_code == 204
    assert client.post("/api/notifications/push/test").status_code == 429


def test_scheduling_shares_the_registration_rate_limit(client):
    endpoint = "https://web.push.apple.com/sample-device"
    assert (
        client.post(
            "/api/notifications/push/subscriptions",
            json={"endpoint": endpoint, "p256dh": "k", "auth": "a"},
        ).status_code
        == 204
    )
    # Exhaust the account's remaining change budget without waiting for a minute.
    for _ in range(59):
        assert client.app.state.push_rate_limiter.allow(f"{client.user['id']}:change", 60)
    response = client.put(
        "/api/notifications/push/rest-timer",
        json={"endpoint": endpoint, "timer_id": "sample-timer", "delay_seconds": 30},
    )
    assert response.status_code == 429
