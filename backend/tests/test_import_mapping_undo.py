import json

import pytest
from test_csv_import_safety import csv_file, row, snapshot

from app.database import SessionLocal
from app.models import BodyMeasurement, Exercise


def upload(client, content, mappings=None, *, preview=False):
    return client.post(
        "/api/workouts/import/preview" if preview else "/api/workouts/import",
        files={"file": ("history.csv", content, "text/csv")},
        data={"exercise_mappings": json.dumps(mappings or {})},
    )


def exercise(client, name="Barbell Bench Press"):
    return next(item for item in client.get("/api/exercises").json() if item["name"] == name)


def undo(client, batch_id):
    return client.delete(f"/api/workouts/import/batches/{batch_id}")


def test_mapping_recalculates_preview_and_saves_existing_exercise(client):
    target = exercise(client)
    content = csv_file(row(exercise="Incoming press"), row(exercise="Bench Press"))
    before = snapshot(client)
    mappings = {"Incoming press": target["id"]}
    preview = upload(client, content, mappings, preview=True)
    assert preview.status_code == 200, preview.text
    assert preview.json()["new_exercises"] == []
    assert preview.json()["sessions"][0]["exercises"] == [target["name"]]
    assert snapshot(client) == before
    result = upload(client, content, mappings)
    assert result.status_code == 201, result.text
    assert result.json()["exercises_created"] == 0
    workout = client.get("/api/workouts").json()[0]
    assert len(workout["movements"]) == 1
    assert workout["movements"][0]["exercise"]["id"] == target["id"]
    assert len(workout["movements"][0]["sets"]) == 2
    assert upload(client, content, mappings, preview=True).json()["workouts_to_skip"] == 1
    assert upload(client, content, mappings).json()["batch_id"] is None
    assert len(client.get("/api/workouts/import/batches").json()) == 1


@pytest.mark.parametrize("preview", [True, False])
def test_invalid_and_foreign_mapping_never_writes(client, other_client, preview):
    content = csv_file(row(exercise="Incoming press"))
    before = snapshot(client)
    for mapping in [
        {"Incoming press": "missing"},
        {"Incoming press": exercise(other_client)["id"]},
        {"Not in file": exercise(client)["id"]},
        {"Incoming press": exercise(client, "Running")["id"]},
    ]:
        response = upload(client, content, mapping, preview=preview)
        assert response.status_code == 422, response.text
        assert snapshot(client) == before
        assert client.get("/api/workouts/import/batches").json() == []


@pytest.mark.parametrize("mapping", ["[]", "{bad", '{"Incoming press": 42}'])
def test_malformed_mapping_is_validation_error(client, mapping):
    response = client.post(
        "/api/workouts/import",
        files={"file": ("history.csv", csv_file(row()), "text/csv")},
        data={"exercise_mappings": mapping},
    )
    assert response.status_code == 422
    assert client.get("/api/workouts").json() == []


def test_mapping_is_revalidated_when_target_deleted_after_review(client):
    target = client.post(
        "/api/exercises",
        json={
            "name": "Temporary press",
            "category": "push",
            "kind": "strength",
            "muscle_group": "Chest",
            "equipment": "Machine",
        },
    ).json()
    content = csv_file(row(exercise="Incoming press"))
    mapping = {"Incoming press": target["id"]}
    assert upload(client, content, mapping, preview=True).status_code == 200
    with SessionLocal() as db:
        db.delete(db.get(Exercise, target["id"]))
        db.commit()
    assert upload(client, content, mapping).status_code == 422
    assert client.get("/api/workouts").json() == []


def test_review_allows_mapping_when_custom_library_is_full(client, other_client):
    from test_account_limits import set_limits

    set_limits(client, custom_exercises_per_account=1)
    assert upload(other_client, csv_file(row(exercise="First custom"))).status_code == 201
    content = csv_file(row(day="2026-07-18", exercise="Incoming press"))
    assert upload(other_client, content, preview=True).status_code == 200
    assert upload(other_client, content).status_code == 422
    mapping = {"Incoming press": exercise(other_client)["id"]}
    assert upload(other_client, content, mapping).status_code == 201


def test_batch_is_in_account_snapshot_and_removed_on_account_deletion(client, other_client):
    from test_account_backups import rows
    from test_account_backups import snapshot as backup

    from app.account_backups import BACKUP_DATABASE, backup_folder
    from app.config import get_settings

    result = upload(client, csv_file(row())).json()
    other = upload(other_client, csv_file(row())).json()
    archive = backup("owner")
    database = backup_folder(get_settings(), client.user["id"], archive.id) / BACKUP_DATABASE
    assert rows(database, "SELECT id FROM import_batches") == [(result["batch_id"],)]
    assert (
        client.request(
            "DELETE", "/api/profile", json={"password": "correct horse battery staple"}
        ).status_code
        == 204
    )
    assert other_client.get("/api/workouts/import/batches").json()[0]["id"] == other["batch_id"]
    from app.models import ImportBatch

    with SessionLocal() as db:
        assert db.get(ImportBatch, result["batch_id"]) is None


