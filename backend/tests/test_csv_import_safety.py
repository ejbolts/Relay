from __future__ import annotations

import csv
from concurrent.futures import ThreadPoolExecutor
from io import StringIO

import pytest
from test_account_limits import set_limits

from app.tracker_csv import CSV_HEADERS, SESSION_HEADERS


def csv_file(*rows: list, sessions: bool = False) -> bytes:
    stream = StringIO()
    writer = csv.writer(stream)
    writer.writerow((*CSV_HEADERS, *SESSION_HEADERS) if sessions else CSV_HEADERS)
    writer.writerows(rows)
    return stream.getvalue().encode()


def row(weight=80, *, exercise="Bench Press", day="2026-07-17", reps=8, bodyweight=84):
    return [day, exercise, weight, "", reps, bodyweight, "", "", 0]


def upload(client, content: bytes, *, preview=False):
    return client.post(
        "/api/workouts/import/preview" if preview else "/api/workouts/import",
        files={"file": ("history.csv", content, "text/csv")},
    )


def snapshot(client):
    return {
        path: client.get(f"/api/{path}").json()
        for path in ("workouts/snapshot", "exercises", "body-measurements", "personal-records")
    }


def test_preview_is_read_only_and_shows_new_exercises_and_legacy_grouping(client):
    before = snapshot(client)
    response = upload(client, csv_file(row(exercise="Safety Test Press"), row()), preview=True)

    assert response.status_code == 200, response.text
    plan = response.json()
    assert plan["workouts_to_create"] == 1
    assert plan["sets_to_import"] == 2
    assert plan["new_exercises"] == ["Safety Test Press"]
    assert plan["sessions"][0]["exercises"] == ["Safety Test Press", "Barbell Bench Press"]
    assert "one session per date" in plan["warnings"][0]
    # Cancelling means no save request; preview itself has no workout/exercise/check-in writes.
    assert snapshot(client) == before


def test_reimport_skips_identical_session_and_keeps_repeated_sets(client):
    content = csv_file(row(), row())
    first = upload(client, content)
    assert first.status_code == 201, first.text
    before = snapshot(client)
    alias = csv_file(row(exercise="barbell bench press"), row(exercise="Barbell Bench Press"))
    preview = upload(client, alias, preview=True).json()
    assert preview["workouts_to_skip"] == 1
    assert preview["sets_to_import"] == 0
    assert preview["new_exercises"] == []
    second = upload(client, alias)
    assert second.status_code == 201, second.text
    assert second.json()["workouts_skipped"] == 1
    assert second.json()["sets_imported"] == 0
    assert snapshot(client) == before
    assert len(before["workouts/snapshot"]["workouts"][0]["movements"][0]["sets"]) == 2


def test_pound_only_legacy_csv_matches_rounded_exports(client):
    assert upload(client, csv_file(row(weight=100, bodyweight=83.6))).status_code == 201
    pounds = row(weight="", bodyweight="")
    pounds[3], pounds[6] = 220.5, 184.3
    response = upload(client, csv_file(pounds))
    assert response.status_code == 201, response.text
    assert response.json()["workouts_skipped"] == 1
    assert len(client.get("/api/workouts").json()) == 1


@pytest.mark.parametrize("same_content", [False, True])
def test_same_day_session_ids_round_trip_and_reimport_one_to_one(client, same_content):
    content = csv_file(
        [*row(), "morning", "Morning workout"],
        [*row(weight=80 if same_content else 90), "evening", "Evening workout"],
        sessions=True,
    )
    preview = upload(client, content, preview=True).json()
    assert preview["workouts_to_create"] == 2
    assert preview["warnings"] == []
    assert upload(client, content).json()["workouts_created"] == 2
    exported = client.get("/api/workouts/export.csv").content
    rows = list(csv.DictReader(StringIO(exported.decode("utf-8-sig"))))
    assert len({item["Workout ID"] for item in rows}) == 2
    assert {item["Workout name"] for item in rows} == {"Morning workout", "Evening workout"}
    result = upload(client, exported)
    assert result.status_code == 201, result.text
    assert result.json()["workouts_created"] == 0
    assert result.json()["workouts_skipped"] == 2
    # A different account database has no matching sessions; grouping IDs still preserve both.
    for workout in client.get("/api/workouts").json():
        assert client.delete(f"/api/workouts/{workout['id']}").status_code == 204
    assert upload(client, exported).json()["workouts_created"] == 2


def test_different_same_day_session_and_extra_identical_set_are_not_duplicates(client):
    assert upload(client, csv_file(row())).status_code == 201
    assert upload(client, csv_file(row(weight=90))).json()["workouts_created"] == 1
    assert upload(client, csv_file(row(), row())).json()["workouts_created"] == 1
    assert len(client.get("/api/workouts").json()) == 3


def test_imported_source_id_still_skips_session_after_its_name_changes(client):
    content = csv_file([*row(), "external-source-id", "Morning workout"], sessions=True)
    assert upload(client, content).json()["workouts_created"] == 1
    workout = client.get("/api/workouts").json()[0]
    assert workout["id"] != "external-source-id"
    from app.database import SessionLocal
    from app.models import TrainingWorkout

    with SessionLocal() as db:
        db.get(TrainingWorkout, workout["id"]).name = "Renamed workout"
        db.commit()
    assert upload(client, content, preview=True).json()["workouts_to_skip"] == 1
    assert upload(client, content).json()["workouts_skipped"] == 1
    assert len(client.get("/api/workouts").json()) == 1


