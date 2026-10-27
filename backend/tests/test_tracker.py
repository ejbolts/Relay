from __future__ import annotations

import csv
from datetime import date, timedelta
from io import BytesIO, StringIO

import pytest
from PIL import Image
from pillow_heif import from_pillow


def workout_payload(exercise_id: str) -> dict:
    return {
        "name": "Friday push",
        "workout_date": date.today().isoformat(),
        "category": "push",
        "notes": "Strong session",
        "duration_minutes": 62,
        "movements": [
            {
                "exercise_id": exercise_id,
                "notes": "Pause on chest",
                "sets": [
                    {
                        "reps": 5,
                        "weight_kg": 100,
                        "rpe": 8.5,
                        "rest_seconds": 180,
                        "notes": "Moved cleanly",
                        "completed": True,
                    },
                    {
                        "reps": 5,
                        "weight_kg": 102.5,
                        "rpe": 9,
                        "rest_seconds": 180,
                        "notes": None,
                        "completed": True,
                    },
                ],
            }
        ],
    }


def test_workout_type_colors_can_be_saved_and_reloaded(client):
    response = client.get("/api/workout-type-colors")
    assert response.status_code == 200
    defaults = response.json()
    assert defaults["push"] == "#ef476f"
    assert len(defaults) == 7

    updated = {**defaults, "push": "#123ABC", "cardio": "#abcdef"}
    response = client.put("/api/workout-type-colors", json=updated)
    assert response.status_code == 200
    assert response.json() == updated
    assert client.get("/api/workout-type-colors").json() == updated

    invalid = client.put("/api/workout-type-colors", json={**updated, "push": "red"})
    assert invalid.status_code == 422
    assert client.get("/api/workout-type-colors").json() == updated


def test_default_exercise_library_is_seeded(client):
    response = client.get("/api/exercises")

    assert response.status_code == 200
    exercises = response.json()
    names = {item["name"] for item in exercises}
    assert {
        "Barbell Bench Press",
        "Back Squat",
        "Back Extension Machine",
        "Cable Shoulder Extensions",
        "Cycling (Indoor)",
        "Incline Treadmill Walking",
        "Machine Bicep Preacher Curl",
        "Pec Deck",
        "Running",
        "Seated Ab Crunch Machine",
        "Seated Leg Curl",
        "Seated Machine Row",
        "Single-Arm Cable Triceps Pushdown",
        "Single-Arm Lat Pulldown (Machine)",
        "Single-Arm Preacher Curl",
        "Single Leg Press",
        "Triceps Machine Extension",
        "Lying Leg Curl",
    } <= names
    assert "Leg Curl" not in names
    pec_deck = next(item for item in exercises if item["name"] == "Pec Deck")
    assert pec_deck["category"] == "push"
    assert pec_deck["muscle_group"] == "Chest"
    assert pec_deck["equipment"] == "Machine"
    indoor_cycling = next(item for item in exercises if item["name"] == "Cycling (Indoor)")
    assert indoor_cycling["category"] == "cardio"
    assert indoor_cycling["kind"] == "cardio"
    assert indoor_cycling["muscle_group"] == "Cardio"
    assert indoor_cycling["equipment"] == "Stationary Bike"
    shoulder_extensions = next(
        item for item in exercises if item["name"] == "Cable Shoulder Extensions"
    )
    assert shoulder_extensions["category"] == "pull"
    assert shoulder_extensions["muscle_group"] == "Rear Delts"
    assert shoulder_extensions["equipment"] == "Cable"
    assert shoulder_extensions["muscle_contributions"] == [
        {"muscle_name": "Rear deltoids", "role": "primary", "contribution_factor": 1.0}
    ]
    triceps_extension = next(
        item for item in exercises if item["name"] == "Triceps Machine Extension"
    )
    assert triceps_extension["category"] == "push"
    assert triceps_extension["muscle_group"] == "Triceps"
    assert triceps_extension["equipment"] == "Machine"
    assert triceps_extension["muscle_contributions"] == [
        {"muscle_name": "Triceps", "role": "primary", "contribution_factor": 1.0}
    ]
    single_arm_pushdown = next(
        item for item in exercises if item["name"] == "Single-Arm Cable Triceps Pushdown"
    )
    assert single_arm_pushdown["category"] == "push"
    assert single_arm_pushdown["muscle_group"] == "Triceps"
    assert single_arm_pushdown["equipment"] == "Cable"
    assert single_arm_pushdown["muscle_contributions"] == [
        {"muscle_name": "Triceps", "role": "primary", "contribution_factor": 1.0}
    ]
    single_arm_preacher = next(
        item for item in exercises if item["name"] == "Single-Arm Preacher Curl"
    )
    assert single_arm_preacher["category"] == "pull"
    assert single_arm_preacher["muscle_group"] == "Biceps"
    assert single_arm_preacher["equipment"] == "Dumbbell"
    assert single_arm_preacher["muscle_contributions"] == [
        {"muscle_name": "Biceps", "role": "primary", "contribution_factor": 1.0},
        {"muscle_name": "Forearms", "role": "secondary", "contribution_factor": 0.5},
    ]
    incline_press = next(item for item in exercises if item["name"] == "Incline Dumbbell Press")
    assert {item["muscle_name"] for item in incline_press["muscle_contributions"]} == {
        "Pectorals",
        "Front delts",
        "Triceps",
    }
    lateral_raise = next(item for item in exercises if item["name"] == "Lateral Raise")
    assert {item["muscle_name"] for item in lateral_raise["muscle_contributions"]} == {
        "Side delts",
        "Upper traps",
    }
    face_pull = next(item for item in exercises if item["name"] == "Face Pull")
    assert {item["muscle_name"] for item in face_pull["muscle_contributions"]} == {
        "Rear deltoids",
        "Mid / Upper Back",
    }
    hammer_curl = next(item for item in exercises if item["name"] == "Hammer Curl")
    assert {item["muscle_name"] for item in hammer_curl["muscle_contributions"]} == {
        "Biceps",
        "Forearms",
    }
    single_arm_lat_pulldown = next(
        item for item in exercises if item["name"] == "Single-Arm Lat Pulldown (Machine)"
    )
    assert single_arm_lat_pulldown["category"] == "pull"
    assert single_arm_lat_pulldown["muscle_group"] == "Lats"
    assert single_arm_lat_pulldown["equipment"] == "Machine"
    assert single_arm_lat_pulldown["muscle_contributions"] == [
        {"muscle_name": "Biceps", "role": "secondary", "contribution_factor": 0.5},
        {"muscle_name": "Forearms", "role": "secondary", "contribution_factor": 0.5},
        {"muscle_name": "Lats", "role": "primary", "contribution_factor": 1.0},
    ]
    seated_machine_row = next(item for item in exercises if item["name"] == "Seated Machine Row")
    assert seated_machine_row["category"] == "pull"
    assert seated_machine_row["muscle_group"] == "Mid / Upper Back"
    assert seated_machine_row["equipment"] == "Machine"
    seated_machine_row_contributions = {
        contribution["muscle_name"]: contribution
        for contribution in seated_machine_row["muscle_contributions"]
    }
    assert seated_machine_row_contributions == {
        "Forearms": {"muscle_name": "Forearms", "role": "secondary", "contribution_factor": 0.5},
        "Mid / Upper Back": {
            "muscle_name": "Mid / Upper Back",
            "role": "primary",
            "contribution_factor": 1.0,
        },
        "Lats": {"muscle_name": "Lats", "role": "primary", "contribution_factor": 1.0},
        "Rear deltoids": {
            "muscle_name": "Rear deltoids",
            "role": "secondary",
            "contribution_factor": 0.5,
        },
        "Biceps": {
            "muscle_name": "Biceps",
            "role": "secondary",
            "contribution_factor": 0.5,
        },
    }
    seated_ab_crunch = next(
        item for item in exercises if item["name"] == "Seated Ab Crunch Machine"
    )
    assert seated_ab_crunch["category"] == "full_body"
    assert seated_ab_crunch["muscle_group"] == "Core"
    assert seated_ab_crunch["equipment"] == "Machine"
    assert seated_ab_crunch["muscle_contributions"] == [
        {"muscle_name": "Core", "role": "primary", "contribution_factor": 1.0}
    ]
    machine_preacher_curl = next(
        item for item in exercises if item["name"] == "Machine Bicep Preacher Curl"
    )
    assert machine_preacher_curl["category"] == "pull"
    assert machine_preacher_curl["muscle_group"] == "Biceps"
    assert machine_preacher_curl["equipment"] == "Machine"
    assert machine_preacher_curl["muscle_contributions"] == [
        {"muscle_name": "Biceps", "role": "primary", "contribution_factor": 1.0},
        {"muscle_name": "Forearms", "role": "secondary", "contribution_factor": 0.5},
    ]
    single_leg_press = next(item for item in exercises if item["name"] == "Single Leg Press")
    assert single_leg_press["category"] == "lower"
    assert single_leg_press["muscle_group"] == "Quads"
    assert single_leg_press["equipment"] == "Machine"
    assert {
        contribution["muscle_name"]: contribution
        for contribution in single_leg_press["muscle_contributions"]
    } == {
        "Quadriceps": {
            "muscle_name": "Quadriceps",
            "role": "primary",
            "contribution_factor": 1.0,
        },
        "Glutes": {"muscle_name": "Glutes", "role": "primary", "contribution_factor": 1.0},
        "Adductors": {
            "muscle_name": "Adductors",
            "role": "secondary",
            "contribution_factor": 0.5,
        },
    }
    for leg_curl_name in ("Seated Leg Curl", "Lying Leg Curl"):
        leg_curl = next(item for item in exercises if item["name"] == leg_curl_name)
        assert leg_curl["category"] == "lower"
        assert leg_curl["muscle_group"] == "Hamstrings"
        assert leg_curl["equipment"] == "Machine"
        assert leg_curl["muscle_contributions"] == [
            {"muscle_name": "Calves", "role": "secondary", "contribution_factor": 0.5},
            {
                "muscle_name": "Hamstrings",
                "role": "primary",
                "contribution_factor": 1.0,
            },
        ]
    back_extension = next(item for item in exercises if item["name"] == "Back Extension Machine")
    assert back_extension["category"] == "lower"
    assert back_extension["muscle_group"] == "Lower Back"
    assert back_extension["equipment"] == "Machine"
    assert {
        contribution["muscle_name"]: contribution
        for contribution in back_extension["muscle_contributions"]
    } == {
        "Spinal erectors": {
            "muscle_name": "Spinal erectors",
            "role": "primary",
            "contribution_factor": 1.0,
        },
        "Glutes": {"muscle_name": "Glutes", "role": "secondary", "contribution_factor": 0.5},
        "Hamstrings": {
            "muscle_name": "Hamstrings",
            "role": "primary",
            "contribution_factor": 1.0,
        },
    }
    assert next(item for item in exercises if item["name"] == "Barbell Row")["muscle_group"] == (
        "Mid / Upper Back"
    )
    assert (
        next(item for item in exercises if item["name"] == "Lat Pulldown")["muscle_group"] == "Lats"
    )
    recommendation = client.get("/api/dashboard").json()["recommendation"]
    assert recommendation["category"] == "push"
    assert recommendation["rotation_next"] == "push"