def test_undo_one_batch_preserves_other_batches_same_date_and_account(client, other_client):
    first = upload(client, csv_file(row(exercise="Batch-only press"))).json()
    second = upload(client, csv_file(row(weight=95))).json()
    foreign = upload(other_client, csv_file(row())).json()
    foreign_before = snapshot(other_client)
    second_workout = next(
        w
        for w in client.get("/api/workouts").json()
        if w["movements"][0]["sets"][0]["weight_kg"] == 95
    )
    assert undo(other_client, first["batch_id"]).status_code == 404
    assert len(other_client.get("/api/workouts/import/batches").json()) == 1
    assert undo(client, first["batch_id"]).json() == {
        "workouts_removed": 1,
        "body_measurements_removed": 1,
        "body_measurements_preserved": 0,
        "exercises_removed": 1,
    }
    assert [w["id"] for w in client.get("/api/workouts").json()] == [second_workout["id"]]
    assert snapshot(other_client) == foreign_before
    assert foreign["batch_id"] != second["batch_id"]
    assert undo(client, first["batch_id"]).status_code == 404
    assert [b["id"] for b in client.get("/api/workouts/import/batches").json()] == [
        second["batch_id"]
    ]
    records = client.get("/api/personal-records").json()
    assert all(record["workout_id"] == second_workout["id"] for record in records)


def test_undo_preserves_edited_checkins_and_reused_custom_exercise(client):
    first = upload(client, csv_file(row(exercise="Reusable press"))).json()
    second = upload(client, csv_file(row(exercise="Reusable press", day="2026-07-18"))).json()
    with SessionLocal() as db:
        measurement = db.query(BodyMeasurement).filter_by(measurement_date="2026-07-17").one()
        measurement.notes = "Edited after import"
        db.commit()
    response = undo(client, first["batch_id"])
    assert response.status_code == 200, response.text
    assert response.json()["body_measurements_preserved"] == 1
    assert response.json()["exercises_removed"] == 0
    assert exercise(client, "Reusable press")
    assert len(client.get("/api/workouts").json()) == 1
    assert len(client.get("/api/body-measurements").json()) == 2
    assert undo(client, second["batch_id"]).status_code == 200
    # The exercise belonged to the first batch but is retained once used elsewhere.
    assert exercise(client, "Reusable press")


def test_undo_preserves_preexisting_checkin_and_handles_deleted_session(client):
    assert (
        client.post(
            "/api/body-measurements",
            json={"measurement_date": "2026-07-17", "weight_kg": 78, "notes": "Keep me"},
        ).status_code
        == 200
    )
    result = upload(client, csv_file(row())).json()
    workout = client.get("/api/workouts").json()[0]
    assert client.delete("/api/workouts/" + workout["id"]).status_code == 204
    assert client.get("/api/workouts/import/batches").json()[0]["workouts"] == 0
    assert undo(client, result["batch_id"]).json()["workouts_removed"] == 0
    assert client.get("/api/body-measurements").json()[0]["notes"] == "Keep me"


def test_measurements_only_import_has_undo_and_advances_revision(client):
    before = client.get("/api/workouts/revision").json()
    result = upload(
        client, b"Date,Weight (kg),Body fat (%),Notes\n2026-07-17,80,18,Sample\n"
    ).json()
    assert result["batch_id"]
    assert client.get("/api/workouts/revision").json() != before
    assert undo(client, result["batch_id"]).json()["body_measurements_removed"] == 1
    assert client.get("/api/body-measurements").json() == []


def test_undo_failure_rolls_back_batch_and_all_entries(client, monkeypatch):
    result = upload(client, csv_file(row())).json()
    before = snapshot(client)

    def fail(*args):
        raise RuntimeError("Undo failed")

    monkeypatch.setattr("app.tracker.rebuild_personal_records", fail)
    with pytest.raises(RuntimeError, match="Undo failed"):
        undo(client, result["batch_id"])
    assert snapshot(client) == before
    assert len(client.get("/api/workouts/import/batches").json()) == 1


def test_undo_removes_linked_cardio_but_keeps_standalone_cardio(client):
    from test_workout_app_import import HEVY, hevy_row
    from test_workout_app_import import csv_file as app_csv

    raw = app_csv(
        HEVY,
        hevy_row(
            exercise_title="Cycling",
            reps="",
            weight_kg="",
            duration_seconds="1800",
            distance_km="12.5",
        ),
    )
    result = client.post(
        "/api/workouts/import",
        files={"file": ("cardio.csv", raw, "text/csv")},
        data={"source": "hevy"},
    )
    assert result.status_code == 201, result.text
    assert len(client.get("/api/cardio").json()["sessions"]) == 1
    standalone = client.post(
        "/api/cardio",
        json={"session_date": "2026-07-19", "activity_type": "Walking", "duration_minutes": 20},
    )
    assert standalone.status_code == 201, standalone.text
    assert undo(client, result.json()["batch_id"]).status_code == 200
    assert [item["id"] for item in client.get("/api/cardio").json()["sessions"]] == [
        standalone.json()["id"]
    ]
