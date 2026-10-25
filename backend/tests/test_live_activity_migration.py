import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_live_activity_migration_shares_by_default_and_cascades_workouts():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0042_live_activity.py"
    spec = importlib.util.spec_from_file_location("live_activity_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0041_workout_comments"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES ('member')"))
        connection.execute(
            text("CREATE TABLE profile_sharing (user_id TEXT PRIMARY KEY, visibility TEXT)")
        )
        connection.execute(text("INSERT INTO profile_sharing VALUES ('member', 'followers')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.execute(
            text("SELECT share_online_status, share_live_workouts FROM profile_sharing")
        ).one() == (1, 1)
        connection.execute(
            text(
                "INSERT INTO live_workouts (user_id, device_id, name, kind, started_at, expires_at)"
                " VALUES ('member', 'phone', 'Push day', 'strength', '2026-10-25', '2026-10-26')"
            )
        )
        connection.execute(text("DELETE FROM users"))
        assert connection.scalar(text("SELECT COUNT(*) FROM live_workouts")) == 0
        migration.downgrade()
        assert "live_workouts" not in inspect(connection).get_table_names()
        columns = {column["name"] for column in inspect(connection).get_columns("profile_sharing")}
        assert columns == {"user_id", "visibility"}