def test_default_muscle_mappings_are_resynchronized(client):
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.database import SessionLocal
    from app.models import Exercise, MuscleRole
    from app.training_metrics import seed_muscle_mappings

    with SessionLocal() as db:
        exercise = db.scalar(
            select(Exercise)
            .where(Exercise.name == "Back Extension Machine")
            .options(selectinload(Exercise.muscle_contributions))
        )
        assert exercise is not None
        hamstrings = next(
            item for item in exercise.muscle_contributions if item.muscle_name == "Hamstrings"
        )
        hamstrings.role = MuscleRole.SECONDARY
        hamstrings.contribution_factor = 0.5
        db.commit()
        seed_muscle_mappings(db, client.user["id"])

    updated = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Back Extension Machine"
    )
    hamstrings = next(
        item for item in updated["muscle_contributions"] if item["muscle_name"] == "Hamstrings"
    )
    assert hamstrings == {
        "muscle_name": "Hamstrings",
        "role": "primary",
        "contribution_factor": 1.0,
    }


def test_legacy_leg_curl_is_renamed_without_changing_its_id(client):
    from sqlalchemy import select

    from app.database import SessionLocal
    from app.models import Exercise
    from app.tracker import seed_default_exercises

    with SessionLocal() as db:
        exercise = db.scalar(select(Exercise).where(Exercise.name == "Seated Leg Curl"))
        assert exercise is not None
        original_id = exercise.id
        exercise.name = "Leg Curl"
        db.commit()

        seed_default_exercises(db, client.user["id"])

        renamed = db.scalar(select(Exercise).where(Exercise.name == "Seated Leg Curl"))
        assert renamed is not None
        assert renamed.id == original_id
        assert db.scalar(select(Exercise).where(Exercise.name == "Leg Curl")) is None


def test_legacy_single_arm_lat_pulldown_is_renamed_without_changing_its_id(client):
    from sqlalchemy import select

    from app.database import SessionLocal
    from app.models import Exercise
    from app.tracker import seed_default_exercises

    with SessionLocal() as db:
        exercise = db.scalar(
            select(Exercise).where(Exercise.name == "Single-Arm Lat Pulldown (Machine)")
        )
        assert exercise is not None
        original_id = exercise.id
        exercise.name = "Single-Arm Lat Pulldown"
        exercise.equipment = "Cable"
        db.commit()

        seed_default_exercises(db, client.user["id"])

        renamed = db.scalar(
            select(Exercise).where(Exercise.name == "Single-Arm Lat Pulldown (Machine)")
        )
        assert renamed is not None
        assert renamed.id == original_id
        assert renamed.equipment == "Machine"
        assert db.scalar(select(Exercise).where(Exercise.name == "Single-Arm Lat Pulldown")) is None


def test_exercise_favorites_are_persisted(client):
    exercise = client.get("/api/exercises").json()[0]
    assert exercise["is_favorite"] is False

    updated = client.patch(f"/api/exercises/{exercise['id']}/favorite", json={"is_favorite": True})

    assert updated.status_code == 200
    assert updated.json()["is_favorite"] is True
    persisted = next(
        item for item in client.get("/api/exercises").json() if item["id"] == exercise["id"]
    )
    assert persisted["is_favorite"] is True


