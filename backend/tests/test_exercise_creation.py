from datetime import date

import pytest


def exercise_payload(**changes):
    return {
        "name": "  Custom lat exercise  ",
        "category": "pull",
        "kind": "strength",
        "muscle_group": " Lats ",
        "equipment": " Cable ",
        **changes,
    }


def test_create_exercise_persists_in_library(client):
    response = client.post("/api/exercises", json=exercise_payload())
    assert response.status_code == 201
    exercise = response.json()
    assert exercise["name"] == "Custom lat exercise"
    assert exercise["category"] == "pull"
    assert exercise["kind"] == "strength"
    assert exercise["muscle_group"] == "Lats"
    assert exercise["equipment"] == "Cable"
    assert exercise["is_custom"] is True
    assert exercise in client.get("/api/exercises").json()


def test_create_exercise_duplicate_does_not_add_another_entry(client):
    assert client.post("/api/exercises", json=exercise_payload()).status_code == 201
    response = client.post("/api/exercises", json=exercise_payload())
    assert response.status_code == 409
    assert "already exists" in response.json()["error"]["message"]
    assert (
        len(
            [
                item
                for item in client.get("/api/exercises").json()
                if item["name"] == "Custom lat exercise"
            ]
        )
        == 1
    )


def test_create_exercise_alias_does_not_duplicate_a_canonical_exercise(client):
    response = client.post(
        "/api/exercises",
        json=exercise_payload(
            name="Bench Press",
            category="push",
            muscle_group="Chest",
            equipment="Barbell",
        ),
    )

    assert response.status_code == 409
    assert "already exists" in response.json()["error"]["message"]
    names = [item["name"] for item in client.get("/api/exercises").json()]
    assert names.count("Barbell Bench Press") == 1
    assert "Bench Press" not in names


def test_create_cardio_exercise_without_equipment(client):
    response = client.post(
        "/api/exercises",
        json=exercise_payload(category="cardio", kind="cardio", equipment=None),
    )
    assert response.status_code == 201
    assert response.json()["equipment"] is None
    assert response.json()["kind"] == "cardio"


@pytest.mark.parametrize(
    "changes",
    [
        {"name": " "},
        {"muscle_group": " "},
        {"category": ""},
        {"name": "a" * 161},
    ],
)
def test_create_exercise_validates_required_fields(client, changes):
    assert client.post("/api/exercises", json=exercise_payload(**changes)).status_code == 422


def test_custom_exercise_is_private_to_its_creator(client, other_client):
    created = client.post("/api/exercises", json=exercise_payload()).json()

    assert created["is_custom"] is True
    assert created in client.get("/api/exercises", params={"search": "lat exercise"}).json()
    assert other_client.get("/api/exercises", params={"search": "lat exercise"}).json() == []
    other_names = [item["name"] for item in other_client.get("/api/exercises").json()]
    assert "Custom lat exercise" not in other_names
    assert other_client.get(f"/api/progress/{created['id']}").status_code == 404
    favorite = other_client.patch(
        f"/api/exercises/{created['id']}/favorite", json={"is_favorite": True}
    )
    assert favorite.status_code == 404
    # The same name stays available to the other account as its own custom exercise.
    assert other_client.post("/api/exercises", json=exercise_payload()).status_code == 201


@pytest.mark.parametrize(("credit", "role"), [(1, "primary"), (0.5, "secondary")])
def test_custom_muscle_credit_persists_and_counts_only_completed_working_sets(
    client, other_client, credit, role
):
    response = client.post("/api/exercises", json=exercise_payload(muscle_set_credit=credit))
    assert response.status_code == 201
    exercise = response.json()
    assert exercise["muscle_set_credits"] == [{"muscle_name": "Lats", "sets": credit}]
    assert exercise["muscle_contributions"] == [
        {"muscle_name": "Lats", "role": role, "contribution_factor": credit}
    ]
    assert exercise in client.get("/api/exercises").json()
    assert other_client.get("/api/exercises", params={"search": exercise["name"]}).json() == []

    workout = client.post(
        "/api/workouts",
        json={
            "name": "Custom muscle workout",
            "category": "pull",
            "workout_date": date.today().isoformat(),
            "movements": [
                {
                    "exercise_id": exercise["id"],
                    "sets": [
                        {"reps": 8, "weight_kg": 20, "completed": True},
                        {"reps": 8, "weight_kg": 20, "completed": True},
                        {"reps": 8, "weight_kg": 10, "completed": True, "warmup": True},
                        {"reps": 8, "weight_kg": 20, "completed": False},
                    ],
                }
            ],
        },
    )
    assert workout.status_code == 201, workout.text
    assert workout.json()["movements"][0]["exercise"]["muscle_set_credits"] == [
        {"muscle_name": "Lats", "sets": credit}
    ]
    groups = client.get("/api/dashboard").json()["weekly_sets"]["muscle_groups"]
    lats = next(group for group in groups if group["muscle_group"] == "Lats")
    assert lats["raw_sets"] == 2 * credit
    assert lats["contributions"][0]["credit_per_set"] == credit
    assert lats["contributions"][0]["working_sets"] == 2


