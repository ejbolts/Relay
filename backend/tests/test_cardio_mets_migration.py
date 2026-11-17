import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError


def test_upgrade_preserves_sessions_and_adds_validated_average_mets():
    migration_path = Path(__file__).parents[1] / "migrations/versions/0025_cardio_mets.py"
    spec = importlib.util.spec_from_file_location("cardio_mets_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            text("CREATE TABLE cardio_sessions (id TEXT PRIMARY KEY, activity_type TEXT)")
        )
        connection.execute(text("INSERT INTO cardio_sessions VALUES ('existing', 'Walking')"))

        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()

        assert connection.execute(
            text("SELECT activity_type, average_mets FROM cardio_sessions")
        ).one() == ("Walking", None)
        connection.execute(text("UPDATE cardio_sessions SET average_mets = 7.5"))
        with pytest.raises(IntegrityError):
            connection.execute(text("UPDATE cardio_sessions SET average_mets = 0"))
        with pytest.raises(IntegrityError):
            connection.execute(text("UPDATE cardio_sessions SET average_mets = 50.1"))

        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()

        columns = {column["name"] for column in inspect(connection).get_columns("cardio_sessions")}
        assert columns == {"id", "activity_type"}
        assert connection.scalar(text("SELECT COUNT(*) FROM cardio_sessions")) == 1
