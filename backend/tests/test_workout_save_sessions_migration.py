import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError


def test_save_session_migration_preserves_workouts_and_deduplicates_per_account():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0043_workout_save_sessions.py"
    spec = importlib.util.spec_from_file_location("workout_save_sessions_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0042_machine_settings"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(
            text("CREATE TABLE training_workouts (id TEXT PRIMARY KEY, user_id TEXT, notes TEXT)")
        )
        connection.execute(
            text("INSERT INTO training_workouts VALUES ('old', 'owner', 'Keep note')")
        )
        connection.execute(
            text("CREATE TABLE child (workout_id TEXT REFERENCES training_workouts(id))")
        )
        connection.execute(text("INSERT INTO child VALUES ('old')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.execute(
            text("SELECT notes, client_session_id FROM training_workouts WHERE id='old'")
        ).one() == ("Keep note", None)
        insert = text(
            "INSERT INTO training_workouts (id, user_id, client_session_id) "
            "VALUES (:id, :user, :session)"
        )
        for item_id, user_id, session_id in [
            ("one", "owner", "session"),
            ("two", "other", "session"),
            ("legacy-one", "owner", None),
            ("legacy-two", "owner", None),
        ]:
            connection.execute(insert, {"id": item_id, "user": user_id, "session": session_id})
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(insert, {"id": "duplicate", "user": "owner", "session": "session"})
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        migration.downgrade()
        assert "client_session_id" not in {
            item["name"] for item in inspect(connection).get_columns("training_workouts")
        }
        assert connection.scalar(text("SELECT notes FROM training_workouts WHERE id='old'")) == (
            "Keep note"
        )
        assert connection.scalar(text("SELECT workout_id FROM child")) == "old"
