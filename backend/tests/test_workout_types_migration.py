import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_workout_types_migration_preserves_existing_workouts_and_downgrades():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0036_workout_types.py"
    spec = importlib.util.spec_from_file_location("workout_types_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.revision == "0036_workout_types"
    assert migration.down_revision == "0035_feedback_resolution"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(text("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY)"))
        connection.execute(
            text("CREATE TABLE training_workouts (id VARCHAR(36) PRIMARY KEY, name VARCHAR(200))")
        )
        connection.execute(text("INSERT INTO users VALUES ('sample-user')"))
        connection.execute(
            text("INSERT INTO training_workouts VALUES ('old-workout', 'Original workout')")
        )
        connection.execute(
            text(
                "CREATE TABLE workout_movements (id VARCHAR(36) PRIMARY KEY, "
                "workout_id VARCHAR(36) REFERENCES training_workouts(id) ON DELETE CASCADE)"
            )
        )
        connection.execute(
            text("INSERT INTO workout_movements VALUES ('old-movement', 'old-workout')")
        )
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.scalar(text("SELECT id FROM workout_movements")) == "old-movement"
        assert "workout_types" in inspect(connection).get_table_names()
        assert connection.execute(
            text("SELECT name, workout_type_id FROM training_workouts")
        ).one() == ("Original workout", None)
        connection.execute(
            text(
                "INSERT INTO workout_types (id, user_id, name, color) "
                "VALUES ('arms-id', 'sample-user', 'Arms', '#a855f7')"
            )
        )
        connection.execute(text("UPDATE training_workouts SET workout_type_id = 'arms-id'"))
        assert connection.scalar(text("SELECT archived FROM workout_types")) == 0
        migration.downgrade()
        assert "workout_types" not in inspect(connection).get_table_names()
        assert "workout_type_id" not in {
            item["name"] for item in inspect(connection).get_columns("training_workouts")
        }
        assert connection.scalar(text("SELECT name FROM training_workouts")) == "Original workout"
        assert connection.scalar(text("SELECT id FROM workout_movements")) == "old-movement"
