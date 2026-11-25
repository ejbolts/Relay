import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_expo_push_token_migration_adds_and_removes_only_its_table():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0066_expo_push_tokens.py"
    spec = importlib.util.spec_from_file_location("expo_push_tokens_migration", path)
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
                "INSERT INTO expo_push_tokens (id, user_id, token, local_alerts) "
                "VALUES ('t', 'owner', 'ExponentPushToken[abcdefgh]', '[]')"
            )
        )
        indexes = {index["name"] for index in inspect(connection).get_indexes("expo_push_tokens")}
        assert {"ix_expo_push_tokens_user_id", "ix_expo_push_tokens_session_id"} <= indexes
        migration.downgrade()
        assert "expo_push_tokens" not in inspect(connection).get_table_names()
        assert connection.execute(text("SELECT id FROM users")).scalar() == "owner"
