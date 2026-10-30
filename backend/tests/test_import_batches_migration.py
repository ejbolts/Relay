import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_import_batches_migration_preserves_legacy_history_and_account_cascade():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0044_import_batches.py"
    spec = importlib.util.spec_from_file_location("import_batches_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0043_workout_save_sessions"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES ('owner')"))
        connection.execute(text("CREATE TABLE training_workouts (id TEXT PRIMARY KEY, notes TEXT)"))
        connection.execute(text("INSERT INTO training_workouts VALUES ('legacy', 'Keep')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.scalar(text("SELECT count(*) FROM import_batches")) == 0
        connection.execute(
            text("""INSERT INTO import_batches
            (id, user_id, file_name, source, workout_ids, measurements, exercises)
            VALUES ('batch', 'owner', 'sample.csv', 'gym', '[]', '[]', '[]')""")
        )
        connection.execute(text("DELETE FROM users WHERE id='owner'"))
        assert connection.scalar(text("SELECT count(*) FROM import_batches")) == 0
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        migration.downgrade()
        assert "import_batches" not in inspect(connection).get_table_names()
        assert connection.scalar(text("SELECT notes FROM training_workouts")) == "Keep"
