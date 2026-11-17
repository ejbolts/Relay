import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_upgrade_preserves_privacy_and_marks_only_existing_followers_seen():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0037_follow_notifications.py"
    spec = importlib.util.spec_from_file_location("follow_notifications_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0036_workout_types"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE profile_sharing (user_id TEXT, visibility TEXT)"))
        connection.execute(text("INSERT INTO profile_sharing VALUES ('old', 'private')"))
        connection.execute(text("CREATE TABLE profile_follows (status TEXT)"))
        connection.execute(text("INSERT INTO profile_follows VALUES ('accepted'), ('pending')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.scalar(text("SELECT visibility FROM profile_sharing")) == "private"
        assert connection.execute(
            text("SELECT status, notification_seen FROM profile_follows")
        ).all() == [("accepted", 1), ("pending", 0)]
        connection.execute(text("INSERT INTO profile_follows (status) VALUES ('accepted')"))
        assert (
            connection.scalar(
                text("SELECT count(*) FROM profile_follows WHERE notification_seen = 0")
            )
            == 2
        )
        migration.downgrade()
        assert "notification_seen" not in {
            column["name"] for column in inspect(connection).get_columns("profile_follows")
        }
        assert connection.scalar(text("SELECT count(*) FROM profile_follows")) == 3
