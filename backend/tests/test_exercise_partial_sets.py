import importlib.util
from datetime import date, timedelta
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text

from app.database import SessionLocal
from app.models import Exercise
from app.training_metrics import partial_sets_enabled_on, start_of_week


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
    path = Path(__file__).parents[1] / "migrations/versions/0046_exercise_partial_sets.py"
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


def test_leg_press_history_uses_each_weeks_carried_setting(client):
    exercise = exercise_named(client, "Leg Press")
    current = start_of_week(date.today(), "monday")
    weeks = [current - timedelta(weeks=3 - index) for index in range(4)]
    url = f"/api/exercises/{exercise['id']}/partial-sets"
    assert (
        client.patch(
            url, json={"partial_sets_enabled": False, "week_start": weeks[0].isoformat()}
        ).status_code
        == 200
    )
    carried = exercise_named(client, "Leg Press")
    assert carried["partial_sets_enabled"] is False
    for week in weeks:
        response = client.post(
            "/api/workouts",
            json={
                "name": "Sample legs",
                "category": "lower",
                "workout_date": week.isoformat(),
                "movements": [
                    {
                        "exercise_id": exercise["id"],
                        "sets": [{"reps": 8, "weight_kg": 80, "completed": True}] * 4,
                    }
                ],
            },
        )
        assert response.status_code == 201, response.text
    with SessionLocal() as db:
        model = db.get(Exercise, exercise["id"])
        assert not partial_sets_enabled_on(model, weeks[0])
        assert not partial_sets_enabled_on(model, weeks[1])
        assert partial_sets_enabled_on(model, weeks[0] - timedelta(days=1))
    response = client.patch(
        url, json={"partial_sets_enabled": True, "week_start": weeks[1].isoformat()}
    )
    assert response.status_code == 200
    assert response.json()["partial_sets_enabled"] is True
    assert response.json()["partial_sets_default"] is True
    for index, week in enumerate(weeks):
        result = client.get(
            "/api/muscle-volume",
            params={"start": week.isoformat(), "end": (week + timedelta(days=6)).isoformat()},
        )
        totals = {item["muscle_name"]: item["set_total"] for item in result.json()}
        assert totals.get("Adductors", 0) == (0 if index == 0 else 2)
        assert totals["Quadriceps"] == 4
    totals = {
        item["muscle_name"]: item["set_total"]
        for item in client.get(
            "/api/muscle-volume",
            params={"start": weeks[0].isoformat(), "end": date.today().isoformat()},
        ).json()
    }
    assert totals["Adductors"] == 6
    assert totals["Quadriceps"] == 16
    assert totals["Glutes"] == 16
    weekly = client.get("/api/dashboard").json()["weekly_sets"]
    assistance = next(
        item for item in weekly["muscle_groups"] if item["muscle_group"] == "Adductors"
    )
    assert assistance["raw_sets"] == 2
    assert assistance["contributions"][0]["credit_per_set"] == 0.5
    assert (
        client.patch(
            url, json={"partial_sets_enabled": False, "week_start": weeks[2].isoformat()}
        ).status_code
        == 200
    )
    # Editing an earlier week must not overwrite a later explicit choice.
    edited = client.patch(
        url, json={"partial_sets_enabled": True, "week_start": weeks[1].isoformat()}
    ).json()
    assert edited["partial_sets_enabled"] is False
    assert len(edited["partial_set_weeks"]) == 3
    assert (
        client.patch(
            url,
            json={
                "partial_sets_enabled": True,
                "week_start": (current + timedelta(weeks=1)).isoformat(),
            },
        ).status_code
        == 422
    )


def test_weekly_changes_follow_account_week_start_and_preserve_legacy_default(client):
    preferences = client.get("/api/training-preferences").json()
    assert (
        client.put(
            "/api/training-preferences", json={**preferences, "week_start": "sunday"}
        ).status_code
        == 200
    )
    exercise = exercise_named(client, "Barbell Bench Press")
    with SessionLocal() as db:
        model = db.get(Exercise, exercise["id"])
        model.partial_sets_enabled = False
        db.commit()
    current = start_of_week(date.today(), "sunday")
    response = client.patch(
        f"/api/exercises/{exercise['id']}/partial-sets",
        json={"partial_sets_enabled": True, "week_start": date.today().isoformat()},
    )
    assert response.status_code == 200
    assert response.json()["partial_set_weeks"] == [
        {"week_start": current.isoformat(), "enabled": True}
    ]
    assert response.json()["partial_sets_default"] is False
    with SessionLocal() as db:
        model = db.get(Exercise, exercise["id"])
        assert not partial_sets_enabled_on(model, current - timedelta(days=1))
        assert partial_sets_enabled_on(model, current)


def test_weekly_history_migration_preserves_legacy_choices_and_downgrades():
    path = Path(__file__).parents[1] / "migrations/versions/0047_weekly_partial_sets.py"
    spec = importlib.util.spec_from_file_location("weekly_partial_sets_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            text("CREATE TABLE exercises (id TEXT PRIMARY KEY, partial_sets_enabled BOOLEAN)")
        )
        connection.execute(text("INSERT INTO exercises VALUES ('bench', 0)"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            connection.execute(
                text("INSERT INTO exercise_partial_set_weeks VALUES ('bench', '2026-10-19', 1)")
            )
            assert connection.scalar(text("SELECT COUNT(*) FROM exercise_partial_set_weeks")) == 1
            migration.downgrade()
        assert connection.execute(text("SELECT * FROM exercises")).one() == ("bench", 0)
    engine.dispose()
