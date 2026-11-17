import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_upgrade_and_downgrade_preserve_accounts_and_existing_sharing():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0039_profile_blocks.py"
    spec = importlib.util.spec_from_file_location("profile_blocks_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0038_workout_reactions"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES ('owner'), ('follower')"))
        connection.execute(text("CREATE TABLE profile_sharing (user_id TEXT, visibility TEXT)"))
        connection.execute(text("INSERT INTO profile_sharing VALUES ('owner', 'private')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.scalar(text("SELECT COUNT(*) FROM profile_blocks")) == 0
        connection.execute(
            text("INSERT INTO profile_blocks (blocker_id, blocked_id) VALUES ('owner', 'follower')")
        )
        assert connection.scalar(text("SELECT COUNT(*) FROM profile_blocks")) == 1
        migration.downgrade()
        assert "profile_blocks" not in inspect(connection).get_table_names()
        assert connection.scalar(text("SELECT COUNT(*) FROM users")) == 2
        assert connection.scalar(text("SELECT visibility FROM profile_sharing")) == "private"
