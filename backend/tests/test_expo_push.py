"""The native app's Expo push tokens: registration, delivery and the no-duplicate rule.

Expo's push service is always faked; these tests never send a request to it.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from conftest import TEST_PASSWORD
from sqlalchemy import func, select

from app import expo_delivery, notifications
from app.config import Settings
from app.database import SessionLocal
from app.expo_delivery import ExpoAlert, expo_dispatcher
from app.models import ActiveWorkoutSync, ExpoPushToken, PushSubscription, UserSession
from app.push_security import MAX_EXPO_PUSH_TOKENS

TOKENS = "/api/notifications/expo/tokens"
LOCAL_REMINDER = "/api/notifications/expo/tokens/local-reminder"
DRAFT = "/api/active-workout"
PHONE = "ExponentPushToken[alice-phone-0001]"
TABLET = "ExponentPushToken[alice-tablet-0002]"
BOB_PHONE = "ExponentPushToken[bob-phone-00003]"
WEB = "https://web.push.apple.com/alice-browser"
# The real senders, kept before the autouse fixture replaces them.
POST_EXPO = expo_delivery.post_expo
FETCH_RECEIPTS = expo_delivery.fetch_receipts


@pytest.fixture(autouse=True)
def dispatcher(monkeypatch):
    """Native alerts run at once in these tests, and never reach Expo for real."""
    expo_dispatcher.reset()
    monkeypatch.setattr(expo_dispatcher, "inline", True)

    def refuse(*_args, **_kwargs):
        raise AssertionError("A test tried to call Expo's push service for real.")

    monkeypatch.setattr(expo_delivery, "post_expo", refuse)
    monkeypatch.setattr(expo_delivery, "fetch_receipts", refuse)
    yield expo_dispatcher
    expo_dispatcher.reset()


@pytest.fixture
def expo(monkeypatch):
    """Records each message sent to Expo and answers with the tickets queued in ``replies``."""
    calls: list[dict] = []
    replies: dict[str, dict] = {}

    def post(messages, settings):
        calls.extend(messages)
        return [
            replies.get(message["to"], {"status": "ok", "id": f"ticket-{message['to']}"})
            for message in messages
        ]

    monkeypatch.setattr(expo_delivery, "post_expo", post)
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
    assert 1700 < calls[0]["ttl"] <= 1800


def test_a_reminder_retried_for_its_browsers_reaches_the_app_once(client, expo):
    register(client)
    start_workout(client)
    reminders = client.app.state.workout_reminders
    reminders.deliver_inactive()
    reminders.deliver_inactive()  # No browser got it, so it is retried as before.
    calls, _ = expo
    assert to(calls) == [PHONE]
    with SessionLocal() as db:
        assert db.get(ActiveWorkoutSync, client.user["id"]).reminder_delivered is False


def test_a_covered_phone_never_hides_a_failed_browser_alert(client, expo, monkeypatch):
    import pywebpush
    from pywebpush import WebPushException

    attempts: list[str] = []

    def fail_once(subscription_info, **_):
        attempts.append(subscription_info["endpoint"])
        if len(attempts) == 1:
            raise WebPushException("temporarily unavailable")

    monkeypatch.setattr(pywebpush, "webpush", fail_once)
    with SessionLocal() as db:
        db.add(PushSubscription(user_id=client.user["id"], endpoint=WEB, p256dh="k", auth="a"))
        db.commit()
    register(client)
    started = start_workout(client)
    due = server_due_ms(client.user["id"])
    client.put(
        LOCAL_REMINDER,
        json={"token": PHONE, "workout_started_at": str(started), "due_at_ms": due},
    )
    reminders = client.app.state.workout_reminders
    reminders.deliver_inactive()
    with SessionLocal() as db:
        assert db.get(ActiveWorkoutSync, client.user["id"]).reminder_delivered is False
    reminders.deliver_inactive()
    assert attempts == [WEB, WEB]
    calls, _ = expo
    assert calls == []
    with SessionLocal() as db:
        assert db.get(ActiveWorkoutSync, client.user["id"]).reminder_delivered is True


@pytest.mark.parametrize(
    "reported",
    [
        # Started on the web: the phone has no reminder of its own for this workout.
        lambda started, due: None,
        # The phone's own alarm is hours later (such as a wrong clock): not the same alert.
        lambda started, due: {"workout_started_at": str(started), "due_at_ms": due + 4 * 3_600_000},
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

    monkeypatch.setattr(expo_delivery.requests, "post", post)
    monkeypatch.setenv("EXPO_ACCESS_TOKEN", "expo-test-value")
    settings = Settings()
    assert settings.expo_access_token == "expo-test-value"
    tickets = POST_EXPO([{"to": PHONE}], settings)
    assert tickets == [{"status": "ok", "id": "1"}]
    assert seen["url"] == "https://exp.host/--/api/v2/push/send"
    assert seen["headers"]["Authorization"] == "Bearer expo-test-value"
    assert seen["allow_redirects"] is False and seen["timeout"] == (3.05, 10)

    seen.clear()
    monkeypatch.delenv("EXPO_ACCESS_TOKEN")
    POST_EXPO([{"to": PHONE}], Settings())
    assert "Authorization" not in seen["headers"]


def test_a_failed_expo_request_still_lets_browsers_be_alerted(client, monkeypatch, web):
    from requests import ConnectionError as RequestsConnectionError

    def fail(messages, settings):
        raise RequestsConnectionError("offline")

    monkeypatch.setattr(expo_delivery, "post_expo", fail)
    with SessionLocal() as db:
        db.add(PushSubscription(user_id=client.user["id"], endpoint=WEB, p256dh="k", auth="a"))
        db.commit()
    register(client)
    assert client.post("/api/notifications/push/test").status_code == 204
    assert web == [WEB]
    assert [row.token for row in tokens()] == [PHONE]  # A failed request removes nothing.


def test_a_failed_expo_request_is_retried_once(client, monkeypatch, dispatcher):
    from requests import ConnectionError as RequestsConnectionError

    attempts: list[list[dict]] = []

    def flaky(messages, settings):
        attempts.append(messages)
        if len(attempts) == 1:
            raise RequestsConnectionError("offline")
        return [{"status": "ok", "id": "t"}]

    monkeypatch.setattr(expo_delivery, "post_expo", flaky)
    register(client)
    client.post("/api/notifications/push/test")
    assert len(attempts) == 1
    dispatcher.run_later_now()
    assert len(attempts) == 2
    dispatcher.run_later_now()
    assert len(attempts) == 2


def test_a_token_that_moved_mid_request_is_not_pruned_for_its_new_owner(
    client, other_client, monkeypatch
):
    register(client)

    def moved_then_unregistered(messages, settings):
        # Bob signs in on the same phone while Expo answers for Alice.
        register(other_client, PHONE)
        return [{"status": "error", "details": {"error": "DeviceNotRegistered"}}]

    monkeypatch.setattr(expo_delivery, "post_expo", moved_then_unregistered)
    client.post("/api/notifications/push/test")
    [row] = tokens()
    assert row.user_id == other_client.user["id"]


def test_an_ended_sign_in_is_pruned_only_while_the_token_is_still_its_own(client, other_client):
    register(client)
    [row] = tokens()
    stale = expo_delivery.Registration(row.id, row.user_id, row.session_id, row.token, "ios")
    register(other_client, PHONE)
    expo_delivery.prune(SessionLocal, [stale])
    assert [item.user_id for item in tokens()] == [other_client.user["id"]]


def test_receipts_prune_unregistered_tokens_and_surface_credential_errors(
    client, expo, monkeypatch, dispatcher, caplog
):
    register(client)
    register(client, TABLET)
    asked: list[list[str]] = []

    def receipts(ids, settings):
        asked.append(ids)
        return {
            f"ticket-{PHONE}": {"status": "error", "details": {"error": "DeviceNotRegistered"}},
            f"ticket-{TABLET}": {"status": "error", "details": {"error": "InvalidCredentials"}},
        }

    monkeypatch.setattr(expo_delivery, "fetch_receipts", receipts)
    client.post("/api/notifications/push/test")
    assert asked == []  # Receipts are read later, never in the sending path.
    with caplog.at_level("ERROR", logger="app.expo_delivery"):
        dispatcher.run_later_now()
    assert sorted(asked[0]) == sorted([f"ticket-{PHONE}", f"ticket-{TABLET}"])
    assert [row.token for row in tokens()] == [TABLET]
    assert "InvalidCredentials" in caplog.text


def test_a_slow_expo_request_never_delays_browsers_or_other_accounts(monkeypatch, dispatcher):
    import time as clock

    import pywebpush
    from conftest import make_user

    monkeypatch.setattr(dispatcher, "inline", False)
    dispatcher.start()
    web: list[str] = []
    monkeypatch.setattr(
        pywebpush,
        "webpush",
        lambda subscription_info, **_: web.append(subscription_info["endpoint"]),
    )
    sent: list[str] = []

    def slow(messages, settings):
        clock.sleep(1)
        sent.extend(message["to"] for message in messages)
        return [{"status": "ok"} for _ in messages]

    monkeypatch.setattr(expo_delivery, "post_expo", slow)
    users = [make_user(f"slow{index}") for index in range(3)]
    with SessionLocal() as db:
        for index, user_id in enumerate(users):
            session = UserSession(
                user_id=user_id,
                token_hash=f"hash-{index}",
                expires_at=datetime.now(UTC) + timedelta(days=1),
            )
            db.add(session)
            db.flush()
            db.add(
                ExpoPushToken(
                    user_id=user_id,
                    session_id=session.id,
                    token=f"ExponentPushToken[slow-phone-{index}]",
                    local_alerts=[],
                )
            )
            db.add(
                PushSubscription(user_id=user_id, endpoint=f"{WEB}-{index}", p256dh="k", auth="a")
            )
        db.commit()
    settings = Settings()
    started = clock.monotonic()
    results = [
        notifications.send_push_notification(
            SessionLocal, settings, title="Workout saved", body="Saved.", user_id=user_id
        )
        for user_id in users
    ]
    assert clock.monotonic() - started < 0.8
    assert results == [True, True, True]
    assert len(web) == 3
    dispatcher.drain(timeout=10)
    dispatcher.stop()
    assert sorted(sent) == [f"ExponentPushToken[slow-phone-{index}]" for index in range(3)]


def test_the_app_test_alert_reports_this_phones_own_outcome(client, other_client, expo):
    calls, replies = expo
    register(client)
    register(client, TABLET)
    test = f"{TOKENS}/test"
    assert client.post(test, json={"token": PHONE}).status_code == 204
    assert to(calls) == [PHONE]
    assert calls[0]["body"] == "Phone alerts are on for this phone."

    replies[PHONE] = {"status": "error", "details": {"error": "MessageRateExceeded"}}
    response = client.post(test, json={"token": PHONE})
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "push_delivery_failed"

    replies[PHONE] = {"status": "error", "details": {"error": "DeviceNotRegistered"}}
    response = client.post(test, json={"token": PHONE})
    assert response.status_code == 410
    assert [row.token for row in tokens()] == [TABLET]


def test_the_app_test_alert_never_reaches_another_accounts_phone(client, other_client, expo):
    calls, _ = expo
    register(other_client, BOB_PHONE)
    response = client.post(f"{TOKENS}/test", json={"token": BOB_PHONE})
    assert response.status_code == 410
    assert calls == []
    assert [row.token for row in tokens()] == [BOB_PHONE]


def test_the_account_wide_test_alert_keeps_its_answer_for_older_clients(client, expo):
    calls, replies = expo
    register(client)
    replies[PHONE] = {"status": "error", "details": {"error": "MessageRateExceeded"}}
    assert client.post("/api/notifications/push/test").status_code == 204


def test_android_alerts_use_the_apps_channel_and_name_nothing_private(client, expo):
    register(client, platform="android")
    register(client, TABLET, platform="ios")
    notifications.send_push_notification(
        SessionLocal,
        client.app.state.settings,
        title="Workout saved",
        body="Upper body was saved automatically.",
        native_body="Your workout was saved automatically.",
        user_id=client.user["id"],
    )
    calls, _ = expo
    by_token = {message["to"]: message for message in calls}
    assert by_token[PHONE]["channelId"] == "relay-alerts"
    assert "channelId" not in by_token[TABLET]
    assert {message["body"] for message in calls} == {"Your workout was saved automatically."}


def test_video_alerts_name_no_workout_on_the_phone_and_open_videos():
    from app.processing import NATIVE_VIDEO_BODIES

    assert set(NATIVE_VIDEO_BODIES) == {
        "Workout video ready",
        "Workout video needs attention",
        "Relay needs YouTube permission",
    }
    assert all("{" not in body for body in NATIVE_VIDEO_BODIES.values())


def test_an_alert_handed_over_twice_with_the_same_key_reaches_the_app_once(client, expo):
    register(client)
    alert = ExpoAlert(user_id=client.user["id"], title="t", body="b", dedupe_key="same")
    expo_dispatcher.submit(SessionLocal, client.app.state.settings, alert)
    expo_dispatcher.submit(SessionLocal, client.app.state.settings, alert)
    calls, _ = expo
    assert to(calls) == [PHONE]


def test_a_phone_gets_still_working_out_once_per_idle_spell_even_after_a_restart(
    client, expo, dispatcher, monkeypatch
):
    register(client, local_alerts=[])  # No reminder of its own: the server's is its only one.
    start_workout(client, idle_minutes=50)
    due = server_due_ms(client.user["id"])
    monkeypatch.setattr(expo_delivery, "now_ms", lambda: due + 10 * 60_000)
    reminders = client.app.state.workout_reminders
    reminders.deliver_inactive()
    calls, _ = expo
    assert to(calls) == [PHONE]
    # Expo's TTL counts from when it was due: 20 of the 30 minutes are left.
    assert calls[0]["ttl"] == 20 * 60
    # No browser got it, so it is retried; a restart (or an hour) has emptied the short-term
    # memory of what was sent.
    dispatcher.reset()
    reminders.deliver_inactive()
    assert to(calls) == [PHONE]
    [row] = tokens()
    assert row.native_reminder_due_ms == due


def test_a_still_working_out_too_late_to_help_is_not_sent(client, expo, monkeypatch):
    register(client, local_alerts=[])
    start_workout(client, idle_minutes=50)
    due = server_due_ms(client.user["id"])
    monkeypatch.setattr(expo_delivery, "now_ms", lambda: due + 31 * 60_000)
    client.app.state.workout_reminders.deliver_inactive()
    calls, _ = expo
    assert calls == []


def test_a_new_idle_spell_reaches_the_phone_again(client, expo, dispatcher):
    register(client, local_alerts=[])
    start_workout(client, idle_minutes=50)
    with SessionLocal() as db:
        db.query(ExpoPushToken).update({"native_reminder_due_ms": 1})
        db.commit()
    client.app.state.workout_reminders.deliver_inactive()
    calls, _ = expo
    assert to(calls) == [PHONE]


def test_the_dispatcher_takes_no_work_once_stopped_and_drops_what_was_queued(caplog):
    import threading
    import time as clock

    worker = expo_delivery.ExpoPushDispatcher(workers=1, max_queued=2)
    worker.start()
    blocked, ran = threading.Event(), []
    worker._admit(blocked.wait, (5,))
    for index in range(4):
        worker._admit(ran.append, (index,))
    assert "queue is full" in caplog.text  # Admission is bounded: two waited, two were dropped.
    started = clock.monotonic()
    worker.stop(timeout=0.3)
    assert clock.monotonic() - started < 1  # Doesn't wait for the blocked request.
    worker._admit(ran.append, ("after",))
    worker._later(0, ran.append, "later")
    blocked.set()
    clock.sleep(0.2)
    assert ran == []
    assert not worker.running


def test_delayed_work_runs_from_one_scheduler_thread():
    import threading

    worker = expo_delivery.ExpoPushDispatcher(workers=1)
    worker.start()
    try:
        done = threading.Event()
        seen: list[int] = []
        for index in range(20):
            worker._later(0.05, seen.append, index)
        worker._later(0.1, done.set)
        assert done.wait(2)
        assert sorted(seen) == list(range(20))
        names = [thread.name for thread in threading.enumerate()]
        assert names.count("expo-push-later") == 1
    finally:
        worker.stop()


def test_the_dispatcher_follows_every_app_lifespan_using_it():
    worker = expo_delivery.ExpoPushDispatcher(workers=1)
    worker.start()
    worker.start()
    worker.stop()
    assert worker.running
    worker.stop()
    assert not worker.running
