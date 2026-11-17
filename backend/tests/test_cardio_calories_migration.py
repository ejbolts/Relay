import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError


def test_upgrade_keeps_existing_sessions_unknown_and_backfills_exercise_identity():
    migration_path = Path(__file__).parents[1] / "migrations/versions/0017_cardio_calories.py"
    spec = importlib.util.spec_from_file_location("cardio_calories_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE workout_movements "
                "(workout_id TEXT, order_index INTEGER, exercise_id TEXT)"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE cardio_sessions (id TEXT PRIMARY KEY, activity_type TEXT, "
                "source_workout_id TEXT, source_movement_index INTEGER)"
            )
        )
        connection.execute(text("INSERT INTO workout_movements VALUES ('workout', 0, 'bike')"))
        connection.execute(
            text(
                "INSERT INTO cardio_sessions VALUES "
                "('linked', 'Bike', 'workout', 0), ('manual', 'Walk', NULL, NULL)"
            )
        )
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        rows = connection.execute(
            text(
                "SELECT id, activity_type, calories_kcal, source_exercise_id "
                "FROM cardio_sessions ORDER BY id"
            )
        ).all()
        assert rows == [("linked", "Bike", None, "bike"), ("manual", "Walk", None, None)]
        connection.execute(
            text("UPDATE cardio_sessions SET calories_kcal = 350 WHERE id = 'linked'")
        )
        with pytest.raises(IntegrityError):
            connection.execute(
                text("UPDATE cardio_sessions SET calories_kcal = -1 WHERE id = 'manual'")
            )
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert "calories_kcal" not in {
            column["name"] for column in inspect(connection).get_columns("cardio_sessions")
        }
        assert connection.scalar(text("SELECT COUNT(*) FROM cardio_sessions")) == 2
