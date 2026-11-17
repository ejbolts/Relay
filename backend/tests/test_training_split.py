import json
import sqlite3
from contextlib import closing
from datetime import date

import pytest

from app.account_backups import BACKUP_DATABASE, backup_folder, create_account_snapshot
from app.config import get_settings
from app.database import SessionLocal
from app.models import User
from app.training_metrics import set_setting
from app.training_split import TRAINING_SPLIT_KEY


def split_payload(*types, **overrides):
    return {
        "name": "My split",
        "enabled": True,
        "start_date": "2026-10-26",
        "steps": [{"workout_type_id": item} for item in types],
        # Calendar behaviour is spelled out; tests of the default omit it explicitly.
        "progression": "calendar",
        **overrides,
    }


def save_split(client, *types, **overrides):
    response = client.put("/api/training-split", json=split_payload(*types, **overrides))
    assert response.status_code == 200, response.text
    return response.json()


def recommended(client, on_date="2026-10-26"):
    response = client.get("/api/dashboard", params={"on_date": on_date})
    assert response.status_code == 200, response.text
    return response.json()["recommendation"]


def test_split_is_optional_persistent_account_owned_and_invalidates_cached_training(
    client, other_client
):
    assert client.get("/api/training-split").json() is None
    assert recommended(client)["split_name"] is None
    revision = client.get("/api/workouts/revision").json()["revision"]
    saved = save_split(client, "upper", "lower", None, name="  Upper / Lower  ")
    assert saved["name"] == "Upper / Lower"
    assert client.get("/api/training-split").json() == saved
    assert client.get("/api/workouts/revision").json()["revision"] != revision
    assert other_client.get("/api/training-split").json() is None
    assert recommended(other_client)["split_name"] is None
    assert recommended(client)["category"] == "upper"
    assert recommended(client)["workout_type"]["name"] == "Upper body"


@pytest.mark.parametrize(
    ("types", "expected"),
    [
        (["upper", "lower", None], ["upper", "lower", None, "upper", "lower", None, "upper"]),
        (["push", "pull", "lower", None], ["push", "pull", "lower", None, "push", "pull", "lower"]),
        (
            ["full_body", None],
            ["full_body", None, "full_body", None, "full_body", None, "full_body"],
        ),
        (["cardio", None], ["cardio", None, "cardio", None, "cardio", None, "cardio"]),
    ],
)
def test_templates_repeat_by_calendar_day_including_rest(client, types, expected):
    save_split(client, *types)
    for offset, type_id in enumerate(expected):
        item = recommended(
            client, date.fromordinal(date(2026, 10, 26).toordinal() + offset).isoformat()
        )
        assert item["is_rest_day"] is (type_id is None)
        assert item["needs_split_update"] is False
        assert (item["workout_type"]["id"] if item["workout_type"] else None) == type_id
        assert item["muscle_frequency"] == []


def test_every_other_day_continues_across_weeks_and_skipped_dates(client):
    save_split(client, "full_body", None)
    assert recommended(client, "2026-11-02")["is_rest_day"] is True
    assert recommended(client, "2026-11-03")["category"] == "full_body"
    assert recommended(client, "2027-01-01")["is_rest_day"] is True


def test_consecutive_rest_days_persist_and_do_not_count_as_workouts(client):
    saved = save_split(client, "push", None, None, "pull", None)
    assert client.get("/api/training-split").json() == saved
    for day in ("2026-10-27", "2026-10-28", "2026-10-30"):
        item = recommended(client, day)
        assert item["is_rest_day"] is True
        assert item["session_name"] == "Rest day"
        assert item["workout_type"] is None
    assert recommended(client, "2026-10-29")["category"] == "pull"
    assert recommended(client, "2026-10-31")["category"] == "push"
    assert client.get("/api/workouts").json() == []


def test_future_start_shows_first_scheduled_day_and_uses_the_requested_local_date(client):
    save_split(client, "pull", None, start_date="2026-11-01")
    before = recommended(client, "2026-10-31")
    assert before["category"] == "pull"
    assert before["scheduled_date"] == "2026-11-01"
    assert recommended(client, "2026-11-02")["is_rest_day"] is True


