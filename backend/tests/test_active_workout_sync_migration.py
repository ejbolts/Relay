import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_shared_draft_migration_preserves_existing_accounts_and_history():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0057_active_workout_sync.py"
    spec = importlib.util.spec_from_file_location("active_workout_sync_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES ('owner')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        connection.execute(
            text(
                "INSERT INTO active_workout_sync (user_id, revision, reminder_delivered) "
                "VALUES ('owner', 0, 0)"
            )
        )
        assert connection.execute(text("SELECT draft FROM active_workout_sync")).scalar() is None
        migration.downgrade()
        assert "active_workout_sync" not in inspect(connection).get_table_names()
        assert connection.execute(text("SELECT id FROM users")).scalar() == "owner"