def test_workout_sets_notes_rest_and_rpe_are_saved(client):
    exercise = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Barbell Bench Press"
    )

    response = client.post("/api/workouts", json=workout_payload(exercise["id"]))

    assert response.status_code == 201
    workout = response.json()
    assert workout["category"] == "push"
    assert workout["movements"][0]["sets"][0] == {
        "id": workout["movements"][0]["sets"][0]["id"],
        "order_index": 0,
        "reps": 5,
        "weight_kg": 100.0,
        "rpe": 8.5,
        "rest_seconds": 180,
        "duration_seconds": None,
        "distance_km": None,
        "calories_kcal": None,
        "average_heart_rate_bpm": None,
        "incline_percent": None,
        "speed_kph": None,
        "bodyweight_kg": None,
        "percentile": None,
        "warmup": False,
        "set_type": "normal",
        "failed": False,
        "target_reps": None,
        "notes": "Moved cleanly",
        "completed": True,
    }


@pytest.mark.parametrize("end_time,duration", [("00:30", 60), ("00:45", 75)])
def test_previous_workout_times_can_be_edited_and_recalculate_duration(client, end_time, duration):
    exercise = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Barbell Bench Press"
    )
    payload = workout_payload(exercise["id"])
    payload["workout_date"] = "2026-10-27"
    created = client.post("/api/workouts", json=payload)
    assert created.status_code == 201
    assert created.json()["start_time"] is None
    assert created.json()["end_time"] is None

    payload.update({"start_time": "23:30", "end_time": end_time, "duration_minutes": 1})
    updated = client.put(f"/api/workouts/{created.json()['id']}", json=payload)

    assert updated.status_code == 200
    assert updated.json()["start_time"] == "23:30:00"
    assert updated.json()["end_time"] == f"{end_time}:00"
    assert updated.json()["duration_minutes"] == duration
    assert updated.json()["workout_date"] == "2026-10-27"
    calendar = client.get("/api/calendar?start=2026-10-27&end=2026-10-28").json()
    assert len(calendar) == 1
    assert calendar[0]["workout_date"] == "2026-10-27"


def test_workout_start_and_end_times_must_be_provided_together(client):
    exercise = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Barbell Bench Press"
    )
    payload = workout_payload(exercise["id"])
    payload["start_time"] = "09:00"

    response = client.post("/api/workouts", json=payload)

    assert response.status_code == 422
    assert "start and end times" in response.text


def test_treadmill_incline_and_speed_are_saved(client):
    exercise = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Incline Treadmill Walking"
    )
    payload = workout_payload(exercise["id"])
    payload["category"] = "cardio"
    payload["movements"][0]["sets"][0].update(
        {
            "reps": None,
            "weight_kg": None,
            "duration_seconds": 1_800,
            "distance_km": 2.7,
            "incline_percent": 12.5,
            "speed_kph": 5.4,
        }
    )

    response = client.post("/api/workouts", json=payload)

    assert response.status_code == 201
    saved_set = response.json()["movements"][0]["sets"][0]
    assert saved_set["incline_percent"] == 12.5
    assert saved_set["speed_kph"] == 5.4


def test_body_measurements_are_upserted_and_used_in_calendar_workouts(client):
    created = client.post(
        "/api/body-measurements",
        json={
            "measurement_date": "2026-07-17",
            "weight_kg": 88,
            "body_fat_pct": 18.5,
            "notes": "Morning check-in",
        },
    )
    exercise = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Barbell Bench Press"
    )
    assert client.post("/api/workouts", json=workout_payload(exercise["id"])).status_code == 201

    day = client.get("/api/dashboard").json()["heatmap"][0]
    assert created.status_code == 200
    assert day["workouts"][0]["exercises"][0]["bodyweight_kg"] == 88

    updated = client.post(
        "/api/body-measurements",
        json={
            "measurement_date": "2026-07-17",
            "weight_kg": 87.6,
            "body_fat_pct": 18.1,
            "notes": None,
        },
    )
    measurements = client.get("/api/body-measurements").json()
    assert updated.json()["id"] == created.json()["id"]
    assert len(measurements) == 1
    assert measurements[0]["weight_kg"] == 87.6
    assert client.delete(f"/api/body-measurements/{measurements[0]['id']}").status_code == 204


def test_body_measurement_csv_import_updates_dates_and_exports_history(client):
    existing = client.post(
        "/api/body-measurements",
        json={
            "measurement_date": "2026-07-17",
            "weight_kg": 88,
            "body_fat_pct": 18.5,
            "notes": "Original",
        },
    ).json()
    content = (
        "Date,Weight (kg),Body Fat (%),Notes\n"
        '2026-07-17,87.4,18,"Updated, morning"\n'
        "2026-07-18,87.1,,Evening check-in\n"
    )

    imported = client.post(
        "/api/body-measurements/import",
        files={"file": ("body-weight.csv", content.encode(), "text/csv")},
    )

    assert imported.status_code == 201
    assert imported.json() == {
        "measurements_created": 1,
        "measurements_updated": 1,
        "rows_imported": 2,
    }
    measurements = client.get("/api/body-measurements").json()
    assert [item["measurement_date"] for item in measurements] == ["2026-07-18", "2026-07-17"]
    updated = measurements[1]
    assert updated["id"] == existing["id"]
    assert updated["weight_kg"] == 87.4
    assert updated["body_fat_pct"] == 18
    assert updated["notes"] == "Updated, morning"
    assert updated["is_sample"] is False

    exported = client.get("/api/body-measurements/export.csv")
    rows = list(csv.DictReader(StringIO(exported.content.decode("utf-8-sig"))))
    assert exported.status_code == 200
    assert "body-weight-" in exported.headers["content-disposition"]
    assert rows == [
        {
            "Date": "2026-07-17",
            "Weight (kg)": "87.4",
            "Body Fat (%)": "18",
            "Notes": "Updated, morning",
        },
        {
            "Date": "2026-07-18",
            "Weight (kg)": "87.1",
            "Body Fat (%)": "",
            "Notes": "Evening check-in",
        },
    ]


def test_body_measurement_csv_rejects_duplicate_dates_without_partial_import(client):
    content = (
        "Date,Weight (kg),Body Fat (%),Notes\n2026-07-17,87.4,,Morning\n2026-07-17,87.2,,Evening\n"
    )

    imported = client.post(
        "/api/body-measurements/import",
        files={"file": ("body-weight.csv", content.encode(), "text/csv")},
    )

    assert imported.status_code == 422
    assert "appears more than once" in imported.json()["error"]["message"]
    assert client.get("/api/body-measurements").json() == []


def test_progress_keeps_reps_and_rpe_paired_with_the_heaviest_set(client):
    bench = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Barbell Bench Press"
    )
    payload = workout_payload(bench["id"])
    payload["movements"][0]["sets"] = [
        {"weight_kg": 100, "reps": 10, "rpe": 8, "completed": True},
        {"weight_kg": 105, "reps": 5, "rpe": 9, "completed": True},
        {"weight_kg": 105, "reps": 6, "rpe": 9.5, "completed": True},
    ]
    assert client.post("/api/workouts", json=payload).status_code == 201

    progress = client.get(f"/api/progress/{bench['id']}").json()
    [point] = progress["points"]
    assert (point["best_weight_kg"], point["best_reps"], point["best_rpe"]) == (105, 6, 9.5)
    # Estimated 1RM remains independently calculated from the strongest estimate, 100 x 10.
    assert point["estimated_1rm"] == 133.3
    assert point["volume_kg"] == 2155


