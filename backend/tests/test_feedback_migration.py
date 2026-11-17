import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_feedback_upgrade_preserves_accounts_and_supports_downgrade():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0031_app_feedback.py"
    spec = importlib.util.spec_from_file_location("feedback_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES ('sample-user')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert "app_feedback" in inspect(connection).get_table_names()
        assert len(inspect(connection).get_indexes("app_feedback")) == 2
        connection.execute(
            text(
                "INSERT INTO app_feedback (id, user_id, submission_id, message) "
                "VALUES ('sample-feedback', 'sample-user', 'sample-submission', 'Thanks!')"
            )
        )
        assert connection.scalar(text("SELECT message FROM app_feedback")) == "Thanks!"
        migration.downgrade()
        assert "app_feedback" not in inspect(connection).get_table_names()
        assert connection.scalar(text("SELECT id FROM users")) == "sample-user"


def load_migration(name):
    path = Path(__file__).resolve().parents[1] / f"migrations/versions/{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def test_feedback_resolution_keeps_existing_feedback_open_and_downgrades():
    feedback = load_migration("0031_app_feedback")
    resolution = load_migration("0035_feedback_resolution")
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES ('sample-user')"))
        operations = Operations(MigrationContext.configure(connection))
        feedback.op = resolution.op = operations
        feedback.upgrade()
        connection.execute(
            text(
                "INSERT INTO app_feedback (id, user_id, submission_id, message) "
                "VALUES ('sample-feedback', 'sample-user', 'sample-submission', 'Thanks!')"
            )
        )
        resolution.upgrade()
        columns = {column["name"] for column in inspect(connection).get_columns("app_feedback")}
        assert {"resolved_at", "resolved_by_id"} <= columns
        assert connection.scalar(text("SELECT resolved_at FROM app_feedback")) is None
        assert connection.scalar(text("SELECT message FROM app_feedback")) == "Thanks!"
        resolution.downgrade()
        columns = {column["name"] for column in inspect(connection).get_columns("app_feedback")}
        assert "resolved_at" not in columns and "resolved_by_id" not in columns
        assert connection.scalar(text("SELECT message FROM app_feedback")) == "Thanks!"