@pytest.mark.parametrize("credit", [0, -0.5, 0.25, 1.5, "partial", None])
def test_create_exercise_rejects_invalid_muscle_set_credit(client, credit):
    response = client.post("/api/exercises", json=exercise_payload(muscle_set_credit=credit))
    assert response.status_code == 422


@pytest.mark.parametrize("changes", [{"kind": "cardio"}, {"category": "cardio"}])
def test_cardio_does_not_receive_strength_credits(client, changes):
    response = client.post(
        "/api/exercises", json=exercise_payload(muscle_set_credit=0.5, **changes)
    )
    assert response.status_code == 201
    assert response.json()["muscle_set_credits"] == []
    assert response.json()["muscle_contributions"] == []


def test_multiple_targets_keep_independent_credits_and_weekly_totals(client, other_client):
    credits = [
        {"muscle_name": " Pectorals ", "sets": 1},
        {"muscle_name": "Triceps", "sets": 0.5},
        {"muscle_name": "Front delts", "sets": 0.5},
    ]
    response = client.post("/api/exercises", json=exercise_payload(muscle_set_credits=credits))
    assert response.status_code == 201, response.text
    exercise = response.json()
    expected = {"Pectorals": 1, "Triceps": 0.5, "Front delts": 0.5}
    assert exercise["muscle_group"] == "Pectorals"
    assert {
        item["muscle_name"]: item["sets"] for item in exercise["muscle_set_credits"]
    } == expected
    assert {item["muscle_name"]: item["role"] for item in exercise["muscle_contributions"]} == {
        "Pectorals": "primary",
        "Triceps": "secondary",
        "Front delts": "secondary",
    }
    assert exercise in client.get("/api/exercises").json()
    assert other_client.get("/api/exercises", params={"search": exercise["name"]}).json() == []
    workout = client.post(
        "/api/workouts",
        json={
            "name": "Mixed muscle credits",
            "category": "push",
            "workout_date": date.today().isoformat(),
            "movements": [
                {
                    "exercise_id": exercise["id"],
                    "sets": [
                        {"reps": 8, "weight_kg": 20, "completed": True},
                        {"reps": 8, "weight_kg": 20, "completed": True},
                        {"reps": 8, "weight_kg": 10, "completed": True, "warmup": True},
                        {"reps": 8, "weight_kg": 20, "completed": False},
                    ],
                }
            ],
        },
    )
    assert workout.status_code == 201, workout.text
    saved_credits = workout.json()["movements"][0]["exercise"]["muscle_set_credits"]
    assert {item["muscle_name"]: item["sets"] for item in saved_credits} == expected
    groups = client.get("/api/dashboard").json()["weekly_sets"]["muscle_groups"]
    for muscle, credit in expected.items():
        group = next(item for item in groups if item["muscle_group"] == muscle)
        assert group["raw_sets"] == 2 * credit
        assert group["contributions"][0]["credit_per_set"] == credit
        assert group["contributions"][0]["working_sets"] == 2


@pytest.mark.parametrize(
    "credits",
    [
        [],
        [{"muscle_name": " ", "sets": 1}],
        [{"muscle_name": "a" * 101, "sets": 1}],
        [{"muscle_name": "Lats", "sets": 0.25}],
        [{"muscle_name": "Lats", "sets": 1}, {"muscle_name": " lats ", "sets": 0.5}],
        [
            {"muscle_name": "Upper back", "sets": 1},
            {"muscle_name": "Mid / Upper Back", "sets": 0.5},
        ],
    ],
)
def test_create_exercise_rejects_invalid_multiple_targets(client, credits):
    response = client.post("/api/exercises", json=exercise_payload(muscle_set_credits=credits))
    assert response.status_code == 422


def test_cardio_ignores_multiple_strength_targets(client):
    response = client.post(
        "/api/exercises",
        json=exercise_payload(
            kind="cardio",
            muscle_set_credits=[
                {"muscle_name": "Lats", "sets": 1},
                {"muscle_name": "Biceps", "sets": 0.5},
            ],
        ),
    )
    assert response.status_code == 201
    assert response.json()["muscle_set_credits"] == []
