"""The native app's Expo push tokens: registration, delivery and the no-duplicate rule.

Expo's push service is always faked; these tests never send a request to it.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from conftest import TEST_PASSWORD
from sqlalchemy import func, select

from app import notifications
from app.config import Settings
from app.database import SessionLocal
from app.models import ActiveWorkoutSync, ExpoPushToken, PushSubscription, UserSession
from app.push_security import MAX_EXPO_PUSH_TOKENS

TOKENS = "/api/notifications/expo/tokens"
LOCAL_REMINDER = "/api/notifications/expo/tokens/local-reminder"
DRAFT = "/api/active-workout"
PHONE = "ExponentPushToken[alice-phone-0001]"
TABLET = "ExponentPushToken[alice-tablet-0002]"
BOB_PHONE = "ExponentPushToken[bob-phone-00003]"
WEB = "https://web.push.apple.com/alice-browser"


@pytest.fixture
def expo(monkeypatch):
    """Records each message sent to Expo and answers with the tickets queued in ``replies``."""
    calls: list[dict] = []
    replies: dict[str, dict] = {}

    def post(messages, settings):
        calls.extend(messages)
        return [
            replies.get(message["to"], {"status": "ok", "id": "ticket"}) for message in messages
        ]

    monkeypatch.setattr(notifications, "_post_expo", post)
    return calls, replies


@pytest.fixture
def web(monkeypatch):
    import pywebpush

    endpoints: list[str] = []
    monkeypatch.setattr(
        pywebpush,
        "webpush",
        lambda subscription_info, **_: endpoints.append(subscription_info["endpoint"]),
    )
    return endpoints


def register(test_client, token: str = PHONE, **extra) -> None:
    body = {"token": token, "platform": "ios", "local_alerts": ["inactive-workout"], **extra}
    response = test_client.post(TOKENS, json=body)
    assert response.status_code == 204, response.text


def tokens() -> list[ExpoPushToken]:
    with SessionLocal() as db:
        return list(db.scalars(select(ExpoPushToken).order_by(ExpoPushToken.token)))


def to(calls) -> list[str]:
    return sorted(message["to"] for message in calls)


def start_workout(test_client, *, idle_minutes: int = 46) -> int:
    """A shared draft whose last activity was ``idle_minutes`` ago; returns its startedAt."""
    now = int(datetime.now(UTC).timestamp() * 1000)
    started = now - 3_600_000
    draft = {
        "version": 1,
        "clientSessionId": str(uuid4()),
        "startedAt": started,
        "lastActiveAt": now - idle_minutes * 60_000,
        "updatedAt": now,
        "name": "Upper body",
        "workoutDate": "2026-11-15",
        "category": "upper",
        "notes": "",
        "movements": [],
    }
    response = test_client.put(DRAFT, json={"draft": draft, "base": None, "revision": 0})
    assert response.status_code == 200, response.text
    return started


def server_due_ms(user_id: str) -> int:
    with SessionLocal() as db:
        row = db.get(ActiveWorkoutSync, user_id)
        activity = row.last_activity_at
        activity = activity if activity.tzinfo else activity.replace(tzinfo=UTC)
        return int((activity + timedelta(minutes=45)).timestamp() * 1000)


def test_registering_is_per_account_deduplicated_and_bound_to_the_sign_in(client, other_client):
    register(client)
    register(client)  # Registering again only refreshes it.
    register(client, TABLET, platform="android", local_alerts=["rest-timer", "inactive-workout"])
    register(other_client, BOB_PHONE)

    rows = tokens()
    assert [row.token for row in rows] == sorted([PHONE, TABLET, BOB_PHONE])
    with SessionLocal() as db:
        alice_session = db.scalar(
            select(UserSession.id).where(UserSession.user_id == client.user["id"])
        )
    phone = next(row for row in rows if row.token == PHONE)
    tablet = next(row for row in rows if row.token == TABLET)
    assert phone.user_id == client.user["id"] and phone.session_id == alice_session
    assert tablet.platform == "android"
    assert tablet.local_alerts == ["inactive-workout", "rest-timer"]


def test_invalid_tokens_and_unknown_platforms_are_refused(client):
    for body in (
        {"token": "https://evil.example/push"},
        {"token": "ExponentPushToken[]"},
        {"token": "ExponentPushToken[ok-token-1234] "},
        {"token": PHONE, "platform": "web"},
    ):
        assert client.post(TOKENS, json=body).status_code == 422, body
    assert tokens() == []


def test_an_account_has_a_device_limit_but_ended_sign_ins_do_not_count(client):
    for index in range(MAX_EXPO_PUSH_TOKENS):
        register(client, f"ExponentPushToken[device-{index:04d}-abc]")
    response = client.post(TOKENS, json={"token": "ExponentPushToken[one-too-many-1]"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "push_device_limit"
    register(client, "ExponentPushToken[device-0000-abc]")  # An existing one still refreshes.

    with SessionLocal() as db:
        for row in db.scalars(select(ExpoPushToken)):
            row.session_id = "ended-sign-in"
        db.commit()
    register(client, "ExponentPushToken[after-ended-001]")
    assert [row.token for row in tokens()] == ["ExponentPushToken[after-ended-001]"]


def test_another_account_cannot_remove_or_change_someone_elses_token(client, other_client):
    register(client)
    other_client.request("DELETE", TOKENS, json={"token": PHONE})
    response = other_client.put(
        LOCAL_REMINDER, json={"token": PHONE, "workout_started_at": "1", "due_at_ms": 1}
    )
    assert response.status_code == 404
    [row] = tokens()
    assert row.user_id == client.user["id"] and row.local_reminder_workout is None

    client.request("DELETE", TOKENS, json={"token": PHONE})
    assert tokens() == []


def test_a_phone_signed_in_to_another_account_moves_and_forgets_the_last_reminder(
    client, other_client, expo
):
    register(client)
    client.put(LOCAL_REMINDER, json={"token": PHONE, "workout_started_at": "5", "due_at_ms": 9})
    register(other_client, PHONE)
    [row] = tokens()
    assert row.user_id == other_client.user["id"]
    assert (row.local_reminder_workout, row.local_reminder_due_ms) == (None, None)

    calls, _ = expo
    client.post("/api/notifications/push/test")
    assert calls == []
    other_client.post("/api/notifications/push/test")
    assert to(calls) == [PHONE]


def test_alerts_reach_every_current_device_of_the_account_only(client, other_client, expo, web):
    with SessionLocal() as db:
        db.add(PushSubscription(user_id=client.user["id"], endpoint=WEB, p256dh="k", auth="a"))
        db.commit()
    register(client)
    register(client, TABLET)
    register(other_client, BOB_PHONE)
    calls, _ = expo

    assert client.post("/api/notifications/push/test").status_code == 204
    assert to(calls) == [PHONE, TABLET]
    assert web == [WEB]
    message = calls[0]
    assert message["title"] == "Relay alerts are ready"
    assert message["data"] == {"url": "/", "tag": None}
    assert message["sound"] == "default" and message["priority"] == "high"


def test_a_rest_timer_for_one_browser_never_reaches_the_app(client, expo, web):
    register(client)
    calls, _ = expo
    notifications.send_push_notification(
        SessionLocal,
        client.app.state.settings,
        title="Rest complete",
        body="Time for your next set.",
        user_id=client.user["id"],
        endpoint=WEB,
        url="/#log",
        tag="rest-timer",
    )
    assert calls == []


def test_tokens_expo_reports_unregistered_are_removed(client, expo):
    register(client)
    register(client, TABLET)
    calls, replies = expo
    replies[TABLET] = {
        "status": "error",
        "message": "not registered",
        "details": {"error": "DeviceNotRegistered"},
    }
    replies[PHONE] = {
        "status": "error",
        "message": "rate",
        "details": {"error": "MessageRateExceeded"},
    }
    client.post("/api/notifications/push/test")
    assert [row.token for row in tokens()] == [PHONE]


def test_signing_out_of_the_app_removes_its_token_even_when_the_app_could_not(client, expo):
    register(client)
    assert client.post("/api/auth/logout-session").status_code == 204
    assert tokens() == []


def test_a_token_whose_sign_in_ended_elsewhere_is_never_alerted_and_is_pruned(client, expo):
    register(client)
    with SessionLocal() as db:
        # Signed out everywhere or a password change on another device ends this sign-in.
        db.query(UserSession).delete()
        db.commit()
    notifications.send_push_notification(
        SessionLocal,
        client.app.state.settings,
        title="Workout saved",
        body="Upper body was saved automatically.",
        user_id=client.user["id"],
    )
    calls, _ = expo
    assert calls == []
    assert tokens() == []


def test_signing_out_everywhere_and_deleting_the_account_remove_tokens(client, other_client):
    register(client)
    register(other_client, BOB_PHONE)
    assert client.post("/api/auth/logout").status_code == 204
    assert [row.token for row in tokens()] == [BOB_PHONE]

    response = other_client.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD})
    assert response.status_code == 204, response.text
    with SessionLocal() as db:
        assert db.scalar(select(func.count(ExpoPushToken.id))) == 0


def test_still_working_out_skips_a_phone_that_scheduled_it_itself(client, expo, web):
    register(client)  # The phone running the workout schedules the reminder itself.
    register(client, TABLET, local_alerts=[])  # An older app, or one that schedules nothing.
    with SessionLocal() as db:
        db.add(PushSubscription(user_id=client.user["id"], endpoint=WEB, p256dh="k", auth="a"))
        db.commit()
    started = start_workout(client)
    due = server_due_ms(client.user["id"])
    response = client.put(
        LOCAL_REMINDER,
        json={"token": PHONE, "workout_started_at": str(started), "due_at_ms": due},
    )
    assert response.status_code == 204

    client.app.state.workout_reminders.deliver_inactive()
    calls, _ = expo
    assert to(calls) == [TABLET]
    assert web == [WEB]
    assert calls[0]["data"] == {
        "url": "/#log",
        "tag": "inactive-workout",
        "kind": "workout",
        "startedAt": started,
    }
    assert calls[0]["ttl"] == 1800


def test_a_covered_phone_alone_counts_as_alerted_so_the_reminder_is_not_retried(client, expo):
    register(client)
    started = start_workout(client)
    due = server_due_ms(client.user["id"])
    client.put(
        LOCAL_REMINDER, json={"token": PHONE, "workout_started_at": str(started), "due_at_ms": due}
    )
    reminders = client.app.state.workout_reminders
    reminders.deliver_inactive()
    reminders.deliver_inactive()
    calls, _ = expo
    assert calls == []
    with SessionLocal() as db:
        assert db.get(ActiveWorkoutSync, client.user["id"]).reminder_delivered is True


@pytest.mark.parametrize(
    "reported",
    [
        # Started on the web: the phone has no reminder of its own for this workout.
        lambda started, due: None,
        # The phone's reminder is for another workout.
        lambda started, due: {"workout_started_at": str(started - 1), "due_at_ms": due},
        # The phone missed later activity, so its own reminder was for an earlier idle spell.
        lambda started, due: {"workout_started_at": str(started), "due_at_ms": due - 10 * 60_000},
        # The phone cancelled its reminder.
        lambda started, due: {"workout_started_at": None, "due_at_ms": None},
    ],
)
def test_still_working_out_reaches_the_phone_when_its_own_reminder_does_not_cover_it(
    client, expo, reported
):
    register(client)
    started = start_workout(client)
    report = reported(started, server_due_ms(client.user["id"]))
    if report is not None:
        assert client.put(LOCAL_REMINDER, json={"token": PHONE, **report}).status_code == 204
    client.app.state.workout_reminders.deliver_inactive()
    calls, _ = expo
    assert to(calls) == [PHONE]


def test_an_older_app_without_local_reminders_gets_the_push(client, expo):
    register(client, local_alerts=[])
    started = start_workout(client)
    due = server_due_ms(client.user["id"])
    client.put(
        LOCAL_REMINDER, json={"token": PHONE, "workout_started_at": str(started), "due_at_ms": due}
    )
    client.app.state.workout_reminders.deliver_inactive()
    calls, _ = expo
    assert to(calls) == [PHONE]


def test_expo_requests_carry_the_optional_access_token_and_never_follow_redirects(monkeypatch):
    seen: dict = {}

    class Reply:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"status": "ok", "id": "1"}]}

    def post(url, **kwargs):
        seen.update(url=url, **kwargs)
        return Reply()

    monkeypatch.setattr(notifications.requests, "post", post)
    monkeypatch.setenv("EXPO_ACCESS_TOKEN", "expo-test-value")
    settings = Settings()
    assert settings.expo_access_token == "expo-test-value"
    tickets = notifications._post_expo([{"to": PHONE}], settings)
    assert tickets == [{"status": "ok", "id": "1"}]
    assert seen["url"] == "https://exp.host/--/api/v2/push/send"
    assert seen["headers"]["Authorization"] == "Bearer expo-test-value"
    assert seen["allow_redirects"] is False and seen["timeout"] == 10

    seen.clear()
    monkeypatch.delenv("EXPO_ACCESS_TOKEN")
    notifications._post_expo([{"to": PHONE}], Settings())
    assert "Authorization" not in seen["headers"]


def test_a_failed_expo_request_still_lets_browsers_be_alerted(client, monkeypatch, web):
    from requests import ConnectionError as RequestsConnectionError

    def fail(messages, settings):
        raise RequestsConnectionError("offline")

    monkeypatch.setattr(notifications, "_post_expo", fail)
    with SessionLocal() as db:
        db.add(PushSubscription(user_id=client.user["id"], endpoint=WEB, p256dh="k", auth="a"))
        db.commit()
    register(client)
    assert client.post("/api/notifications/push/test").status_code == 204
    assert web == [WEB]
    assert [row.token for row in tokens()] == [PHONE]  # A failed request removes nothing.
