from datetime import date

import pytest
from sqlalchemy import select

from app.database import SessionLocal
from app.exercise_aliases import canonical_exercise_name
from app.models import Exercise
from app.tracker import DEFAULT_EXERCISES, seed_default_exercises
from app.training_metrics import DEFAULT_MUSCLE_MAPPING


@pytest.mark.parametrize(
    ("name", "equipment"), [("Cable Biceps Curl", None), ("Cable Bicep Curl", "  ")]
)
def test_upgrade_fills_only_missing_equipment_on_recognised_custom_exercises(
    client, name, equipment
):
    with SessionLocal() as db:
        exercise = db.scalar(
            select(Exercise).where(
                Exercise.user_id == client.user["id"],
                Exercise.name == "Cable Biceps Curl",
            )
        )
        exercise.name = name
        exercise.is_custom = True
        exercise.equipment = equipment
        exercise.is_favorite = True
        exercise.muscle_group = "My target muscles"
        exercise_id = exercise.id
        db.commit()
    before = next(item for item in client.get("/api/exercises").json() if item["id"] == exercise_id)
    workout = client.post(
        "/api/workouts",
        json={
            "name": "Imported custom curl history",
            "workout_date": date.today().isoformat(),
            "category": "pull",
            "movements": [
                {
                    "exercise_id": exercise_id,
                    "sets": [{"reps": 10, "weight_kg": 20, "completed": True}],
                }
            ],
        },
    ).json()
    revision_before = client.get("/api/workouts/revision").json()
    with SessionLocal() as db:
        seed_default_exercises(db, client.user["id"])
    upgraded = client.get("/api/exercises").json()
    after = next(item for item in upgraded if item["id"] == exercise_id)
    assert after == {**before, "equipment": "Cable"}
    assert (
        len(
            [
                item
                for item in upgraded
                if canonical_exercise_name(item["name"]) == "Cable Biceps Curl"
            ]
        )
        == 1
    )
    saved = client.get(f"/api/workouts/{workout['id']}").json()
    assert saved["movements"][0]["exercise"]["id"] == exercise_id
    assert saved["movements"][0]["sets"] == workout["movements"][0]["sets"]
    assert client.get(f"/api/progress/{exercise_id}").json()["personal_best_weight_kg"] == 20
    revision_after = client.get("/api/workouts/revision").json()
    assert revision_after != revision_before
    with SessionLocal() as db:
        seed_default_exercises(db, client.user["id"])
    assert client.get("/api/workouts/revision").json() == revision_after
    # Re-imports and manual creation also recognise the retained custom alias.
    duplicate = client.post(
        "/api/exercises",
        json={
            "name": "Cable Curl",
            "category": "pull",
            "kind": "strength",
            "muscle_group": "Biceps",
            "equipment": "Cable",
        },
    )
    assert duplicate.status_code == 409, duplicate.text
    csv = b"Date Lifted,Exercise,Weight (kg),Reps\n2026-10-01,Cable Curl,22,8\n"
    imported = client.post("/api/workouts/import", files={"file": ("sample.csv", csv, "text/csv")})
    assert imported.status_code == 201, imported.text
    assert imported.json()["exercises_created"] == 0
    assert {
        movement["exercise"]["id"]
        for session in client.get("/api/workouts").json()
        for movement in session["movements"]
    } == {exercise_id}


def test_upgrade_keeps_ambiguous_custom_names_without_assuming_their_equipment(client):
    response = client.post(
        "/api/exercises",
        json={
            "name": "Preacher Curl",
            "category": "pull",
            "kind": "strength",
            "muscle_group": "Biceps",
            "equipment": None,
        },
    )
    assert response.status_code == 201, response.text
    custom = response.json()
    with SessionLocal() as db:
        seed_default_exercises(db, client.user["id"])
    assert (
        next(item for item in client.get("/api/exercises").json() if item["id"] == custom["id"])
        == custom
    )


