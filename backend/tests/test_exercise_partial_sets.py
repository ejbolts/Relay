import importlib.util
from datetime import date
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text


def exercise_named(client, name):
    return next(item for item in client.get("/api/exercises").json() if item["name"] == name)


def credits(exercise, field="muscle_set_credits"):
    return {item["muscle_name"]: item["sets"] for item in exercise[field]}


def test_partial_sets_persist_and_recalculate_saved_workouts_without_changing_direct_sets(client):
    bench = exercise_named(client, "Barbell Bench Press")
    assert bench["partial_sets_enabled"] is True
    assert credits(bench)["Triceps"] == 0.5
    response = client.post(
        "/api/workouts",
        json={
            "name": "Sample push",
            "workout_date": date.today().isoformat(),
            "category": "push",
            "movements": [
                {
                    "exercise_id": bench["id"],
                    "sets": [
                        {"weight_kg": 40, "reps": 8, "rpe": 8, "completed": True},
                        {"weight_kg": 40, "reps": 8, "completed": True},
                    ],
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    workout_id = response.json()["id"]
    original_revision = client.get("/api/workouts/revision").json()
    response = client.patch(
        f"/api/exercises/{bench['id']}/partial-sets", json={"partial_sets_enabled": False}
    )
    assert response.status_code == 200, response.text
    disabled = response.json()
    assert disabled["partial_sets_enabled"] is False
    assert credits(disabled) == {"Pectorals": 1}
    assert credits(disabled, "default_muscle_set_credits") == credits(bench)
    assert client.get("/api/workouts/revision").json() != original_revision
    assert exercise_named(client, "Barbell Bench Press")["partial_sets_enabled"] is False
    saved = client.get(f"/api/workouts/{workout_id}").json()
    assert credits(saved["movements"][0]["exercise"]) == {"Pectorals": 1}
    weekly = client.get("/api/dashboard").json()["weekly_sets"]
    assert weekly["raw_sets"] == 2
    assert {item["muscle_group"]: item["raw_sets"] for item in weekly["muscle_groups"]} == {
        "Pectorals": 2
    }
    assert weekly["muscle_groups"][0]["contributions"][0]["set_credits"] == 2
    restored = client.patch(
        f"/api/exercises/{bench['id']}/partial-sets", json={"partial_sets_enabled": True}
    ).json()
    assert credits(restored) == credits(bench)
    groups = {
        item["muscle_group"]: item
        for item in client.get("/api/dashboard").json()["weekly_sets"]["muscle_groups"]
    }
    assert groups["Triceps"]["raw_sets"] == 1
    assert groups["Triceps"]["contributions"][0]["credit_per_set"] == 0.5
    assert groups["Pectorals"]["raw_sets"] == 2


def test_partial_sets_are_account_and_exercise_owned(client, other_client):
    bench = exercise_named(client, "Barbell Bench Press")
    other_bench = exercise_named(other_client, "Barbell Bench Press")
    response = other_client.patch(
        f"/api/exercises/{bench['id']}/partial-sets", json={"partial_sets_enabled": False}
    )
    assert response.status_code == 404
    assert (
        client.patch(
            f"/api/exercises/{bench['id']}/partial-sets", json={"partial_sets_enabled": False}
        ).status_code
        == 200
    )
    assert exercise_named(other_client, "Barbell Bench Press")["id"] == other_bench["id"]
    assert exercise_named(other_client, "Barbell Bench Press")["partial_sets_enabled"] is True
    assert exercise_named(client, "Incline Dumbbell Press")["partial_sets_enabled"] is True
    assert (
        client.patch(
            "/api/exercises/missing/partial-sets", json={"partial_sets_enabled": False}
        ).status_code
        == 404
    )
    assert client.patch(f"/api/exercises/{bench['id']}/partial-sets", json={}).status_code == 422


def test_partial_sets_migration_preserves_existing_exercises_and_defaults_to_enabled():
    path = Path(__file__).parents[1] / "migrations/versions/0042_exercise_partial_sets.py"
    spec = importlib.util.spec_from_file_location("partial_sets_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE exercises (id TEXT PRIMARY KEY, name TEXT)"))
        connection.execute(text("INSERT INTO exercises VALUES ('bench', 'Bench Press')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert connection.execute(
                text("SELECT id, partial_sets_enabled FROM exercises")
            ).one() == ("bench", 1)
            connection.execute(
                text("UPDATE exercises SET partial_sets_enabled = 0 WHERE id = 'bench'")
            )
            migration.downgrade()
        assert connection.execute(text("SELECT * FROM exercises")).one() == ("bench", "Bench Press")
    engine.dispose()
