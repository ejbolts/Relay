import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def load(name: str):
    path = Path(__file__).resolve().parents[1] / f"migrations/versions/{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_auto_save_columns_keep_existing_drafts():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES ('owner')"))
        operations = Operations(MigrationContext.configure(connection))
        sync, auto_save = load("0057_active_workout_sync"), load("0059_workout_auto_save")
        sync.op = auto_save.op = operations
        sync.upgrade()
        connection.execute(
            text(
                "INSERT INTO active_workout_sync (user_id, revision, draft, reminder_delivered) "
                "VALUES ('owner', 4, '{\"name\": \"Upper\"}', 0)"
            )
        )
        auto_save.upgrade()
        columns = {item["name"] for item in inspect(connection).get_columns("active_workout_sync")}
        assert {"auto_save", "auto_save_client_version"} <= columns
        row = connection.execute(
            text("SELECT revision, draft, auto_save FROM active_workout_sync")
        ).one()
        assert row == (4, '{"name": "Upper"}', None)
        auto_save.downgrade()
        columns = {item["name"] for item in inspect(connection).get_columns("active_workout_sync")}
        assert "auto_save" not in columns
        assert connection.execute(text("SELECT revision FROM active_workout_sync")).scalar() == 4
