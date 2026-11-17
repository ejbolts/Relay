import importlib.util
import json
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_machine_settings_migration_preserves_old_movements():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0042_machine_settings.py"
    spec = importlib.util.spec_from_file_location("machine_settings_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0041_workout_comments"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE workout_movements (id TEXT PRIMARY KEY, notes TEXT)"))
        connection.execute(text("INSERT INTO workout_movements VALUES ('old', 'Keep this note')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        record = connection.execute(text("SELECT notes, machine_settings FROM workout_movements"))
        notes, settings = record.one()
        assert notes == "Keep this note"
        assert json.loads(settings) == []
        migration.downgrade()
        assert "machine_settings" not in {
            c["name"] for c in inspect(connection).get_columns("workout_movements")
        }
        assert connection.scalar(text("SELECT notes FROM workout_movements")) == "Keep this note"