def test_catalogue_has_distinct_equipment_variants_and_explicit_muscle_credits(client):
    exercises = client.get("/api/exercises").json()
    strength = [exercise for exercise in exercises if exercise["kind"] == "strength"]
    assert len(strength) == len(DEFAULT_EXERCISES) == 83
    assert {exercise["equipment"] for exercise in strength} == {
        "Barbell",
        "Dumbbell",
        "Cable",
        "Machine",
        "Smith machine",
        "EZ bar",
        "Trap bar",
        "Kettlebell",
        "Resistance band",
        "Bodyweight",
    }
    assert all(exercise["muscle_contributions"] for exercise in strength)
    assert {exercise[0] for exercise in DEFAULT_EXERCISES} <= DEFAULT_MUSCLE_MAPPING.keys()
    names = [canonical_exercise_name(exercise["name"]) for exercise in exercises]
    assert len(names) == len(set(names))
    curls = {exercise["name"]: exercise for exercise in strength if "Curl" in exercise["name"]}
    assert curls["Dumbbell Curl"]["equipment"] == "Dumbbell"
    assert curls["Cable Biceps Curl"]["equipment"] == "Cable"
    assert curls["Machine Bicep Preacher Curl"]["equipment"] == "Machine"


def test_catalogue_upgrade_is_idempotent_and_preserves_custom_exercises_and_history(client):
    exercises = client.get("/api/exercises").json()
    bench = next(exercise for exercise in exercises if exercise["name"] == "Barbell Bench Press")
    workout = client.post(
        "/api/workouts",
        json={
            "name": "Existing workout",
            "workout_date": date.today().isoformat(),
            "category": "push",
            "movements": [
                {
                    "exercise_id": bench["id"],
                    "sets": [
                        {"reps": 8, "weight_kg": 60, "completed": True},
                    ],
                }
            ],
        },
    ).json()
    workout = client.get(f"/api/workouts/{workout['id']}").json()
    with SessionLocal() as db:
        custom = db.scalar(
            select(Exercise).where(
                Exercise.user_id == client.user["id"],
                Exercise.name == "Dumbbell Curl",
            )
        )
        custom.is_custom = True
        custom.name = "Dumbbell Bicep Curl"
        custom.equipment = "My curl equipment"
        custom.muscle_group = "My muscles"
        custom.is_favorite = True
        custom_id = custom.id
        # Emulate an older account missing a newly introduced default.
        missing = db.scalar(
            select(Exercise).where(
                Exercise.user_id == client.user["id"],
                Exercise.name == "Cable Biceps Curl",
            )
        )
        db.delete(missing)
        db.commit()
        seed_default_exercises(db, client.user["id"])
        seed_default_exercises(db, client.user["id"])
    upgraded = client.get("/api/exercises").json()
    assert len(upgraded) == len(exercises)
    assert {exercise["id"] for exercise in upgraded if exercise["name"] != "Cable Biceps Curl"} == {
        exercise["id"] for exercise in exercises if exercise["name"] != "Cable Biceps Curl"
    }
    custom = next(exercise for exercise in upgraded if exercise["id"] == custom_id)
    assert custom["equipment"] == "My curl equipment"
    assert custom["muscle_group"] == "My muscles"
    assert custom["is_favorite"] is True
    assert custom["name"] == "Dumbbell Bicep Curl"
    assert not any(exercise["name"] == "Dumbbell Curl" for exercise in upgraded)
    assert client.get(f"/api/workouts/{workout['id']}").json() == workout


def test_equipment_variants_keep_separate_progress_and_account_ownership(client, other_client):
    exercises = {exercise["name"]: exercise for exercise in client.get("/api/exercises").json()}
    dumbbell = exercises["Dumbbell Curl"]
    cable = exercises["Cable Biceps Curl"]
    assert dumbbell["id"] != cable["id"]
    for exercise, weight in [(dumbbell, 12), (cable, 25)]:
        response = client.post(
            "/api/workouts",
            json={
                "name": exercise["name"],
                "workout_date": date.today().isoformat(),
                "category": "pull",
                "movements": [
                    {
                        "exercise_id": exercise["id"],
                        "sets": [
                            {"reps": 10, "weight_kg": weight, "completed": True},
                        ],
                    }
                ],
            },
        )
        assert response.status_code == 201, response.text
        assert (
            client.get(f"/api/progress/{exercise['id']}").json()["personal_best_weight_kg"]
            == weight
        )
        assert other_client.get(f"/api/progress/{exercise['id']}").status_code == 404
    assert len(client.get("/api/progress").json()) == 2
    assert other_client.get("/api/progress").json() == []