def test_history_does_not_advance_or_reorder_a_saved_calendar_split(client):
    save_split(client, "upper", "lower", None)
    exercise = client.get("/api/exercises").json()[0]
    saved = client.post(
        "/api/workouts",
        json={
            "name": "Extra workout",
            "workout_date": "2026-10-26",
            "category": "push",
            "movements": [{"exercise_id": exercise["id"], "sets": [{"weight_kg": 40, "reps": 8}]}],
        },
    )
    assert saved.status_code == 201, saved.text
    assert recommended(client)["category"] == "upper"
    assert recommended(client, "2026-10-27")["category"] == "lower"


def test_custom_types_keep_identity_and_follow_account_owned_names_and_colours(
    client, other_client
):
    custom = client.post(
        "/api/workout-types", json={"name": "Full body A", "color": "#123456"}
    ).json()
    foreign = other_client.post(
        "/api/workout-types", json={"name": "Full body A", "color": "#abcdef"}
    ).json()
    save_split(client, custom["id"], None)
    item = recommended(client)
    assert item["category"] == "other"
    assert item["workout_type"]["id"] == custom["id"]
    assert item["workout_type"]["color"] == "#123456"
    client.patch(f"/api/workout-types/{custom['id']}", json={"name": "Session A"})
    assert recommended(client)["session_name"] == "Session A workout"
    rejected = client.put("/api/training-split", json=split_payload(foreign["id"], None))
    assert rejected.status_code == 422
    assert client.get("/api/training-split").json()["steps"][0]["workout_type_id"] == custom["id"]


@pytest.mark.parametrize("custom", [False, True])
def test_removed_types_require_an_update_and_can_be_restored_or_disabled(client, custom):
    type_id = (
        client.post("/api/workout-types", json={"name": "Arms", "color": "#123456"}).json()["id"]
        if custom
        else "upper"
    )
    save_split(client, type_id, None)
    assert client.delete(f"/api/workout-types/{type_id}").status_code == 204
    item = recommended(client)
    assert item["needs_split_update"] is True
    assert item["session_name"] == "Update your split"
    assert client.put("/api/training-split", json=split_payload(type_id, None)).status_code == 422
    assert recommended(client, "2026-10-27")["is_rest_day"] is True
    save_split(client, type_id, None, enabled=False)
    assert recommended(client)["split_name"] is None
    assert client.get("/api/training-split").json()["enabled"] is False
    client.patch(f"/api/workout-types/{type_id}", json={"archived": False})
    save_split(client, type_id, None)
    assert recommended(client)["needs_split_update"] is False


@pytest.mark.parametrize(
    "overrides",
    [
        {"name": "   "},
        {"name": "x" * 41},
        {"start_date": "invalid"},
        {"steps": []},
        {"steps": [{"workout_type_id": None}]},
        {"steps": [{"workout_type_id": "upper"}] * 29},
        {"steps": [{"workout_type_id": ""}]},
        {"steps": [{"workout_type_id": "not-owned"}]},
    ],
)
def test_invalid_splits_are_rejected_without_overwriting_saved_data(client, overrides):
    saved = save_split(client, "push", None)
    response = client.put("/api/training-split", json=split_payload("upper", **overrides))
    assert response.status_code == 422, response.text
    assert client.get("/api/training-split").json() == saved


def test_corrupt_stored_settings_do_not_break_dashboard_or_split_editor(client):
    with SessionLocal() as db:
        set_setting(db, client.user["id"], TRAINING_SPLIT_KEY, '{"steps": []}')
        db.commit()
    assert client.get("/api/training-split").json() is None
    assert recommended(client)["split_name"] is None


def test_split_endpoints_require_authentication(anonymous_client):
    assert anonymous_client.get("/api/training-split").status_code == 401
    assert (
        anonymous_client.put("/api/training-split", json=split_payload("push")).status_code == 401
    )


