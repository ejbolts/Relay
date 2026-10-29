import sqlite3
from contextlib import closing

import pytest
from test_sharing import befriend, share

from app.account_backups import BACKUP_DATABASE, backup_folder, create_account_snapshot
from app.config import get_settings
from app.database import SessionLocal
from app.models import User


def payload(client, *, shared=False):
    exercise = next(
        x for x in client.get("/api/exercises").json() if x["name"] == "Barbell Bench Press"
    )
    return {
        "name": "Upper / Rest",
        "shared": shared,
        "days": [
            {
                "workout_type_id": "upper",
                "movements": [
                    {
                        "exercise_id": exercise["id"],
                        "sets": [{"reps": 8, "weight_kg": 50, "rest_seconds": 120}],
                    }
                ],
            },
            {"workout_type_id": None, "movements": []},
        ],
    }


def create(client, data=None):
    response = client.post("/api/routines", json=data or payload(client))
    assert response.status_code == 201, response.text
    return response.json()


def test_routines_are_account_owned_and_copies_are_independent(client, other_client):
    original = create(client, payload(client, shared=True))
    private = create(client)
    base = f"/api/routines/profile/{client.user['id']}"
    assert [r["id"] for r in other_client.get(base).json()] == [original["id"]]
    assert other_client.get("/api/routines").json() == []
    assert (
        other_client.put(f"/api/routines/{original['id']}", json=payload(other_client)).status_code
        == 404
    )
    assert other_client.delete(f"/api/routines/{original['id']}").status_code == 404
    assert other_client.post(f"{base}/{private['id']}/copy").status_code == 404
    response = other_client.post(f"{base}/{original['id']}/copy")
    assert response.status_code == 201, response.text
    copied = response.json()
    assert copied["id"] != original["id"] and copied["shared"] is False
    original_move = original["days"][0]["movements"][0]
    copied_move = copied["days"][0]["movements"][0]
    assert copied_move["exercise_id"] != original_move["exercise_id"]
    assert copied_move["exercise"]["name"] == original_move["exercise"]["name"]
    copied_move["sets"][0]["weight_kg"] = 30
    copied["name"] = "My adapted routine"
    response = other_client.put(f"/api/routines/{copied['id']}", json=copied)
    assert response.status_code == 200, response.text
    assert client.get("/api/routines").json()[0]["id"] in {original["id"], private["id"]}
    unchanged = next(r for r in client.get("/api/routines").json() if r["id"] == original["id"])
    assert unchanged["days"][0]["movements"][0]["sets"][0]["weight_kg"] == 50
    assert other_client.get("/api/training-split").json() is None
    assert client.delete(f"/api/routines/{original['id']}").status_code == 204
    assert other_client.get("/api/routines").json()[0]["name"] == "My adapted routine"
    assert other_client.get("/api/workouts").json() == []
    assert other_client.get("/api/routines").headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "restriction", ["private", "friends", "blocked", "disabled", "viewer_private"]
)
def test_profile_access_applies_to_listing_and_copying(client, other_client, restriction):
    routine = create(client, payload(client, shared=True))
    if restriction == "private":
        share(client, "private")
    elif restriction == "friends":
        share(client, "followers")
    elif restriction == "blocked":
        assert client.post(f"/api/sharing/blocks/{other_client.user['id']}").is_success
    elif restriction == "disabled":
        with SessionLocal() as db:
            from app.models import utc_now

            db.get(User, client.user["id"]).disabled_at = utc_now()
            db.commit()
    else:
        share(other_client, "private")
    base = f"/api/routines/profile/{client.user['id']}"
    assert other_client.get(base).status_code in {403, 404}
    assert other_client.post(f"{base}/{routine['id']}/copy").status_code in {403, 404}
    assert other_client.get("/api/routines").json() == []


def test_friends_can_copy_but_unsharing_revokes_future_copies(client, other_client):
    routine = create(client, payload(client, shared=True))
    share(client, "followers")
    befriend(client, other_client)
    url = f"/api/routines/profile/{client.user['id']}/{routine['id']}/copy"
    assert other_client.post(url).status_code == 201
    routine["shared"] = False
    assert client.put(f"/api/routines/{routine['id']}", json=routine).status_code == 200
    assert other_client.post(url).status_code == 404
    assert len(other_client.get("/api/routines").json()) == 1


