from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from test_workout_save_sessions import payload_for

from app.active_workouts import MergeConflict, merge
from app.auth import as_utc
from app.database import SessionLocal
from app.models import ActiveWorkoutSync, PushSubscription
from app.notifications import ActiveWorkoutReminderScheduler

PATH = "/api/active-workout"


def draft():
    now = int(datetime.now(UTC).timestamp() * 1000)
    return {
        "version": 1,
        "clientSessionId": str(uuid4()),
        "startedAt": now - 3600000,
        "lastActiveAt": now,
        "updatedAt": now,
        "name": "Upper body",
        "workoutDate": "2026-11-15",
        "category": "upper",
        "notes": "",
        "movements": [
            {
                "key": "bench",
                "exerciseId": "bench",
                "notes": "",
                "machinePhotoIds": [],
                "supersetKey": None,
                "sets": [{"key": "set-1", "reps": 8, "weight_kg": 60, "completed": True}],
            }
        ],
    }


def put(client, value, base=None, revision=0, **extra):
    result = client.put(PATH, json={"draft": value, "base": base, "revision": revision, **extra})
    assert result.status_code == 200, result.text
    return result.json()


def test_shared_draft_is_private_and_can_be_read_on_another_device(client, other_client):
    value = draft()
    with client.websocket_connect("/api/presence/ws") as socket:
        saved = put(client, value)
        assert socket.receive_json() == {"type": "active_workout"}
    assert saved == {"revision": 1, "draft": value, "conflict": False}
    assert client.get(PATH).json()["draft"] == value
    assert other_client.get(PATH).json() == {"revision": 0, "draft": None}
    put(other_client, {**draft(), "notes": "Other account"})
    assert client.get(PATH).json()["draft"] == value


def test_simultaneous_fields_and_sets_merge_without_losing_either_device(client):
    base = draft()
    put(client, base)
    desktop, phone = deepcopy(base), deepcopy(base)
    desktop["notes"] = "From desktop"
    desktop["movements"][0]["sets"][0]["weight_kg"] = 65
    phone["movements"][0]["sets"][0]["reps"] = 10
    phone["movements"][0]["sets"].append({"key": "phone-set", "reps": 6, "completed": False})
    put(client, desktop, base, 1)
    result = put(client, phone, base, 1)
    assert not result["conflict"]
    assert result["draft"]["notes"] == "From desktop"
    assert result["draft"]["movements"][0]["sets"][0] == {
        "key": "set-1",
        "reps": 10,
        "weight_kg": 65,
        "completed": True,
    }
    assert len(result["draft"]["movements"][0]["sets"]) == 2


def test_concurrent_requests_merge_independent_edits(client):
    base = draft()
    put(client, base)
    desktop = {**base, "notes": "Desktop"}
    phone = deepcopy(base)
    phone["movements"][0]["sets"][0]["reps"] = 10
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(put, client, value, base, 1) for value in (desktop, phone)]
        assert all(not result.result()["conflict"] for result in futures)
    final = client.get(PATH).json()["draft"]
    assert final["notes"] == "Desktop"
    assert final["movements"][0]["sets"][0]["reps"] == 10


def test_conflict_retains_server_and_accepts_only_an_explicit_current_resolution(client):
    base = draft()
    put(client, base)
    desktop, phone = {**base, "notes": "Desktop"}, {**base, "notes": "Phone"}
    put(client, desktop, base, 1)
    conflict = put(client, phone, base, 1)
    assert conflict["conflict"]
    assert conflict["draft"] == desktop
    resolved = put(client, phone, desktop, 2, replace=True)
    assert not resolved["conflict"]
    assert resolved["draft"] == phone
    # An outdated conflict dialog cannot overwrite newer work from the other device.
    newer = {**phone, "notes": "New work"}
    put(client, newer, phone, 3)
    assert put(client, desktop, phone, 3, replace=True)["conflict"]


def test_discard_and_new_session_refuse_stale_devices(client):
    base = draft()
    put(client, base)
    assert not put(client, None, base, 1)["conflict"]
    assert put(client, {**base, "notes": "Offline"}, base, 1)["conflict"]
    assert put(client, base, None, 2)["conflict"]
    fresh = draft()
    assert not put(client, fresh, None, 2)["conflict"]
    assert put(client, None, base, 1)["conflict"]
    assert client.get(PATH).json()["draft"] == fresh


def test_reordering_additions_and_delete_vs_edit():
    base = draft()
    local, remote = deepcopy(base), deepcopy(base)
    local["movements"][0]["sets"].append({"key": "left", "reps": 5})
    remote["movements"][0]["sets"].append({"key": "right", "reps": 6})
    assert {item["key"] for item in merge(base, local, remote)["movements"][0]["sets"]} == {
        "set-1",
        "left",
        "right",
    }
    local["movements"][0]["sets"] = []
    remote["movements"][0]["sets"][0]["reps"] = 12
    with pytest.raises(MergeConflict):
        merge(base, local, remote)


def test_validation_bounds_and_duplicate_keys_do_not_replace_valid_work(client):
    base = draft()
    put(client, base)
    invalid = deepcopy(base)
    invalid["movements"][0]["sets"] *= 2
    assert client.put(PATH, json={"revision": 1, "base": base, "draft": invalid}).status_code == 422
    invalid = {**base, "notes": "x" * 10001}
    assert client.put(PATH, json={"revision": 1, "base": base, "draft": invalid}).status_code == 422
    assert client.get(PATH).json()["draft"] == base


