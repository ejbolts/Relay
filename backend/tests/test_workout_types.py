from datetime import date
from uuid import uuid4

import pytest
from conftest import TEST_PASSWORD
from sqlalchemy import select

from app.database import SessionLocal
from app.models import TrainingWorkout, WorkoutType


def add_type(client, name="Arms", color="#a855f7"):
    response = client.post("/api/workout-types", json={"name": name, "color": color})
    assert response.status_code == 201, response.text
    return response.json()


def payload(client, type_id=None, category="other"):
    exercise = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Barbell Bench Press"
    )
    return {
        "name": "Custom session",
        "workout_date": date.today().isoformat(),
        "category": category,
        "workout_type_id": type_id,
        "movements": [{"exercise_id": exercise["id"], "sets": [{"reps": 8, "weight_kg": 40}]}],
    }


def test_custom_type_catalog_create_rename_remove_restore_and_colors(client, other_client):
    defaults = client.get("/api/workout-types").json()
    assert [item["id"] for item in defaults] == [
        "upper",
        "lower",
        "push",
        "pull",
        "full_body",
        "cardio",
        "other",
    ]
    assert all(not item["is_custom"] and not item["archived"] for item in defaults)
    types = [add_type(client, name) for name in [" Arms ", "Legs", "Limbs", "Torso"]]
    assert types[0]["name"] == "Arms"
    assert len({item["id"] for item in types}) == 4
    assert all(item["is_custom"] for item in types)
    assert len(other_client.get("/api/workout-types").json()) == 7
    type_id = types[0]["id"]
    revision = client.get("/api/workouts/snapshot").json()["revision"]
    renamed = client.patch(
        f"/api/workout-types/{type_id}", json={"name": "Arm day", "color": "#123ABC"}
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Arm day"
    assert renamed.json()["color"] == "#123ABC"
    assert client.get("/api/workouts/snapshot").json()["revision"] != revision
    assert client.delete(f"/api/workout-types/{type_id}").status_code == 204
    assert next(item for item in client.get("/api/workout-types").json() if item["id"] == type_id)[
        "archived"
    ]
    assert (
        client.patch(f"/api/workout-types/{type_id}", json={"archived": False}).json()["archived"]
        is False
    )
    builtin = client.patch("/api/workout-types/push", json={"color": "#fedcba"})
    assert builtin.json()["color"] == "#fedcba"
    assert client.get("/api/workout-type-colors").json()["push"] == "#fedcba"


@pytest.mark.parametrize(
    "body",
    [
        {"name": "  ", "color": "#123456"},
        {"name": "x" * 41, "color": "#123456"},
        {"name": "Arms", "color": "red"},
        {"name": "Arms", "color": "#12345g"},
    ],
)
def test_invalid_workout_types_are_rejected(client, body):
    assert client.post("/api/workout-types", json=body).status_code == 422
    assert len(client.get("/api/workout-types").json()) == 7


def test_duplicates_include_archived_and_builtin_names_and_are_account_scoped(client, other_client):
    arms = add_type(client)
    client.delete(f"/api/workout-types/{arms['id']}")
    assert (
        client.post("/api/workout-types", json={"name": " arms ", "color": "#123456"}).status_code
        == 409
    )
    assert (
        client.post(
            "/api/workout-types", json={"name": "UPPER BODY", "color": "#123456"}
        ).status_code
        == 409
    )
    assert add_type(other_client)["id"] != arms["id"]
    assert (
        other_client.patch(f"/api/workout-types/{arms['id']}", json={"name": "Stolen"}).status_code
        == 404
    )
    assert other_client.delete(f"/api/workout-types/{arms['id']}").status_code == 404
    assert (
        other_client.post("/api/workouts", json=payload(other_client, arms["id"])).status_code
        == 404
    )
    assert client.patch("/api/workout-types/not-found", json={"archived": True}).status_code == 404


def test_saved_custom_types_persist_on_edits_archive_and_calendar(client):
    types = [add_type(client, name) for name in ["Arms", "Legs", "Limbs", "Torso"]]
    workouts = []
    for item in types:
        saved = client.post("/api/workouts", json=payload(client, item["id"]))
        assert saved.status_code == 201, saved.text
        assert saved.json()["workout_type"]["name"] == item["name"]
        workouts.append(saved.json())
    arms, workout = types[0], workouts[0]
    client.delete(f"/api/workout-types/{arms['id']}")
    saved = client.get(f"/api/workouts/{workout['id']}").json()
    assert saved["workout_type"]["name"] == "Arms"
    assert saved["workout_type"]["archived"] is True
    assert client.post("/api/workouts", json=payload(client, arms["id"])).status_code == 422
    old_client_edit = payload(client)
    del old_client_edit["workout_type_id"]
    updated = client.put(f"/api/workouts/{workout['id']}", json=old_client_edit)
    assert updated.status_code == 200, updated.text
    assert updated.json()["workout_type_id"] == arms["id"]
    day = client.get("/api/dashboard").json()["heatmap"][0]
    assert {item["name"] for item in day["workout_types"]} == {"Arms", "Legs", "Limbs", "Torso"}
    assert day["workouts"][0]["workout_type_id"] in {item["id"] for item in types}
    calendar = client.get("/api/calendar", params={"start": date.today().isoformat()}).json()
    assert calendar[0]["workout_types"] == day["workout_types"]


def test_removed_builtin_cannot_be_used_for_new_workout_but_history_is_editable(client):
    body = payload(client, category="push")
    saved = client.post("/api/workouts", json=body).json()
    assert client.delete("/api/workout-types/push").status_code == 204
    assert client.post("/api/workouts", json=body).status_code == 422
    assert client.put(f"/api/workouts/{saved['id']}", json=body).status_code == 200
    assert client.patch("/api/workout-types/push", json={"archived": False}).status_code == 200
    assert client.post("/api/workouts", json=body).status_code == 201


def test_rejected_removed_type_rolls_back_reserved_save_session(client):
    body = {**payload(client, category="push"), "client_session_id": str(uuid4())}
    assert client.delete("/api/workout-types/push").status_code == 204
    assert client.post("/api/workouts", json=body).status_code == 422
    assert client.get("/api/workouts").json() == []
    # Restoring the type allows the same client session to retry successfully.
    assert client.patch("/api/workout-types/push", json={"archived": False}).status_code == 200
    saved = client.post("/api/workouts", json=body)
    assert saved.status_code == 201
    assert saved.json()["client_session_id"] == body["client_session_id"]
    # Removing it again must still allow recovery of that already committed save.
    assert client.delete("/api/workout-types/push").status_code == 204
    assert client.post("/api/workouts", json=body).json()["id"] == saved.json()["id"]
    assert len(client.get("/api/workouts").json()) == 1


def test_shared_custom_metadata_and_filter_match_the_profile_owner(client, other_client):
    for owner in [client, other_client]:
        assert owner.put("/api/sharing", json={"visibility": "public"}).status_code == 200
    arms = add_type(client)
    saved = client.post("/api/workouts", json=payload(client, arms["id"])).json()
    client.post("/api/workouts", json=payload(client))
    base = f"/api/sharing/profiles/{client.user['id']}"
    filtered = other_client.get(f"{base}/workouts", params={"workout_type_id": arms["id"]})
    assert filtered.status_code == 200, filtered.text
    assert filtered.json()["total"] == 1
    assert filtered.json()["workouts"][0]["id"] == saved["id"]
    assert filtered.json()["workouts"][0]["workout_type"]["name"] == "Arms"
    assert other_client.get(f"{base}/workouts", params={"category": "other"}).json()["total"] == 1
    filters = other_client.get(f"{base}/workout-filters").json()
    assert arms in filters["workout_types"]


def test_custom_type_csv_round_trip_preserves_identity_in_another_account(client, other_client):
    arms = add_type(client)
    body = payload(client, arms["id"])
    body["movements"][0]["sets"][0]["bodyweight_kg"] = 80
    client.post("/api/workouts", json=body)
    exported = client.get("/api/workouts/export.csv")
    assert b"Workout type,Workout type color" in exported.content
    imported = other_client.post(
        "/api/workouts/import", files={"file": ("workouts.csv", exported.content, "text/csv")}
    )
    assert imported.status_code == 201, imported.text
    saved = other_client.get("/api/workouts").json()[0]
    assert saved["workout_type"]["name"] == "Arms"
    assert saved["workout_type"]["color"] == arms["color"]
    assert saved["workout_type_id"] != arms["id"]
    assert imported.json()["body_measurements_created"] == 1
    assert other_client.get("/api/body-measurements").json()[0]["weight_kg"] == 80
    repeated = other_client.post(
        "/api/workouts/import", files={"file": ("workouts.csv", exported.content, "text/csv")}
    )
    assert repeated.json()["workouts_skipped"] == 1


def test_account_delete_removes_owned_types_after_workouts(client, other_client):
    arms = add_type(other_client)
    client_type = add_type(client)
    other_client.post("/api/workouts", json=payload(other_client, arms["id"]))
    response = other_client.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD})
    assert response.status_code == 204, response.text
    with SessionLocal() as db:
        assert db.get(WorkoutType, arms["id"]) is None
        assert db.get(WorkoutType, client_type["id"]) is not None
        assert not list(
            db.scalars(
                select(TrainingWorkout).where(TrainingWorkout.user_id == other_client.user["id"])
            )
        )