def test_capture_only_copies_planned_fields_and_activation_drives_workout_suggestions(client):
    data = payload(client)
    exercise_id = data["days"][0]["movements"][0]["exercise_id"]
    assert client.put(
        "/api/training-split",
        json={
            "name": "Upper / Rest",
            "start_date": "2026-10-29",
            "steps": [{"workout_type_id": "upper"}, {"workout_type_id": None}],
        },
    ).is_success
    assert (
        client.post(
            "/api/workouts",
            json={
                "name": "Private session",
                "workout_date": "2026-10-28",
                "category": "upper",
                "notes": "Private session note",
                "movements": [
                    {
                        "exercise_id": exercise_id,
                        "notes": "Private exercise note",
                        "sets": [
                            {
                                "reps": 8,
                                "weight_kg": 50,
                                "notes": "Private set note",
                                "bodyweight_kg": 80,
                            },
                            {"reps": 10, "weight_kg": 80, "completed": False},
                        ],
                    }
                ],
            },
        ).status_code
        == 201
    )
    response = client.post("/api/routines/from-split")
    assert response.status_code == 201, response.text
    routine = response.json()
    assert routine["shared"] is False
    assert len(routine["days"][0]["movements"][0]["sets"]) == 1
    assert "Private" not in response.text and "bodyweight_kg" not in response.text
    revision = client.get("/api/workouts/revision").json()["revision"]
    assert (
        client.post(
            f"/api/routines/{routine['id']}/use", json={"start_date": "2026-10-29"}
        ).status_code
        == 200
    )
    assert client.get("/api/workouts/revision").json()["revision"] != revision
    recommendation = client.get("/api/dashboard?on_date=2026-10-29").json()["recommendation"]
    assert recommendation["routine_day"]["movements"][0]["sets"][0]["weight_kg"] == 50
    assert (
        client.get("/api/dashboard?on_date=2026-10-30").json()["recommendation"]["routine_day"]
        is None
    )
    routine["days"][0]["movements"][0]["sets"][0]["weight_kg"] = 35
    assert client.put(f"/api/routines/{routine['id']}", json=routine).is_success
    assert (
        client.get("/api/dashboard?on_date=2026-10-29").json()["recommendation"]["routine_day"][
            "movements"
        ][0]["sets"][0]["weight_kg"]
        == 35
    )
    assert client.delete(f"/api/routines/{routine['id']}").status_code == 204
    assert client.get("/api/training-split").json()["routine_id"] is None


def test_copy_clones_custom_exercises_types_and_muscle_credits(client, other_client):
    exercise = client.post(
        "/api/exercises",
        json={
            "name": "Sample custom press",
            "category": "push",
            "kind": "strength",
            "muscle_group": "Chest",
            "muscle_set_credits": [
                {"muscle_name": "Chest", "sets": 1},
                {"muscle_name": "Triceps", "sets": 0.5},
            ],
        },
    ).json()
    custom = client.post("/api/workout-types", json={"name": "Torso A", "color": "#123456"}).json()
    data = payload(client, shared=True)
    data["days"][0]["workout_type_id"] = custom["id"]
    data["days"][0]["movements"][0]["exercise_id"] = exercise["id"]
    original = create(client, data)
    response = other_client.post(f"/api/routines/profile/{client.user['id']}/{original['id']}/copy")
    assert response.status_code == 201, response.text
    day = response.json()["days"][0]
    assert day["workout_type_id"] != custom["id"]
    assert day["workout_type"]["name"] == "Torso A"
    assert day["movements"][0]["exercise_id"] != exercise["id"]
    assert day["movements"][0]["exercise"]["muscle_set_credits"] == exercise["muscle_set_credits"]