def test_finishing_consumes_revision_atomically_and_keeps_idempotent_retries(client):
    value = draft()
    put(client, value)
    payload = {**payload_for(client, value["clientSessionId"]), "active_workout_revision": 1}
    first = client.post("/api/workouts", json=payload)
    assert first.status_code == 201, first.text
    assert client.get(PATH).json() == {"revision": 2, "draft": None}
    retry = client.post("/api/workouts", json=payload)
    assert retry.status_code == 201, retry.text
    assert retry.json()["id"] == first.json()["id"]
    different = deepcopy(payload)
    different["movements"][0]["sets"][0]["reps"] += 1
    refused = client.post("/api/workouts", json=different)
    assert refused.status_code == 409, refused.text
    assert len(client.get("/api/workouts").json()) == 1


def test_a_remote_edit_after_finish_confirmation_refuses_the_stale_save(client):
    value = draft()
    put(client, value)
    put(client, {**value, "notes": "New phone note"}, value, 1)
    payload = {**payload_for(client, value["clientSessionId"]), "active_workout_revision": 1}
    refused = client.post("/api/workouts", json=payload)
    assert refused.status_code == 409, refused.text
    assert client.get("/api/workouts").json() == []
    assert client.get(PATH).json()["draft"]["notes"] == "New phone note"


def test_resumed_workouts_finish_with_revision_protection_and_retry_safely(client):
    original = payload_for(client)
    saved = client.post("/api/workouts", json=original).json()
    value = {**draft(), "resumingWorkoutId": saved["id"]}
    put(client, value)
    resumed = {
        **original,
        "notes": "Extra sets",
        "active_workout_revision": 1,
        "active_workout_session_id": value["clientSessionId"],
    }
    first = client.put(f"/api/workouts/{saved['id']}", json=resumed)
    assert first.status_code == 200, first.text
    assert client.get(PATH).json() == {"revision": 2, "draft": None}
    retry = client.put(f"/api/workouts/{saved['id']}", json=resumed)
    assert retry.status_code == 200, retry.text
    refused = client.put(f"/api/workouts/{saved['id']}", json={**resumed, "notes": "Different"})
    assert refused.status_code == 409, refused.text


def test_reminder_uses_real_activity_once_per_idle_period_and_survives_restart(client, monkeypatch):
    value = draft()
    value["lastActiveAt"] = value["startedAt"]
    put(client, value)
    deliveries = []
    monkeypatch.setattr(
        "app.notifications.send_push_notification",
        lambda *args, **kwargs: deliveries.append(kwargs) or True,
    )
    scheduler = ActiveWorkoutReminderScheduler(SessionLocal, client.app.state.settings)
    scheduler.deliver_due()
    assert len(deliveries) == 1
    assert deliveries[0]["user_id"] == client.user["id"]
    assert "endpoint" not in deliveries[0]  # Account-wide, rather than the starting computer.
    ActiveWorkoutReminderScheduler(SessionLocal, client.app.state.settings).deliver_due()
    assert len(deliveries) == 1
    # A visible app/reconnection changes updatedAt, but cannot postpone or repeat a reminder.
    idle = {**value, "updatedAt": value["updatedAt"] + 1000}
    put(client, idle, value, 1)
    scheduler.deliver_due()
    assert len(deliveries) == 1
    active = {**idle, "lastActiveAt": int(datetime.now(UTC).timestamp() * 1000)}
    put(client, active, idle, 2)
    with SessionLocal() as db:
        row = db.get(ActiveWorkoutSync, client.user["id"])
        assert not row.reminder_delivered
        assert datetime.now(UTC) - as_utc(row.last_activity_at) < timedelta(seconds=2)
        row.last_activity_at = datetime.now(UTC) - timedelta(minutes=46)
        db.commit()
    scheduler.deliver_due()
    assert len(deliveries) == 2
    put(client, None, active, 3)
    scheduler.deliver_due()
    assert len(deliveries) == 2


def test_real_push_fans_out_only_to_accounts_subscribed_devices(client, other_client, monkeypatch):
    import pywebpush

    endpoints = [
        "https://fcm.googleapis.com/fcm/send/desktop",
        "https://fcm.googleapis.com/fcm/send/phone",
    ]
    with SessionLocal() as db:
        for endpoint in endpoints:
            db.add(
                PushSubscription(user_id=client.user["id"], endpoint=endpoint, p256dh="k", auth="a")
            )
        db.add(
            PushSubscription(
                user_id=other_client.user["id"],
                endpoint="https://fcm.googleapis.com/fcm/send/other",
                p256dh="k",
                auth="a",
            )
        )
        db.commit()
    sent = []
    monkeypatch.setattr(
        pywebpush,
        "webpush",
        lambda subscription_info, **kwargs: sent.append(subscription_info["endpoint"]),
    )
    value = draft()
    value["lastActiveAt"] = value["startedAt"]
    put(client, value)
    client.app.state.workout_reminders.deliver_due()
    assert sorted(sent) == sorted(endpoints)