def test_dashboard_and_progress_reflect_completed_workout(client):
    exercise = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Barbell Bench Press"
    )
    created = client.post("/api/workouts", json=workout_payload(exercise["id"]))
    assert created.status_code == 201

    dashboard = client.get("/api/dashboard")
    progress = client.get(f"/api/progress/{exercise['id']}")

    assert dashboard.status_code == 200
    assert dashboard.json()["sets_this_week"] == 2
    assert dashboard.json()["volume_this_week_kg"] == 1012.5
    assert dashboard.json()["heatmap"][0]["categories"] == ["push"]
    assert dashboard.json()["weekly_days"][0]["total_sets"] == 2
    assert dashboard.json()["weekly_days"][0]["exercises"][0] == {
        "exercise_id": exercise["id"],
        "exercise_name": "Barbell Bench Press",
        "muscle_group": "Chest",
        "category": "push",
        "set_count": 2,
        "volume_kg": 1012.5,
    }
    assert dashboard.json()["recommendation"]["category"] == "pull"
    assert dashboard.json()["recommendation"]["rotation_next"] == "pull"
    assert progress.status_code == 200
    assert progress.json()["personal_best_weight_kg"] == 102.5
    assert progress.json()["points"][0]["estimated_1rm"] == 119.6


def test_workout_snapshot_revision_changes_after_mutations(client):
    exercise = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Barbell Bench Press"
    )
    initial_revision = client.get("/api/workouts/revision")
    initial_snapshot = client.get("/api/workouts/snapshot")

    created = client.post("/api/workouts", json=workout_payload(exercise["id"]))
    changed_revision = client.get("/api/workouts/revision")
    changed_snapshot = client.get("/api/workouts/snapshot")

    assert initial_revision.status_code == 200
    assert initial_snapshot.json() == {
        "revision": initial_revision.json()["revision"],
        "workouts": [],
    }
    assert created.status_code == 201
    assert changed_revision.status_code == 200
    assert changed_revision.json()["revision"] != initial_revision.json()["revision"]
    assert changed_snapshot.json()["revision"] == changed_revision.json()["revision"]
    assert [workout["id"] for workout in changed_snapshot.json()["workouts"]] == [
        created.json()["id"]
    ]

    assert client.delete(f"/api/workouts/{created.json()['id']}").status_code == 204
    deleted_revision = client.get("/api/workouts/revision").json()["revision"]
    assert deleted_revision != changed_revision.json()["revision"]
    assert client.get("/api/workouts/snapshot").json() == {
        "revision": deleted_revision,
        "workouts": [],
    }


def test_workout_requires_a_completed_set(client):
    exercise = client.get("/api/exercises").json()[0]
    payload = workout_payload(exercise["id"])
    for item in payload["movements"][0]["sets"]:
        item["completed"] = False

    response = client.post("/api/workouts", json=payload)

    assert response.status_code == 422


def test_csv_import_and_export_use_supplied_column_format(client):
    content = (
        "Date Lifted\tExercise\tWeight (kg)\tWeight (lb)\tReps\tBodyweight (kg)\t"
        "Bodyweight (lb)\tPercentile (%)\tWarmup\n"
        "2026-07-17\tMachine Reverse Fly\t45\t99.2\t10\t83.6\t184.3\t38\t1\n"
        "2026-07-17\tMachine Reverse Fly\t51\t112.4\t10\t83.6\t184.3\t48.7\t0\n"
    )

    imported = client.post(
        "/api/workouts/import",
        files={"file": ("workouts.tsv", content.encode(), "text/tab-separated-values")},
    )
    exported = client.get("/api/workouts/export.csv")

    assert imported.status_code == 201
    assert imported.json() == {
        "workouts_created": 1,
        "workouts_skipped": 0,
        "exercises_created": 1,
        "sets_imported": 2,
        "body_measurements_created": 1,
        "body_measurements_updated": 0,
        "warnings": [
            "Rows without a Workout ID are grouped into one session per date, so separate "
            "morning and evening workouts on one date are combined.",
        ],
    }
    imported_exercise = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Machine Reverse Fly"
    )
    assert imported_exercise["muscle_group"] == "Rear Delts"
    workout = client.get("/api/workouts").json()[0]
    assert workout["category"] == "pull"
    progress = client.get(f"/api/progress/{imported_exercise['id']}").json()
    assert [point["workout_date"] for point in progress["points"]] == ["2026-07-17"]
    assert progress["points"][0]["best_weight_kg"] == 51
    measurement = client.get("/api/body-measurements").json()[0]
    assert measurement["measurement_date"] == "2026-07-17"
    assert measurement["weight_kg"] == 83.6
    assert measurement["notes"] == "Imported from workout CSV."
    assert exported.status_code == 200
    decoded = exported.content.decode("utf-8-sig")
    assert decoded.splitlines()[0] == (
        "Date Lifted,Exercise,Weight (kg),Weight (lb),Reps,Bodyweight (kg),"
        "Bodyweight (lb),Percentile (%),Warmup,Workout ID,Workout name,"
        "Workout type,Workout type color"
    )
    assert "2026-07-17,Machine Reverse Fly,45,99.2,10,83.6,184.3,38,1" in decoded


def test_csv_import_uses_logger_category_pattern_and_strength_history(client):
    content = (
        "Date Lifted,Exercise,Weight (kg),Weight (lb),Reps,Bodyweight (kg),"
        "Bodyweight (lb),Percentile (%),Warmup\n"
        "2026-06-01,Bench Press,80,,8,84,,,0\n"
        "2026-06-01,Lat Pulldown,70,,10,84,,,0\n"
        "2026-06-02,Machine Seated Crunch,45,,12,83.8,,,0\n"
    )

    imported = client.post(
        "/api/workouts/import",
        files={"file": ("workouts.csv", content.encode(), "text/csv")},
    )

    assert imported.status_code == 201
    assert imported.json()["body_measurements_created"] == 2
    workouts = client.get("/api/workouts").json()
    assert [(item["workout_date"], item["category"]) for item in workouts] == [
        ("2026-06-02", "full_body"),
        ("2026-06-01", "upper"),
    ]
    crunch = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Seated Ab Crunch Machine"
    )
    assert crunch["kind"] == "strength"
    assert crunch["category"] == "full_body"
    assert (
        client.get(f"/api/progress/{crunch['id']}").json()["points"][0]["workout_date"]
        == "2026-06-02"
    )


def test_workout_csv_bodyweight_does_not_replace_a_manual_check_in(client):
    saved = client.post(
        "/api/body-measurements",
        json={
            "measurement_date": "2026-06-01",
            "weight_kg": 84.5,
            "body_fat_pct": 16,
            "notes": "Morning check-in",
        },
    )
    content = (
        "Date Lifted,Exercise,Weight (kg),Weight (lb),Reps,Bodyweight (kg),"
        "Bodyweight (lb),Percentile (%),Warmup\n"
        "2026-06-01,Bench Press,80,,8,84,,,0\n"
    )

    imported = client.post(
        "/api/workouts/import",
        files={"file": ("workouts.csv", content.encode(), "text/csv")},
    )
    measurement = client.get("/api/body-measurements").json()[0]

    assert saved.status_code == 200
    assert imported.status_code == 201
    assert imported.json()["body_measurements_created"] == 0
    assert imported.json()["body_measurements_updated"] == 0
    assert measurement["weight_kg"] == 84.5
    assert measurement["body_fat_pct"] == 16
    assert measurement["notes"] == "Morning check-in"


