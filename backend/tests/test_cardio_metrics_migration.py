import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError


def test_upgrade_preserves_sessions_and_adds_validated_performance_metrics():
    migration_path = (
        Path(__file__).parents[1] / "migrations/versions/0018_cardio_performance_metrics.py"
    )
    spec = importlib.util.spec_from_file_location("cardio_metrics_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE cardio_sessions "
                "(id TEXT PRIMARY KEY, activity_type TEXT, calories_kcal INTEGER)"
            )
        )
        connection.execute(text("INSERT INTO cardio_sessions VALUES ('existing', 'Walk', 350)"))

        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()

        row = connection.execute(
            text(
                "SELECT calories_kcal, average_heart_rate_bpm, distance_km, "
                "average_speed_kph, incline_percent FROM cardio_sessions"
            )
        ).one()
        assert row == (350, None, None, None, None)

        connection.execute(
            text(
                "UPDATE cardio_sessions SET average_heart_rate_bpm = 142, "
                "distance_km = 5.2, average_speed_kph = 10.4, incline_percent = 7"
            )
        )
        with pytest.raises(IntegrityError):
            connection.execute(text("UPDATE cardio_sessions SET average_heart_rate_bpm = 251"))

        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()

        columns = {column["name"] for column in inspect(connection).get_columns("cardio_sessions")}
        assert columns == {"id", "activity_type", "calories_kcal"}
        assert connection.scalar(text("SELECT COUNT(*) FROM cardio_sessions")) == 1
