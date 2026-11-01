import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError


def load(name, operations):
    path = Path(__file__).resolve().parents[1] / f"migrations/versions/{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    migration.op = operations
    return migration


def test_run_reaction_preserves_existing_data_and_downgrades():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(text("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE training_workouts (id VARCHAR(36) PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES ('a'), ('b')"))
        connection.execute(text("INSERT INTO training_workouts VALUES ('workout')"))
        operations = Operations(MigrationContext.configure(connection))
        load("0038_workout_reactions", operations).upgrade()
        load("0041_workout_comments", operations).upgrade()
        connection.execute(
            text(
                "INSERT INTO workout_comments (id, workout_id, user_id, body) "
                "VALUES ('comment', 'workout', 'a', 'Great run!')"
            )
        )
        for table, key, value in (
            ("workout_reactions", "workout_id", "workout"),
            ("comment_reactions", "comment_id", "comment"),
        ):
            connection.execute(
                text(f"INSERT INTO {table} ({key}, user_id, reaction) VALUES (:id, 'a', 'fire')"),
                {"id": value},
            )
        connection.execute(text("UPDATE workout_reactions SET notification_seen = 1"))
        before = {
            table: connection.execute(text(f"SELECT * FROM {table}")).all()
            for table in ("workout_reactions", "comment_reactions", "workout_comments")
        }
        indexes = inspect(connection).get_indexes("workout_reactions")
        migration = load("0049_run_reaction", operations)
        migration.upgrade()
        for table, rows in before.items():
            assert connection.execute(text(f"SELECT * FROM {table}")).all() == rows
        assert inspect(connection).get_indexes("workout_reactions") == indexes
        for table, key, value in (
            ("workout_reactions", "workout_id", "workout"),
            ("comment_reactions", "comment_id", "comment"),
        ):
            connection.execute(
                text(f"INSERT INTO {table} ({key}, user_id, reaction) VALUES (:id, 'b', 'run')"),
                {"id": value},
            )
        connection.execute(text("UPDATE workout_comments SET reaction = 'run'"))
        connection.execute(
            text(
                "INSERT INTO comment_notifications "
                "(id, comment_id, recipient_id, actor_id, kind, reaction) "
                "VALUES ('notice', 'comment', 'a', 'b', 'comment_reaction', 'run')"
            )
        )
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []

        migration.downgrade()
        for table in ("workout_reactions", "comment_reactions"):
            assert connection.execute(text(f"SELECT user_id, reaction FROM {table}")).all() == [
                ("a", "fire")
            ]
        assert connection.scalar(text("SELECT notification_seen FROM workout_reactions")) == 1
        for table in ("workout_comments", "comment_notifications"):
            assert connection.scalar(text(f"SELECT count(*) FROM {table}")) == 1
            assert connection.scalar(text(f"SELECT reaction FROM {table}")) is None
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(
                text(
                    "INSERT INTO comment_reactions (comment_id, user_id, reaction) "
                    "VALUES ('comment', 'b', 'run')"
                )
            )
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    engine.dispose()