def test_workout_history_returns_every_imported_workout(client):
    header = (
        "Date Lifted,Exercise,Weight (kg),Weight (lb),Reps,Bodyweight (kg),"
        "Bodyweight (lb),Percentile (%),Warmup"
    )
    first_date = date(2024, 1, 1)
    rows = [
        f"{(first_date + timedelta(days=offset)).isoformat()},Back Squat,100,,5,,,,0"
        for offset in range(101)
    ]

    imported = client.post(
        "/api/workouts/import",
        files={"file": ("workouts.csv", "\n".join([header, *rows]).encode(), "text/csv")},
    )
    workouts = client.get("/api/workouts")

    assert imported.status_code == 201
    assert imported.json()["workouts_created"] == 101
    assert workouts.status_code == 200
    assert len(workouts.json()) == 101
    assert workouts.json()[0]["workout_date"] == "2024-04-10"
    assert workouts.json()[-1]["workout_date"] == "2024-01-01"


def test_sample_seed_creates_one_week_once(client):
    from app.database import SessionLocal
    from app.tracker_seed import seed_sample_body_measurements, seed_sample_workouts

    user_id = client.user["id"]
    with SessionLocal() as db:
        assert seed_sample_workouts(db, user_id) == 5
        assert seed_sample_workouts(db, user_id) == 0
        assert seed_sample_body_measurements(db, user_id) == 3
        assert seed_sample_body_measurements(db, user_id) == 0

    workouts = client.get("/api/workouts").json()
    assert len(workouts) == 5
    assert all(item["is_sample"] for item in workouts)
    assert len({item["workout_date"] for item in workouts}) == 4

    today = max(item["workout_date"] for item in workouts)
    today_heatmap = next(
        item
        for item in client.get("/api/dashboard").json()["heatmap"]
        if item["workout_date"] == today
    )
    assert today_heatmap["categories"] == ["upper", "cardio"]
    assert today < date.today().isoformat()
    recommendation = client.get("/api/dashboard").json()["recommendation"]
    assert recommendation["rotation_next"] == "push"
    assert recommendation["category"] in {"push", "lower"}

    assert client.delete("/api/sample-data").status_code == 204
    with SessionLocal() as db:
        assert seed_sample_workouts(db, user_id) == 0
    assert client.get("/api/workouts").json() == []


