import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_comment_migration_preserves_workouts_and_cascades_discussion():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0041_workout_comments.py"
    spec = importlib.util.spec_from_file_location("comments_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0040_friendships"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES ('owner'), ('friend')"))
        connection.execute(text("CREATE TABLE training_workouts (id TEXT PRIMARY KEY)"))
        connection.execute(text("INSERT INTO training_workouts VALUES ('workout')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        connection.execute(
            text(
                "INSERT INTO workout_comments (id, workout_id, user_id, body) "
                "VALUES ('c1', 'workout', 'friend', 'Great!')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO workout_comments "
                "(id, workout_id, user_id, body, parent_id, reply_to_id) "
                "VALUES ('c2', 'workout', 'owner', 'Thanks!', 'c1', 'c1')"
            )
        )
        connection.execute(text("INSERT INTO comment_reactions VALUES ('c1', 'owner', 'strong')"))
        connection.execute(
            text(
                "INSERT INTO comment_notifications "
                "(id, comment_id, recipient_id, actor_id, kind) "
                "VALUES ('n1', 'c1', 'owner', 'friend', 'comment')"
            )
        )
        connection.execute(text("DELETE FROM workout_comments WHERE id='c1'"))
        assert connection.scalar(text("SELECT COUNT(*) FROM workout_comments")) == 0
        assert connection.scalar(text("SELECT COUNT(*) FROM comment_reactions")) == 0
        assert connection.scalar(text("SELECT COUNT(*) FROM comment_notifications")) == 0
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        migration.downgrade()
        assert "workout_comments" not in inspect(connection).get_table_names()
        assert connection.scalar(text("SELECT COUNT(*) FROM training_workouts")) == 1
        assert connection.scalar(text("SELECT COUNT(*) FROM users")) == 2
