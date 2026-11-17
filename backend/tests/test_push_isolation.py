"""Every push alert must reach only the devices of the account it belongs to.

These tests drive the real API and schedulers; only the outbound Web Push request is faked.
"""

from __future__ import annotations

import asyncio
import json
import time
from datetime import UTC, datetime, timedelta

import pytest
from conftest import make_user
from sqlalchemy import select

from app.config import get_settings
from app.database import SessionLocal
from app.models import ActiveWorkoutReminder, PushSubscription
from app.notifications import ActiveWorkoutReminderScheduler, RestTimerNotificationScheduler

ALICE_PHONE = "https://web.push.apple.com/alice-phone"
ALICE_TABLET = "https://web.push.apple.com/alice-tablet"
BOB_PHONE = "https://web.push.apple.com/bob-phone"
SHARED_PHONE = "https://web.push.apple.com/shared-phone"


@pytest.fixture
def sent(monkeypatch):
    """Records (endpoint, title) for each push the server tries to deliver."""
    import pywebpush

    deliveries: list[tuple[str, str]] = []
    monkeypatch.setattr(
        pywebpush,
        "webpush",
        lambda subscription_info, data, **_: deliveries.append(
            (subscription_info["endpoint"], json.loads(data)["title"])
        ),
    )
    return deliveries


def subscribe(test_client, endpoint: str) -> None:
    response = test_client.post(
        "/api/notifications/push/subscriptions",
        json={"endpoint": endpoint, "p256dh": "k", "auth": "a"},
    )
    assert response.status_code == 204, response.text


def wait_for(condition, timeout: float = 5) -> None:
    deadline = time.monotonic() + timeout
    while not condition() and time.monotonic() < deadline:
        time.sleep(0.05)


def make_reminders_due() -> None:
    with SessionLocal() as db:
        for reminder in db.scalars(select(ActiveWorkoutReminder)):
            reminder.due_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()


def test_every_alert_type_reaches_only_its_owners_devices(client, other_client, sent):
    subscribe(client, ALICE_PHONE)
    subscribe(client, ALICE_TABLET)
    subscribe(other_client, BOB_PHONE)

    # Test alert: all of the caller's devices, nobody else's.
    assert client.post("/api/notifications/push/test").status_code == 204
    assert sorted(endpoint for endpoint, _ in sent) == [ALICE_PHONE, ALICE_TABLET]
    sent.clear()
    assert other_client.post("/api/notifications/push/test").status_code == 204
    assert [endpoint for endpoint, _ in sent] == [BOB_PHONE]
    sent.clear()

    # Rest timer: only the one device that started it.
    timer = {"endpoint": ALICE_PHONE, "timer_id": "rest-1", "delay_seconds": 1}
    assert client.put("/api/notifications/push/rest-timer", json=timer).status_code == 204
    wait_for(lambda: sent)
    time.sleep(0.2)
    assert sent == [(ALICE_PHONE, "Rest complete")]
    sent.clear()

    # Two-hour active workout reminder: only the one device that started it.
    reminder = {
        "endpoint": BOB_PHONE,
        "timer_id": "workout-1",
        "started_at": datetime.now(UTC).timestamp(),
    }
    response = other_client.put("/api/notifications/push/active-workout", json=reminder)
    assert response.status_code == 204
    make_reminders_due()
    other_client.app.state.workout_reminders.deliver_due()
    assert sent == [(BOB_PHONE, "Workout still active")]


def test_handing_a_device_to_another_account_drops_the_previous_accounts_pending_alerts(
    client, other_client, sent
):
    subscribe(client, SHARED_PHONE)
    timer = {"endpoint": SHARED_PHONE, "timer_id": "alice-rest", "delay_seconds": 1}
    assert client.put("/api/notifications/push/rest-timer", json=timer).status_code == 204
    reminder = {
        "endpoint": SHARED_PHONE,
        "timer_id": "alice-workout",
        "started_at": datetime.now(UTC).timestamp(),
    }
    assert client.put("/api/notifications/push/active-workout", json=reminder).status_code == 204

    # Bob signs in on the same phone and enables alerts before Alice's timers fire.
    subscribe(other_client, SHARED_PHONE)
    time.sleep(1.5)
    make_reminders_due()
    client.app.state.workout_reminders.deliver_due()
    assert sent == []

    # Alice's account-wide alerts no longer reach the phone; Bob's do.
    client.post("/api/notifications/push/test")
    assert sent == []
    other_client.post("/api/notifications/push/test")
    assert [endpoint for endpoint, _ in sent] == [SHARED_PHONE]


def test_another_account_cannot_redirect_cancel_or_remove_someone_elses_alerts(
    client, other_client, sent
):
    subscribe(client, ALICE_PHONE)
    subscribe(other_client, BOB_PHONE)
    timer = {"endpoint": ALICE_PHONE, "timer_id": "alice-rest", "delay_seconds": 1}
    assert client.put("/api/notifications/push/rest-timer", json=timer).status_code == 204

    # Bob knows Alice's endpoint but cannot schedule on it, cancel her timer or unsubscribe her.
    assert other_client.put("/api/notifications/push/rest-timer", json=timer).status_code == 404
    other_client.post(
        "/api/notifications/push/rest-timer/cancel",
        json={"endpoint": ALICE_PHONE, "timer_id": "alice-rest"},
    )
    other_client.request(
        "DELETE", "/api/notifications/push/subscriptions", json={"endpoint": ALICE_PHONE}
    )

    wait_for(lambda: sent)
    time.sleep(0.2)
    assert sent == [(ALICE_PHONE, "Rest complete")]
    with SessionLocal() as db:
        owner = db.scalar(
            select(PushSubscription.user_id).where(PushSubscription.endpoint == ALICE_PHONE)
        )
    assert owner == client.user["id"]


def test_delivery_rechecks_ownership_even_if_a_pending_alert_was_not_cancelled(sent):
    """Defence in depth: a timer that escaped cancellation still cannot reach the new owner."""
    alice, bob = make_user("alice"), make_user("bob")
    with SessionLocal() as db:
        db.add(PushSubscription(user_id=alice, endpoint=SHARED_PHONE, p256dh="k", auth="a"))
        db.commit()
    settings = get_settings()
    reminders = ActiveWorkoutReminderScheduler(SessionLocal, settings)
    reminders.schedule(
        endpoint=SHARED_PHONE,
        timer_id="alice-workout",
        started_at=(datetime.now(UTC) - timedelta(hours=3)).timestamp(),
        user_id=alice,
    )
    with SessionLocal() as db:
        db.scalar(select(PushSubscription)).user_id = bob
        db.commit()

    async def fire_rest_timer() -> None:
        timers = RestTimerNotificationScheduler(SessionLocal, settings)
        timers.schedule(
            endpoint=SHARED_PHONE, timer_id="alice-rest", delay_seconds=0, user_id=alice
        )
        await asyncio.gather(*(task for _, task in timers._tasks.values()))

    asyncio.run(fire_rest_timer())
    reminders.deliver_due()

    assert sent == []
    with SessionLocal() as db:
        assert db.get(ActiveWorkoutReminder, SHARED_PHONE).cancelled is True
