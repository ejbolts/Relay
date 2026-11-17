from datetime import UTC, date, datetime, timedelta

from conftest import make_user

from app.config import get_settings
from app.database import SessionLocal
from app.models import (
    ActiveWorkoutReminder,
    CardioSession,
    PushSubscription,
    TrainingWorkout,
    WorkoutCategory,
)
from app.notifications import ActiveWorkoutReminderScheduler


def test_reminder_survives_restart_and_delivers_only_once(monkeypatch):
    endpoint = "https://web.push.apple.com/phone"
    user_id = make_user()
    with SessionLocal() as db:
        db.add(PushSubscription(user_id=user_id, endpoint=endpoint, p256dh="key", auth="auth"))
        db.commit()
    scheduler = ActiveWorkoutReminderScheduler(SessionLocal, get_settings())
    started = datetime.now(UTC).timestamp()
    scheduler.schedule(endpoint=endpoint, timer_id="one", started_at=started, user_id=user_id)
    calls = []
    monkeypatch.setattr(
        "app.notifications.send_push_notification", lambda *a, **kw: calls.append(kw) or True
    )
    scheduler.deliver_due()
    assert not calls
    with SessionLocal() as db:
        reminder = db.get(ActiveWorkoutReminder, endpoint)
        assert reminder.due_at.replace(tzinfo=UTC) == datetime.fromtimestamp(
            started, UTC
        ) + timedelta(hours=2)
        reminder.due_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    restarted = ActiveWorkoutReminderScheduler(SessionLocal, get_settings())
    restarted.schedule(endpoint=endpoint, timer_id="one", started_at=started, user_id=user_id)
    restarted.deliver_due()
    restarted.deliver_due()
    assert len(calls) == 1
    assert calls[0]["endpoint"] == endpoint
    assert calls[0]["user_id"] == user_id
    assert calls[0]["url"] == "/#log"


def test_cancel_and_old_cancel_do_not_interfere_with_new_workout(monkeypatch):
    endpoint = "https://web.push.apple.com/phone"
    user_id = make_user()
    with SessionLocal() as db:
        db.add(PushSubscription(user_id=user_id, endpoint=endpoint, p256dh="key", auth="auth"))
        db.commit()
    scheduler = ActiveWorkoutReminderScheduler(SessionLocal, get_settings())
    started = (datetime.now(UTC) - timedelta(hours=3)).timestamp()
    calls = []
    monkeypatch.setattr(
        "app.notifications.send_push_notification", lambda *a, **kw: calls.append(kw) or True
    )
    scheduler.schedule(endpoint=endpoint, timer_id="one", started_at=started, user_id=user_id)
    scheduler.cancel(endpoint=endpoint, timer_id="one")
    scheduler.schedule(endpoint=endpoint, timer_id="one", started_at=started, user_id=user_id)
    scheduler.deliver_due()
    assert not calls
    scheduler.schedule(endpoint=endpoint, timer_id="two", started_at=started, user_id=user_id)
    scheduler.cancel(endpoint=endpoint, timer_id="one")
    monkeypatch.setattr("app.notifications.send_push_notification", lambda *a, **kw: False)
    scheduler.deliver_due()
    with SessionLocal() as db:
        assert not db.get(ActiveWorkoutReminder, endpoint).delivered
    monkeypatch.setattr(
        "app.notifications.send_push_notification", lambda *a, **kw: calls.append(kw) or True
    )
    scheduler.deliver_due()
    assert len(calls) == 1


def test_reminder_api_requires_subscription_and_cancels(client):
    payload = {
        "endpoint": "https://web.push.apple.com/phone",
        "timer_id": "one",
        "started_at": datetime.now(UTC).timestamp(),
    }
    assert client.put("/api/notifications/push/active-workout", json=payload).status_code == 404
    client.post(
        "/api/notifications/push/subscriptions",
        json={"endpoint": payload["endpoint"], "p256dh": "key", "auth": "auth"},
    )
    assert client.put("/api/notifications/push/active-workout", json=payload).status_code == 204
    assert (
        client.post("/api/notifications/push/active-workout/cancel", json=payload).status_code
        == 204
    )
    with SessionLocal() as db:
        assert db.get(ActiveWorkoutReminder, payload["endpoint"]).cancelled


def test_sunday_week_is_shared_and_future_cardio_is_excluded(client, monkeypatch):
    class Today(date):
        @classmethod
        def today(cls):
            return cls(2026, 9, 9)

    client.put(
        "/api/training-preferences",
        json={"preferred_weight_unit": "kg", "week_start": "sunday", "zone2_goal_minutes": 150},
    )
    monkeypatch.setattr("app.tracker.date", Today)
    user_id = client.user["id"]
    with SessionLocal() as db:
        for day, minutes, zone2 in [(5, 90, True), (6, 40, True), (9, 71, False), (10, 80, True)]:
            db.add(
                CardioSession(
                    user_id=user_id,
                    session_date=date(2026, 9, day),
                    activity_type="Walking",
                    duration_minutes=minutes,
                    qualifies_zone2=zone2,
                )
            )
            db.add(
                TrainingWorkout(
                    user_id=user_id,
                    name="Push",
                    workout_date=date(2026, 9, day),
                    category=WorkoutCategory.PUSH,
                )
            )
        db.commit()
    dashboard = client.get("/api/dashboard").json()
    cardio = client.get("/api/cardio").json()
    assert dashboard["cardio_minutes_this_week"] == 111
    assert dashboard["workouts_this_week"] == 2
    assert dashboard["weekly_sets"]["week_start"] == "2026-09-06"
    assert dashboard["zone2"] == cardio["current_week"]
    assert cardio["current_week"]["completed_minutes"] == 40
    assert cardio["current_week"]["week_end"] == "2026-09-12"
    assert cardio["previous_weeks"][0]["completed_minutes"] == 90