def test_validation_and_account_backup(client, other_client):
    data = payload(client)
    data["days"][0]["movements"][0]["exercise_id"] = payload(other_client)["days"][0]["movements"][
        0
    ]["exercise_id"]
    assert client.post("/api/routines", json=data).status_code == 422
    data = payload(client, shared=True)
    data["days"][0]["movements"] = []
    assert client.post("/api/routines", json=data).status_code == 422
    data["shared"] = False
    draft = create(client, data)
    assert (
        client.post(
            f"/api/routines/{draft['id']}/use", json={"start_date": "2026-10-29"}
        ).status_code
        == 200
    )
    original = create(client)
    with SessionLocal() as db:
        settings = get_settings()
        user = db.get(User, client.user["id"])
        backup = create_account_snapshot(db, settings, user, "Routine backup")
        path = backup_folder(settings, user.id, backup.id) / BACKUP_DATABASE
    with closing(sqlite3.connect(path)) as connection:
        rows = connection.execute(
            "SELECT value FROM user_settings WHERE key = ?", ("routine:" + original["id"],)
        ).fetchall()
        assert len(rows) == 1 and "Upper / Rest" in rows[0][0]


def test_cardio_targets_copy_and_activate_without_logging_performance(client, other_client):
    data = payload(client, shared=True)
    cardio = next(item for item in client.get("/api/exercises").json() if item["name"] == "Running")
    data["days"][0] = {
        "workout_type_id": "cardio",
        "movements": [
            {"exercise_id": cardio["id"], "sets": [{"duration_seconds": 930, "distance_km": 3.4}]}
        ],
    }
    routine = create(client, data)
    copied = other_client.post(f"/api/routines/profile/{client.user['id']}/{routine['id']}/copy")
    assert copied.status_code == 201, copied.text
    assert copied.json()["days"][0]["movements"][0]["exercise_id"] != cardio["id"]
    assert other_client.post(
        f"/api/routines/{copied.json()['id']}/use", json={"start_date": "2026-10-29"}
    ).is_success
    recommendation = other_client.get("/api/dashboard?on_date=2026-10-29").json()["recommendation"]
    assert recommendation["routine_day"]["movements"][0]["sets"][0]["duration_seconds"] == 930
    assert recommendation["routine_day"]["movements"][0]["sets"][0]["distance_km"] == 3.4
    assert other_client.get("/api/workouts").json() == []


def test_split_save_links_legacy_schedule_and_updates_dates_atomically(client, other_client):
    legacy = {
        "name": "Old split",
        "start_date": "2026-10-01",
        "steps": [{"workout_type_id": "upper"}, {"workout_type_id": None}],
    }
    assert client.put("/api/training-split", json=legacy).status_code == 200
    data = {
        "name": "My split",
        "days": [{"workout_type_id": "upper"}, {"workout_type_id": None}],
        "schedule": {"start_date": "2026-10-01", "enabled": True},
    }
    created = client.post("/api/routines", json=data)
    assert created.status_code == 201, created.text
    plan = created.json()
    assert "schedule" not in plan
    active = client.get("/api/training-split").json()
    assert active["routine_id"] == plan["id"]
    assert active["start_date"] == "2026-10-01"
    assert active["enabled"] is True
    data["name"] = "Renamed"
    data["schedule"] = {"start_date": "2026-11-03", "enabled": False}
    assert client.put(f"/api/routines/{plan['id']}", json=data).status_code == 200
    updated = client.get("/api/training-split").json()
    assert updated["name"] == "Renamed" and updated["enabled"] is False
    assert updated["start_date"] == "2026-11-03"
    assert other_client.put(f"/api/routines/{plan['id']}", json=data).status_code == 404
    assert other_client.get("/api/training-split").json() is None
    before = client.get("/api/training-split").json()
    data["days"][0]["workout_type_id"] = "missing-type"
    assert client.put(f"/api/routines/{plan['id']}", json=data).status_code == 422
    assert client.get("/api/training-split").json() == before
    assert client.get("/api/routines").json()[0]["name"] == "Renamed"
    assert client.get("/api/workouts").json() == []


def test_deleting_paused_split_does_not_leave_a_ghost_saved_plan(client):
    data = payload(client)
    data["schedule"] = {"start_date": "2026-10-26", "enabled": False}
    plan = create(client, data)
    assert client.delete(f"/api/routines/{plan['id']}").status_code == 204
    assert client.get("/api/training-split").json() is None
    assert client.get("/api/routines").json() == []