def test_machine_photos_are_processed_pinned_and_protected_while_referenced(client):
    exercise = next(
        item for item in client.get("/api/exercises").json() if item["name"] == "Seated Leg Curl"
    )
    image_buffer = BytesIO()
    source = Image.new("RGB", (1200, 2400), "#e86f35")
    exif = source.getexif()
    exif[274] = 6  # Rotate a portrait sensor image into landscape display orientation.
    source.save(image_buffer, format="JPEG", exif=exif)

    uploaded = client.post(
        f"/api/exercises/{exercise['id']}/machine-photos",
        data={"caption": "Hammer Strength lying leg curl"},
        files={"file": ("../../machine.jpg", image_buffer.getvalue(), "image/jpeg")},
    )

    assert uploaded.status_code == 201
    photo = uploaded.json()
    assert photo["caption"] == "Hammer Strength lying leg curl"
    assert (photo["width"], photo["height"]) == (1800, 900)
    assert photo["thumbnail_url"].endswith("variant=thumbnail")
    assert client.get(f"/api/exercises/{exercise['id']}/machine-photos").json() == [
        {**photo, "exercise_name": "Seated Leg Curl", "workout_count": 0, "last_used_date": None}
    ]
    assert client.get(f"/api/exercises/{exercise['id']}/machine-photos/last-used").json() == []

    full = client.get(photo["full_url"])
    thumbnail = client.get(photo["thumbnail_url"])
    assert full.status_code == thumbnail.status_code == 200
    assert full.headers["content-type"] == "image/webp"
    with Image.open(BytesIO(full.content)) as decoded_full:
        assert decoded_full.size == (1800, 900)
        assert decoded_full.format == "WEBP"
    with Image.open(BytesIO(thumbnail.content)) as decoded_thumbnail:
        assert max(decoded_thumbnail.size) == 360

    renamed = client.patch(
        f"/api/machine-photos/{photo['id']}",
        json={"caption": "Life Fitness lying leg curl"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["caption"] == "Life Fitness lying leg curl"

    payload = workout_payload(exercise["id"])
    payload["movements"][0]["machine_photo_ids"] = [photo["id"]]
    workout = client.post("/api/workouts", json=payload)
    assert workout.status_code == 201
    assert workout.json()["movements"][0]["machine_photos"][0]["id"] == photo["id"]
    assert client.get(f"/api/exercises/{exercise['id']}/machine-photos/last-used").json() == [
        renamed.json()
    ]

    updated = client.put(f"/api/workouts/{workout.json()['id']}", json=payload)
    assert updated.status_code == 200
    assert updated.json()["movements"][0]["machine_photos"][0]["id"] == photo["id"]
    assert client.delete(f"/api/machine-photos/{photo['id']}").status_code == 409

    second_buffer = BytesIO()
    Image.new("RGB", (800, 600), "#293d6b").save(second_buffer, format="JPEG")
    second_photo = client.post(
        f"/api/exercises/{exercise['id']}/machine-photos",
        data={"caption": "Technogym seated leg curl"},
        files={"file": ("technogym.jpg", second_buffer.getvalue(), "image/jpeg")},
    ).json()
    next_payload = workout_payload(exercise["id"])
    next_payload["workout_date"] = (date.today() + timedelta(days=1)).isoformat()
    next_payload["movements"][0]["machine_photo_ids"] = [second_photo["id"]]
    next_workout = client.post("/api/workouts", json=next_payload)
    assert next_workout.status_code == 201
    assert client.get(f"/api/exercises/{exercise['id']}/machine-photos/last-used").json() == [
        second_photo
    ]

    assert client.delete(f"/api/workouts/{next_workout.json()['id']}").status_code == 204
    assert client.get(f"/api/exercises/{exercise['id']}/machine-photos/last-used").json() == [
        renamed.json()
    ]
    assert client.delete(f"/api/workouts/{workout.json()['id']}").status_code == 204
    assert client.get(f"/api/exercises/{exercise['id']}/machine-photos/last-used").json() == []
    assert client.delete(f"/api/machine-photos/{second_photo['id']}").status_code == 204
    assert client.delete(f"/api/machine-photos/{photo['id']}").status_code == 204
    assert client.get(photo["full_url"]).status_code == 404


def upload_machine_photo(client, exercise_id: str, caption: str, color: str) -> dict:
    image_buffer = BytesIO()
    Image.new("RGB", (64, 48), color).save(image_buffer, format="JPEG")
    response = client.post(
        f"/api/exercises/{exercise_id}/machine-photos",
        data={"caption": caption},
        files={"file": ("machine.jpg", image_buffer.getvalue(), "image/jpeg")},
    )
    assert response.status_code == 201
    return response.json()


def test_machine_history_finds_the_last_session_on_one_machine_across_gyms(client, other_client):
    exercises = client.get("/api/exercises").json()
    leg_press = next(item for item in exercises if item["name"] == "Leg Press")
    bench = next(item for item in exercises if item["name"] == "Barbell Bench Press")
    home_gym = upload_machine_photo(client, leg_press["id"], "Home gym Hammer press", "#e86f35")
    travel_gym = upload_machine_photo(client, leg_press["id"], "Travel gym Cybex press", "#293d6b")
    unused = upload_machine_photo(client, bench["id"], "Unused bench", "#111111")
    today = date.today()

    def log(days_ago: int, photo_ids: list[str], weight: float) -> dict:
        payload = workout_payload(leg_press["id"])
        payload["workout_date"] = (today - timedelta(days=days_ago)).isoformat()
        payload["movements"][0]["machine_photo_ids"] = photo_ids
        payload["movements"][0]["sets"][0]["weight_kg"] = weight
        response = client.post("/api/workouts", json=payload)
        assert response.status_code == 201
        return response.json()

    # A year ago at the home gym, then many leg press sessions elsewhere since.
    home_last = log(365, [home_gym["id"]], 180)
    log(400, [home_gym["id"]], 170)
    travel_sessions = [log(days_ago, [travel_gym["id"]], 140) for days_ago in (200, 90, 30, 1)]
    log(10, [], 150)

    history = client.get(f"/api/machine-photos/{home_gym['id']}/workouts")
    assert history.status_code == 200
    home_workouts = history.json()
    assert [item["workout_date"] for item in home_workouts] == [
        (today - timedelta(days=365)).isoformat(),
        (today - timedelta(days=400)).isoformat(),
    ]
    assert home_workouts[0]["id"] == home_last["id"]
    assert home_workouts[0]["movements"][0]["sets"][0]["weight_kg"] == 180
    assert home_workouts[0]["movements"][0]["machine_photos"][0]["id"] == home_gym["id"]
    assert [
        item["id"] for item in client.get(f"/api/machine-photos/{travel_gym['id']}/workouts").json()
    ] == [item["id"] for item in reversed(travel_sessions)]
    assert client.get(f"/api/machine-photos/{unused['id']}/workouts").json() == []

    machines = client.get("/api/machine-photos")
    assert machines.status_code == 200
    summary = {
        item["caption"]: (item["exercise_name"], item["workout_count"], item["last_used_date"])
        for item in machines.json()
    }
    assert summary == {
        "Travel gym Cybex press": ("Leg Press", 4, (today - timedelta(days=1)).isoformat()),
        "Home gym Hammer press": ("Leg Press", 2, (today - timedelta(days=365)).isoformat()),
        "Unused bench": ("Barbell Bench Press", 0, None),
    }
    assert [item["caption"] for item in machines.json()] == [
        "Travel gym Cybex press",
        "Home gym Hammer press",
        "Unused bench",
    ]
    per_exercise = client.get(f"/api/exercises/{leg_press['id']}/machine-photos").json()
    assert {item["caption"]: item["workout_count"] for item in per_exercise} == {
        "Travel gym Cybex press": 4,
        "Home gym Hammer press": 2,
    }

    # A workout using both machines counts once for each, and editing it away updates history.
    both = log(5, [home_gym["id"], travel_gym["id"]], 160)
    assert (
        client.get(f"/api/machine-photos/{home_gym['id']}/workouts").json()[0]["id"] == both["id"]
    )
    unpinned = workout_payload(leg_press["id"])
    unpinned["workout_date"] = both["workout_date"]
    assert client.put(f"/api/workouts/{both['id']}", json=unpinned).status_code == 200
    assert (
        client.get(f"/api/machine-photos/{home_gym['id']}/workouts").json()[0]["id"]
        == (home_last["id"])
    )

    # Another account cannot read or enumerate these machines.
    assert other_client.get(f"/api/machine-photos/{home_gym['id']}/workouts").status_code == 404
    assert other_client.get("/api/machine-photos").json() == []


def test_machine_photo_rejects_invalid_images_and_cross_exercise_pins(client):
    exercises = client.get("/api/exercises").json()
    bench = next(item for item in exercises if item["name"] == "Barbell Bench Press")
    squat = next(item for item in exercises if item["name"] == "Back Squat")
    invalid = client.post(
        f"/api/exercises/{bench['id']}/machine-photos",
        data={"caption": "Not really a machine"},
        files={"file": ("fake.jpg", b"not an image", "image/jpeg")},
    )
    assert invalid.status_code == 422

    image_buffer = BytesIO()
    Image.new("RGB", (50, 50), "black").save(image_buffer, format="PNG")
    photo = client.post(
        f"/api/exercises/{bench['id']}/machine-photos",
        data={"caption": "Bench station"},
        files={"file": ("bench.png", image_buffer.getvalue(), "image/png")},
    ).json()
    payload = workout_payload(squat["id"])
    payload["movements"][0]["machine_photo_ids"] = [photo["id"]]
    response = client.post("/api/workouts", json=payload)
    assert response.status_code == 422
    assert "must belong" in response.json()["error"]["message"]


def test_iphone_heic_machine_photo_is_accepted_and_converted_to_webp(client):
    exercise = next(
        item for item in client.get("/api/exercises").json() if item["name"] == "Leg Press"
    )
    heic_buffer = BytesIO()
    from_pillow(Image.new("RGB", (800, 1200), "#263242")).save(heic_buffer)

    uploaded = client.post(
        f"/api/exercises/{exercise['id']}/machine-photos",
        data={"caption": "Life Fitness leg press"},
        files={"file": ("IMG_1234.HEIC", heic_buffer.getvalue(), "image/heic")},
    )

    assert uploaded.status_code == 201
    image = client.get(uploaded.json()["full_url"])
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/webp"
    with Image.open(BytesIO(image.content)) as decoded:
        assert decoded.format == "WEBP"
        assert decoded.size == (800, 1200)


def test_dashboard_tracks_rpe_aware_weekly_sets_by_muscle_without_targets(client):
    exercise = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Barbell Bench Press"
    )
    payload = workout_payload(exercise["id"])
    payload["movements"][0]["sets"] = [
        {"reps": 8, "weight_kg": 80, "rpe": 8, "completed": True},
        {"reps": 8, "weight_kg": 80, "rpe": 6, "completed": True},
        {"reps": 8, "weight_kg": 80, "rpe": None, "completed": True},
        {"reps": 5, "weight_kg": 20, "rpe": 8, "warmup": True, "completed": True},
    ]
    assert client.post("/api/workouts", json=payload).status_code == 201

    dashboard = client.get("/api/dashboard").json()
    weekly_sets = dashboard["weekly_sets"]
    assert "training_mode" not in dashboard
    assert "weekly_goal" not in dashboard
    assert weekly_sets["raw_sets"] == 3
    assert weekly_sets["effective_sets"] == 4
    assert weekly_sets["unrated_sets"] == 1
    assert weekly_sets["low_rpe_sets"] == 1
    assert weekly_sets["rpe_logging_percent"] == 66.7
    assert {
        item["muscle_group"]: item["effective_sets"] for item in weekly_sets["muscle_groups"]
    } == {
        "Front delts": 1.0,
        "Pectorals": 2.0,
        "Triceps": 1.0,
    }
    assert {item["muscle_group"]: item["raw_sets"] for item in weekly_sets["muscle_groups"]} == {
        "Front delts": 1.5,
        "Pectorals": 3.0,
        "Triceps": 1.5,
    }
    assert all("target_sets" not in item for item in weekly_sets["muscle_groups"])
    assert "goal" not in dashboard["recommendation"]["reason"].lower()

    paths = client.app.openapi()["paths"]
    assert "/api/training-mode" not in paths
    assert "/api/training-phases" not in paths


def test_active_body_weight_goal_has_no_training_mode(client):
    created = client.post(
        "/api/body-weight-goals",
        json={
            "start_date": "2026-07-30",
            "target_date": "2026-12-30",
            "start_weight_kg": 100,
            "target_weight_kg": 92,
            "active": True,
        },
    )

    assert created.status_code == 201
    assert created.json()["target_weight_kg"] == 92
    assert "mode" not in created.json()
    assert "mode" not in client.get("/api/body-weight-goals").json()[0]


def test_pr_types_warmups_failed_sets_and_unit_conversion(client):
    bench = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Barbell Bench Press"
    )
    payload = workout_payload(bench["id"])
    payload["movements"][0]["sets"] = [
        {"reps": 5, "weight_kg": 120, "set_type": "warmup", "completed": True},
        {"reps": 5, "target_reps": 6, "weight_kg": 105, "failed": True, "completed": True},
        {"reps": 5, "weight_kg": 100, "completed": True},
    ]
    first = client.post("/api/workouts", json=payload)
    assert first.status_code == 201
    records = client.get("/api/personal-records").json()
    assert records == []  # The first eligible set establishes the baseline.

    payload["workout_date"] = (date.today() + timedelta(days=1)).isoformat()
    payload["movements"][0]["sets"] = [{"reps": 6, "weight_kg": 100, "completed": True}]
    second = client.post("/api/workouts", json=payload)
    second_records = client.get(
        "/api/personal-records", params={"workout_id": second.json()["id"]}
    ).json()
    assert {item["record_type"] for item in second_records} == {"reps_at_weight"}

    payload["workout_date"] = (date.today() + timedelta(days=2)).isoformat()
    payload["movements"][0]["sets"] = [{"reps": 1, "weight_kg": 102.5, "completed": True}]
    heavier = client.post("/api/workouts", json=payload).json()
    preferences = {"preferred_weight_unit": "lb", "week_start": "monday", "zone2_goal_minutes": 150}
    assert client.put("/api/training-preferences", json=preferences).status_code == 200
    converted = client.get("/api/personal-records", params={"workout_id": heavier["id"]}).json()
    weight_record = next(item for item in converted if item["record_type"] == "weight")
    assert weight_record["unit"] == "lb"
    assert weight_record["value"] == 226.0


