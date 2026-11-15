from __future__ import annotations

from datetime import UTC, datetime, timedelta

from test_active_workouts import PATH, draft, put
from test_workout_save_sessions import payload_for

from app.database import SessionLocal
from app.models import ActiveWorkoutSync, LiveWorkout
from app.notifications import ActiveWorkoutReminderScheduler
from app.workout_auto_save import save_due_workouts

SETTING = "/api/workout-auto-save"


def enable(client, minutes=120):
    response = client.put(SETTING, json={"after_minutes": minutes})
    assert response.status_code == 200, response.text
    return response.json()


def stored(client) -> ActiveWorkoutSync:
    with SessionLocal() as db:
        row = db.get(ActiveWorkoutSync, client.user["id"])
        db.expunge(row)
        return row


def prepared(client, value):
    return {**payload_for(client, value["clientSessionId"]), "name": "Upper body"}


def save_due(client, after=timedelta(hours=4)):
    return save_due_workouts(SessionLocal, client.app.state.settings, now=datetime.now(UTC) + after)


def test_setting_defaults_off_validates_and_is_private(client, other_client):
    assert client.get(SETTING).json() == {"after_minutes": None}
    assert enable(client, 90) == {"after_minutes": 90}
    assert client.get(SETTING).json() == {"after_minutes": 90}
    assert other_client.get(SETTING).json() == {"after_minutes": None}
    for invalid in (15, 100, 721, "soon"):
        assert client.put(SETTING, json={"after_minutes": invalid}).status_code == 422
    assert client.put(SETTING, json={"after_minutes": None}).json() == {"after_minutes": None}
    assert client.get(SETTING).json() == {"after_minutes": None}


def test_prepared_workout_is_kept_only_for_the_exact_revision_it_describes(client):
    value = draft()
    workout = prepared(client, value)
    put(client, value, autoSave=workout)
    assert stored(client).auto_save == workout
    # A later write from an app that does not prepare one (an older release) clears it.
    edited = {**value, "notes": "Phone"}
    put(client, edited, value, 1)
    assert stored(client).auto_save is None
    # Re-sending the same draft attaches it without a new revision.
    assert put(client, edited, value, 2, autoSave=workout)["revision"] == 2
    assert stored(client).auto_save == workout
    # Merged with another device's edit, the copy no longer matches the stored draft.
    other_device = {**edited, "name": "Other device"}
    put(client, other_device, edited, 2)
    merged = put(client, {**edited, "notes": "Phone again"}, edited, 2, autoSave=workout)
    assert merged["draft"]["name"] == "Other device"
    assert stored(client).auto_save is None


def test_malformed_or_foreign_copies_are_ignored_without_blocking_draft_sync(client):
    value = draft()
    put(client, value, autoSave={"name": "Missing everything"})
    assert stored(client).auto_save is None
    edited = {**value, "notes": "Still syncs"}
    other_session = prepared(client, draft())
    assert put(client, edited, value, 1, autoSave=other_session)["draft"] == edited
    assert stored(client).auto_save is None


def test_saves_once_due_through_the_normal_save_and_ends_the_live_workout(client):
    enable(client, 120)
    value = draft()
    put(client, value, autoSave=prepared(client, value))
    with SessionLocal() as db:
        db.add(
            LiveWorkout(
                user_id=client.user["id"],
                device_id="phone",
                name="Upper body",
                kind="strength",
                started_at=datetime.now(UTC) - timedelta(hours=1),
                expires_at=datetime.now(UTC) + timedelta(hours=2),
            )
        )
        db.commit()
    # Started an hour ago and active now: not due until two hours from the start, nor
    # within 30 minutes of the last activity.
    assert save_due(client, timedelta(minutes=20)) == []
    assert save_due(client, timedelta(minutes=50)) == []
    saved = save_due(client, timedelta(minutes=61))
    assert [item.name for item in saved] == ["Upper body"]
    assert client.get(PATH).json() == {"revision": 2, "draft": None}
    workouts = client.get("/api/workouts").json()
    assert len(workouts) == 1
    assert workouts[0]["client_session_id"] == value["clientSessionId"]
    with SessionLocal() as db:
        assert db.get(LiveWorkout, client.user["id"]) is None
    assert save_due(client) == []
    assert len(client.get("/api/workouts").json()) == 1


def test_the_apps_own_cutoff_and_the_setting_both_apply(client):
    value = {**draft(), "inactiveFinishAt": draft()["startedAt"] + 5 * 3600000}
    put(client, value, autoSave=prepared(client, value))
    assert save_due(client) == []  # Auto-save is off.
    enable(client, 60)
    # The app's cutoff is five hours from the start (four from now).
    assert save_due(client, timedelta(hours=3, minutes=50)) == []
    assert len(save_due(client, timedelta(hours=4, minutes=1))) == 1


def test_without_a_prepared_workout_or_after_a_refusal_it_waits_for_the_owner(client):
    enable(client, 60)
    original = payload_for(client)
    saved = client.post("/api/workouts", json=original).json()
    value = {**draft(), "resumingWorkoutId": saved["id"], "resumingWorkoutRevision": 1}
    put(client, value)
    assert save_due(client) == []
    # Another device edits the saved workout, so the prepared replacement is stale.
    resumed = {**original, "notes": "Extra sets", "base_revision": saved["revision"]}
    put(client, value, value, 1, autoSave=resumed)
    edited = client.put(
        f"/api/workouts/{saved['id']}",
        json={**original, "notes": "Edited elsewhere", "base_revision": saved["revision"]},
    )
    assert edited.status_code == 200, edited.text
    assert save_due(client) == []
    assert client.get(PATH).json()["draft"] == value
    assert stored(client).auto_save is None
    assert client.get(f"/api/workouts/{saved['id']}").json()["notes"] == "Edited elsewhere"


def test_resumed_workouts_replace_the_saved_workout(client):
    enable(client, 60)
    original = payload_for(client)
    saved = client.post("/api/workouts", json=original).json()
    value = {**draft(), "resumingWorkoutId": saved["id"], "resumingWorkoutRevision": 1}
    resumed = {**original, "notes": "Extra sets", "base_revision": saved["revision"]}
    put(client, value, autoSave=resumed)
    assert len(save_due(client)) == 1
    assert client.get(PATH).json()["draft"] is None
    assert client.get(f"/api/workouts/{saved['id']}").json()["notes"] == "Extra sets"
    assert len(client.get("/api/workouts").json()) == 1


def test_scheduler_tells_the_owner(client, monkeypatch):
    enable(client, 30)
    value = draft()
    value["lastActiveAt"] = value["startedAt"]
    put(client, value, autoSave=prepared(client, value))
    with SessionLocal() as db:
        row = db.get(ActiveWorkoutSync, client.user["id"])
        row.last_activity_at = datetime.now(UTC) - timedelta(hours=1)
        db.commit()
    deliveries = []
    monkeypatch.setattr(
        "app.notifications.send_push_notification",
        lambda *args, **kwargs: deliveries.append(kwargs) or True,
    )
    ActiveWorkoutReminderScheduler(SessionLocal, client.app.state.settings).deliver_auto_saves()
    assert [(item["title"], item["user_id"]) for item in deliveries] == [
        ("Workout saved", client.user["id"])
    ]
    assert "Upper body" in deliveries[0]["body"]
    assert client.get(PATH).json()["draft"] is None