def test_owned_export_id_still_skips_session_after_its_name_changes(client):
    assert upload(client, csv_file(row())).status_code == 201
    exported = client.get("/api/workouts/export.csv").content
    workout = client.get("/api/workouts").json()[0]
    from app.database import SessionLocal
    from app.models import TrainingWorkout

    with SessionLocal() as db:
        db.get(TrainingWorkout, workout["id"]).name = "Renamed workout"
        db.commit()
    assert upload(client, exported).json()["workouts_skipped"] == 1
    assert len(client.get("/api/workouts").json()) == 1


def test_foreign_export_ids_do_not_match_or_modify_other_account(client, other_client):
    assert upload(client, csv_file(row(exercise="Owner Custom Press"))).status_code == 201
    exported = client.get("/api/workouts/export.csv").content
    before = snapshot(client)
    preview = upload(other_client, exported, preview=True).json()
    assert preview["workouts_to_create"] == 1
    assert preview["workouts_to_skip"] == 0
    assert preview["new_exercises"] == ["Owner Custom Press"]
    response = upload(other_client, exported)
    assert response.status_code == 201, response.text
    owner = client.get("/api/workouts").json()[0]
    imported = other_client.get("/api/workouts").json()[0]
    assert imported["id"] != owner["id"]
    assert imported["movements"][0]["exercise"]["id"] != owner["movements"][0]["exercise"]["id"]
    assert snapshot(client) == before


def test_commit_rechecks_duplicates_added_since_preview(client):
    content = csv_file(row())
    assert upload(client, content, preview=True).json()["workouts_to_create"] == 1
    assert upload(client, content).json()["workouts_created"] == 1
    response = upload(client, content)
    assert response.json()["workouts_created"] == 0
    assert response.json()["workouts_skipped"] == 1


def test_concurrent_imports_compare_and_save_in_one_transaction(client):
    content = csv_file(row())
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: upload(client, content), range(2)))
    assert [item.status_code for item in responses] == [201, 201]
    assert sorted(item.json()["workouts_created"] for item in responses) == [0, 1]
    assert len(client.get("/api/workouts").json()) == 1


def test_preview_and_commit_validate_current_limits_without_partial_writes(client, other_client):
    content = csv_file(row(exercise="Safety Test Press"), row(day="2026-07-18"))
    assert upload(other_client, content, preview=True).status_code == 200
    set_limits(client, workouts_per_account=1)
    before = snapshot(other_client)
    assert upload(other_client, content, preview=True).status_code == 422
    assert upload(other_client, content).status_code == 422
    assert snapshot(other_client) == before


def test_failure_after_pending_import_rolls_back_everything(client, monkeypatch):
    before = snapshot(client)

    def fail(*args):
        raise RuntimeError("test-only failure after imported rows were flushed")

    monkeypatch.setattr("app.tracker.rebuild_personal_records", fail)
    with pytest.raises(RuntimeError, match="test-only failure"):
        upload(client, csv_file(row(exercise="Safety Test Press")))
    assert snapshot(client) == before


@pytest.mark.parametrize(
    "invalid",
    [row(weight="nan"), row(weight="inf"), row(weight=-1), row(reps=-1), row(reps=1.5)],
)
def test_malformed_numbers_never_save_partial_data(client, invalid):
    before = snapshot(client)
    content = csv_file(row(exercise="Safety Test Press"), invalid)
    assert upload(client, content, preview=True).status_code == 422
    assert upload(client, content).status_code == 422
    assert snapshot(client) == before


def test_malformed_extra_columns_and_inconsistent_session_metadata_are_rejected(client):
    contents = [
        csv_file([*row(), "extra"]),
        csv_file([*row(), "shared", "Morning"], [*row(), "shared", "Evening"], sessions=True),
        csv_file([*row(), "shared", ""], [*row(day="2026-07-18"), "shared", ""], sessions=True),
    ]
    for content in contents:
        assert upload(client, content, preview=True).status_code == 422
        assert upload(client, content).status_code == 422
    assert client.get("/api/workouts").json() == []


def test_import_preserves_existing_imported_bodyweight_check_ins(client):
    assert upload(client, csv_file(row(bodyweight=84))).status_code == 201
    before = client.get("/api/body-measurements").json()
    result = upload(client, csv_file(row(weight=90, bodyweight=85)))
    assert result.json()["workouts_created"] == 1
    assert result.json()["body_measurements_updated"] == 0
    assert client.get("/api/body-measurements").json() == before


def test_export_and_duplicate_matching_ignore_uncompleted_suggested_sets(client, other_client):
    exercise = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Barbell Bench Press"
    )
    response = client.post(
        "/api/workouts",
        json={
            "name": "Workout with suggestions",
            "workout_date": "2026-07-17",
            "category": "push",
            "movements": [
                {
                    "exercise_id": exercise["id"],
                    "sets": [
                        {"weight_kg": 80, "reps": 8, "completed": True},
                        {"weight_kg": 80, "reps": 8, "completed": False},
                        {"weight_kg": 80, "reps": 8, "completed": False},
                    ],
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    exported = client.get("/api/workouts/export.csv").content
    assert len(list(csv.DictReader(StringIO(exported.decode("utf-8-sig"))))) == 1
    before = snapshot(client)
    assert upload(client, exported).json()["workouts_skipped"] == 1
    assert snapshot(client) == before
    result = upload(other_client, exported)
    assert result.status_code == 201, result.text
    imported = other_client.get("/api/workouts").json()[0]
    assert len(imported["movements"][0]["sets"]) == 1
    assert imported["movements"][0]["sets"][0]["completed"] is True