def test_estimated_1rm_remains_a_progress_metric_without_awarding_prs(client):
    bench = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Barbell Bench Press"
    )
    payload = workout_payload(bench["id"])

    def log_set(day: str, weight_kg: float, reps: int) -> dict:
        payload["workout_date"] = day
        payload["movements"][0]["sets"] = [
            {"weight_kg": weight_kg, "reps": reps, "completed": True}
        ]
        response = client.post("/api/workouts", json=payload)
        assert response.status_code == 201
        return response.json()

    first = log_set("2026-01-01", 100, 8)
    lower = log_set("2026-01-08", 90, 12)
    higher = log_set("2026-01-15", 90, 13)
    tied = log_set("2026-01-22", 90, 13)

    def records_for(workout: dict) -> list[dict]:
        response = client.get("/api/personal-records", params={"workout_id": workout["id"]})
        assert response.status_code == 200
        return response.json()

    assert records_for(first) == []
    assert records_for(lower) == []
    higher_records = records_for(higher)
    assert {item["record_type"] for item in higher_records} == {"reps_at_weight"}
    assert higher_records[0]["value"] == 13
    assert higher_records[0]["normalized_weight"] == 90.0
    assert records_for(tied) == []

    progress = client.get(f"/api/progress/{bench['id']}").json()
    assert [point["estimated_1rm"] for point in progress["points"]] == [126.7, 126.0, 129.0, 129.0]
    assert progress["personal_best_estimated_1rm"] == 129.0


def test_progress_1rm_excludes_sets_that_cannot_earn_a_pr(client):
    bench = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Barbell Bench Press"
    )
    payload = workout_payload(bench["id"])
    payload["movements"][0]["sets"] = [
        {"weight_kg": 90, "reps": 13, "completed": True},
        {"weight_kg": 130, "reps": 8, "set_type": "warmup", "completed": True},
        {"weight_kg": 120, "reps": 4, "target_reps": 6, "failed": True, "completed": True},
        {"weight_kg": 50, "reps": 31, "completed": True},
    ]
    assert client.post("/api/workouts", json=payload).status_code == 201

    progress = client.get(f"/api/progress/{bench['id']}").json()
    assert progress["personal_best_estimated_1rm"] == 129.0
    records = client.get("/api/personal-records", params={"exercise_id": bench["id"]}).json()
    assert records == []


def test_fractional_muscle_volume_and_pr_rebuild_after_edit_delete(client):
    bench = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Barbell Bench Press"
    )
    payload = workout_payload(bench["id"])
    payload["movements"][0]["sets"] = [
        {"reps": 10, "weight_kg": 20, "set_type": "warmup", "completed": True},
        {"reps": 5, "weight_kg": 100, "completed": True},
        {"reps": 6, "weight_kg": 100, "completed": True},
    ]
    created = client.post("/api/workouts", json=payload).json()
    totals = {
        item["muscle_name"]: item["set_total"] for item in client.get("/api/muscle-volume").json()
    }
    assert totals == {"Front delts": 1.0, "Pectorals": 2.0, "Triceps": 1.0}
    original_count = len(client.get("/api/personal-records").json())
    assert client.put(f"/api/workouts/{created['id']}", json=payload).status_code == 200
    assert len(client.get("/api/personal-records").json()) == original_count

    payload["movements"][0]["sets"] = [{"reps": 5, "weight_kg": 80, "completed": True}]
    assert client.put(f"/api/workouts/{created['id']}", json=payload).status_code == 200
    assert client.get("/api/personal-records").json() == []
    assert client.delete(f"/api/workouts/{created['id']}").status_code == 204
    assert client.get("/api/personal-records").json() == []


def test_multiple_exercises_reordering_sets_and_supersets(client):
    exercises = client.get("/api/exercises").json()
    bench = next(item for item in exercises if item["name"] == "Barbell Bench Press")
    press = next(item for item in exercises if item["name"] == "Overhead Press")
    payload = workout_payload(bench["id"])
    payload["movements"] = [
        {
            "exercise_id": bench["id"],
            "superset_key": "pair-a",
            "sets": [
                {"reps": 5, "weight_kg": 100, "completed": True},
                {"reps": 8, "weight_kg": 80, "completed": True},
            ],
        },
        {
            "exercise_id": press["id"],
            "superset_key": "pair-a",
            "sets": [{"reps": 6, "weight_kg": 60, "completed": True}],
        },
    ]
    created = client.post("/api/workouts", json=payload)
    assert created.status_code == 201
    workout = created.json()
    assert (
        workout["movements"][0]["superset_group_id"] == workout["movements"][1]["superset_group_id"]
    )

    payload["movements"].reverse()
    payload["movements"][1]["sets"].reverse()
    for movement in payload["movements"]:
        movement["superset_key"] = None
    updated = client.put(f"/api/workouts/{workout['id']}", json=payload).json()
    assert [item["exercise"]["name"] for item in updated["movements"]] == [
        "Overhead Press",
        "Barbell Bench Press",
    ]
    assert [item["weight_kg"] for item in updated["movements"][1]["sets"]] == [80, 100]
    assert all(item["superset_group_id"] is None for item in updated["movements"])

    duplicate = payload.copy()
    duplicate["movements"] = [payload["movements"][0], payload["movements"][0]]
    assert client.post("/api/workouts", json=duplicate).status_code == 422