def test_account_snapshot_preserves_only_the_owners_split_and_custom_types(client, other_client):
    custom = client.post(
        "/api/workout-types", json={"name": "Full body A", "color": "#123456"}
    ).json()
    saved = save_split(client, custom["id"], None)
    save_split(other_client, "cardio", None, name="Someone else's cycle")
    settings = get_settings()
    with SessionLocal() as db:
        user = db.get(User, client.user["id"])
        backup = create_account_snapshot(db, settings, user)
    database = backup_folder(settings, client.user["id"], backup.id) / BACKUP_DATABASE
    with closing(sqlite3.connect(database)) as connection:
        rows = connection.execute(
            "SELECT user_id, value FROM user_settings WHERE key = ?", (TRAINING_SPLIT_KEY,)
        ).fetchall()
        assert len(rows) == 1
        assert rows[0][0] == client.user["id"]
        progress = ("next_step", "rest_saved", "next_date")
        stored = {key: value for key, value in saved.items() if key not in progress}
        assert json.loads(rows[0][1]) == stored
        assert connection.execute("SELECT id FROM workout_types").fetchall() == [(custom["id"],)]


def log_workout(client, on_date, category="push", workout_type_id=None, sample=False):
    exercise = client.get("/api/exercises").json()[0]
    response = client.post(
        "/api/workouts",
        json={
            "name": f"{category} session",
            "workout_date": on_date,
            "category": category,
            **({"workout_type_id": workout_type_id} if workout_type_id else {}),
            "movements": [{"exercise_id": exercise["id"], "sets": [{"weight_kg": 40, "reps": 8}]}],
        },
    )
    assert response.status_code == 201, response.text
    if sample:
        with SessionLocal() as db:
            from app.models import TrainingWorkout

            db.get(TrainingWorkout, response.json()["id"]).is_sample = True
            db.commit()


def up_next(client, on_date):
    item = recommended(client, on_date)
    return None if item["is_rest_day"] else item["category"]


def test_following_workouts_is_the_default_and_calendar_remains_available(client):
    payload = split_payload("push", "pull", "lower")
    del payload["progression"]
    saved = client.put("/api/training-split", json=payload).json()
    assert saved["progression"] == "workouts"
    log_workout(client, "2026-10-26", "push")
    assert up_next(client, "2026-10-28") == "pull"
    # Calendar splits move on with the date even after an unplanned rest.
    assert save_split(client, "push", "pull", "lower")["progression"] == "calendar"
    assert up_next(client, "2026-10-28") == "lower"


def test_legacy_saved_splits_without_a_mode_follow_workouts(client):
    with SessionLocal() as db:
        legacy = split_payload("push", "pull", "lower")
        del legacy["progression"]
        set_setting(db, client.user["id"], TRAINING_SPLIT_KEY, json.dumps(legacy))
        db.commit()
    assert client.get("/api/training-split").json()["progression"] == "workouts"


def test_following_workouts_waits_after_an_unplanned_rest(client):
    saved = save_split(client, "push", "pull", "lower", progression="workouts")
    assert saved["progression"] == "workouts"
    assert saved["next_step"] == 0
    log_workout(client, "2026-10-26", "push")
    assert up_next(client, "2026-10-26") == "pull"
    assert up_next(client, "2026-10-27") == "pull"
    # Rested on the 27th, so Pull is still next on the 28th instead of being skipped.
    assert up_next(client, "2026-10-28") == "pull"
    log_workout(client, "2026-10-28", "pull")
    assert up_next(client, "2026-10-29") == "lower"