def test_zone2_week_boundaries_edit_and_delete(client):
    from datetime import timedelta

    today = date.today()
    monday = today - timedelta(days=today.weekday())
    current = {
        "session_date": monday.isoformat(),
        "activity_type": "Cycling",
        "duration_minutes": 60,
        "intensity": "Easy",
        "zone": "Zone 2",
        "qualifies_zone2": True,
        "notes": None,
    }
    previous = {
        **current,
        "session_date": (monday - timedelta(days=1)).isoformat(),
        "duration_minutes": 90,
    }
    other = {**current, "duration_minutes": 40, "qualifies_zone2": False, "zone": "Zone 3"}
    current_id = client.post("/api/cardio", json=current).json()["id"]
    assert client.post("/api/cardio", json=previous).status_code == 201
    other_id = client.post("/api/cardio", json=other).json()["id"]
    overview = client.get("/api/cardio").json()
    assert overview["current_week"]["completed_minutes"] == 60
    assert overview["previous_weeks"][0]["completed_minutes"] == 90
    dashboard = client.get("/api/dashboard").json()
    assert dashboard["total_cardio_sessions"] == 3
    assert dashboard["cardio_minutes_this_week"] == 100

    current["duration_minutes"] = 120
    assert client.put(f"/api/cardio/{current_id}", json=current).status_code == 200
    assert client.get("/api/cardio").json()["current_week"]["completed_minutes"] == 120
    assert client.delete(f"/api/cardio/{current_id}").status_code == 204
    assert client.delete(f"/api/cardio/{other_id}").status_code == 204
    assert client.get("/api/dashboard").json()["total_cardio_sessions"] == 1


def test_cardio_form_session_creates_a_calendar_workout(client):
    exercise = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Incline Treadmill Walking"
    )
    payload = {
        "session_date": date.today().isoformat(),
        "exercise_id": exercise["id"],
        "activity_type": exercise["name"],
        "duration_minutes": 35,
        "intensity": "This should not be stored",
        "zone": "Zone 3",
        "qualifies_zone2": True,
        "notes": "Steady incline",
    }

    created = client.post("/api/cardio", json=payload)

    assert created.status_code == 201
    session = created.json()
    assert session["source_workout_id"] is not None
    assert session["activity_type"] == exercise["name"]
    assert session["duration_minutes"] == 35
    assert session["intensity"] is None
    assert session["zone"] == "Zone 3"
    assert session["qualifies_zone2"] is False

    workout = client.get(f"/api/workouts/{session['source_workout_id']}").json()
    assert workout["category"] == "cardio"
    assert workout["duration_minutes"] == 35
    assert workout["movements"][0]["exercise"]["id"] == exercise["id"]
    assert workout["movements"][0]["sets"][0]["duration_seconds"] == 2_100

    dashboard = client.get("/api/dashboard").json()
    calendar_day = next(
        item for item in dashboard["heatmap"] if item["workout_date"] == date.today().isoformat()
    )
    assert any(item["id"] == workout["id"] for item in calendar_day["workouts"])
    assert dashboard["cardio_minutes_this_week"] == 35
    assert dashboard["zone2"]["completed_minutes"] == 0


def test_completed_treadmill_walking_workout_counts_toward_zone2(client):
    exercise = next(
        item
        for item in client.get("/api/exercises").json()
        if item["name"] == "Incline Treadmill Walking"
    )
    payload = {
        "name": "Incline walking",
        "workout_date": date.today().isoformat(),
        "category": "cardio",
        "notes": None,
        "duration_minutes": 30,
        "movements": [
            {
                "exercise_id": exercise["id"],
                "notes": None,
                "sets": [
                    {
                        "duration_seconds": 1_800,
                        "distance_km": 2.7,
                        "incline_percent": 12.5,
                        "speed_kph": 5.4,
                        "completed": True,
                    }
                ],
            }
        ],
    }

    created = client.post("/api/workouts", json=payload)

    assert created.status_code == 201
    assert client.get("/api/dashboard").json()["total_cardio_sessions"] == 1
    assert client.get("/api/dashboard").json()["zone2"]["completed_minutes"] == 30
    assert client.get("/api/cardio").json()["current_week"]["completed_minutes"] == 30
    assert client.delete(f"/api/workouts/{created.json()['id']}").status_code == 204
    assert client.get("/api/dashboard").json()["total_cardio_sessions"] == 0
    assert client.get("/api/dashboard").json()["zone2"]["completed_minutes"] == 0
    assert client.get("/api/cardio").json()["current_week"]["completed_minutes"] == 0


def test_completed_indoor_cycling_is_imported_as_read_only_cardio_session(client):
    exercise = next(
        item for item in client.get("/api/exercises").json() if item["name"] == "Cycling (Indoor)"
    )
    payload = {
        "name": "Pull and cardio",
        "workout_date": date.today().isoformat(),
        "category": "pull",
        "notes": None,
        "duration_minutes": 60,
        "movements": [
            {
                "exercise_id": exercise["id"],
                "notes": "Easy spin",
                "sets": [
                    {
                        "duration_seconds": 2_400,
                        "distance_km": 17.68,
                        "completed": True,
                    }
                ],
            }
        ],
    }

    created = client.post("/api/workouts", json=payload)

    assert created.status_code == 201
    workout_id = created.json()["id"]
    overview = client.get("/api/cardio").json()
    assert overview["current_week"]["completed_minutes"] == 40
    imported = next(
        session for session in overview["sessions"] if session["source_workout_id"] == workout_id
    )
    assert imported["activity_type"] == "Cycling (Indoor)"
    assert imported["duration_minutes"] == 40
    assert imported["zone"] == "Zone 2"
    assert imported["qualifies_zone2"] is True
    assert imported["notes"] == "Easy spin"
    assert (
        client.put(
            f"/api/cardio/{imported['id']}",
            json={
                "session_date": date.today().isoformat(),
                "activity_type": "Cycling",
                "duration_minutes": 10,
                "intensity": None,
                "zone": "Zone 2",
                "qualifies_zone2": True,
                "notes": None,
            },
        ).status_code
        == 409
    )
    assert client.delete(f"/api/cardio/{imported['id']}").status_code == 409

    payload["movements"][0]["sets"][0]["duration_seconds"] = 3_000
    assert client.put(f"/api/workouts/{workout_id}", json=payload).status_code == 200
    updated_overview = client.get("/api/cardio").json()
    updated = next(
        session
        for session in updated_overview["sessions"]
        if session["source_workout_id"] == workout_id
    )
    assert updated["id"] == imported["id"]
    assert updated["duration_minutes"] == 50
    assert updated_overview["current_week"]["completed_minutes"] == 50

    assert client.delete(f"/api/workouts/{workout_id}").status_code == 204
    final_overview = client.get("/api/cardio").json()
    assert final_overview["current_week"]["completed_minutes"] == 0
    assert all(session["source_workout_id"] != workout_id for session in final_overview["sessions"])