def test_an_unplanned_rest_uses_up_only_the_next_planned_rest(client):
    save_split(client, "upper", "lower", None, "upper", "lower", None, progression="workouts")
    log_workout(client, "2026-10-26", "upper")
    # 27th: unplanned rest. Lower stays next and one rest is saved.
    item = recommended(client, "2026-10-28")
    assert item["category"] == "lower"
    assert "already rested" in item["reason"]
    progress = client.get("/api/training-split", params={"on_date": "2026-10-28"}).json()
    assert (progress["next_step"], progress["rest_saved"]) == (1, True)
    assert progress["next_date"] == "2026-10-28"
    log_workout(client, "2026-10-28", "lower")
    progress = client.get("/api/training-split", params={"on_date": "2026-10-28"}).json()
    assert (progress["next_step"], progress["next_date"]) == (3, "2026-10-29")
    # The planned rest is skipped because the 27th already counted as it.
    assert up_next(client, "2026-10-29") == "upper"
    log_workout(client, "2026-10-29", "upper")
    log_workout(client, "2026-10-30", "lower")
    # No saved rest this time, so the next planned rest is shown, then completed by resting.
    assert up_next(client, "2026-10-31") is None
    assert up_next(client, "2026-11-01") == "upper"


def test_at_most_one_rest_is_saved(client):
    save_split(client, "push", None, "pull", None, progression="workouts")
    log_workout(client, "2026-10-26", "push")
    # 27th: planned rest. 28th to 30th: three unplanned rests, which save only one.
    assert up_next(client, "2026-10-31") == "pull"
    log_workout(client, "2026-10-31", "pull")
    assert up_next(client, "2026-11-01") == "push"
    log_workout(client, "2026-11-01", "push")
    assert up_next(client, "2026-11-02") is None


def test_consecutive_planned_rests_only_lose_one_to_a_saved_rest(client):
    save_split(client, "full_body", None, None, progression="workouts")
    # 26th: unplanned rest saved. Training on the 27th then skips one of the two rests.
    log_workout(client, "2026-10-27", "full_body")
    assert up_next(client, "2026-10-28") is None
    assert up_next(client, "2026-10-29") == "full_body"


def test_training_on_a_planned_rest_or_out_of_order_moves_past_that_workout(client):
    save_split(client, "push", "pull", "lower", None, progression="workouts")
    log_workout(client, "2026-10-26", "push")
    log_workout(client, "2026-10-27", "pull")
    log_workout(client, "2026-10-28", "lower")
    assert up_next(client, "2026-10-29") is None
    log_workout(client, "2026-10-29", "push")
    assert up_next(client, "2026-10-30") == "pull"
    log_workout(client, "2026-10-30", "lower")
    assert up_next(client, "2026-10-31") is None


def test_workouts_outside_the_split_and_sample_workouts_do_not_advance_it(client, other_client):
    save_split(client, "upper", "lower", progression="workouts")
    log_workout(client, "2026-10-26", "cardio")
    log_workout(client, "2026-10-26", "upper", sample=True)
    log_workout(other_client, "2026-10-26", "upper")
    assert up_next(client, "2026-10-26") == "upper"
    custom = client.post("/api/workout-types", json={"name": "Arms", "color": "#123456"}).json()
    save_split(client, custom["id"], "lower", progression="workouts")
    log_workout(client, "2026-10-26", "other", workout_type_id=custom["id"])
    assert up_next(client, "2026-10-26") == "lower"


def test_progression_round_trips_through_routines(client):
    routine = client.post(
        "/api/routines",
        json={
            "name": "PPL",
            "days": [{"workout_type_id": t, "movements": []} for t in ("push", "pull", None)],
            "schedule": {"start_date": "2026-10-26", "progression": "workouts"},
        },
    )
    assert routine.status_code == 201, routine.text
    assert client.get("/api/training-split").json()["progression"] == "workouts"
    used = client.post(
        f"/api/routines/{routine.json()['id']}/use",
        json={"start_date": "2026-10-26", "progression": "calendar"},
        params={"on_date": "2026-10-27"},
    ).json()
    assert used["progression"] == "calendar"
    used = client.post(
        f"/api/routines/{routine.json()['id']}/use",
        json={"start_date": "2026-10-26"},
        params={"on_date": "2026-10-27"},
    ).json()
    assert (used["progression"], used["next_step"], used["rest_saved"]) == ("workouts", 0, True)
