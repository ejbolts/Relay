import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_set_machine_migration_keeps_history_and_only_backfills_unambiguous_machines():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0054_set_machine.py"
    spec = importlib.util.spec_from_file_location("set_machine_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        for sql in [
            "CREATE TABLE machine_photos (id TEXT PRIMARY KEY, merged_into_id TEXT)",
            "CREATE TABLE movement_machine_photos (movement_id TEXT, machine_photo_id TEXT)",
            "CREATE TABLE workout_sets (id TEXT PRIMARY KEY, movement_id TEXT, reps INTEGER)",
            "INSERT INTO machine_photos VALUES ('a', NULL), ('b', NULL), ('alias', 'a')",
            "INSERT INTO movement_machine_photos VALUES ('single', 'a'), ('mixed', 'a'), "
            "('mixed', 'b'), ('merged', 'a'), ('merged', 'alias')",
            "INSERT INTO workout_sets VALUES ('s1', 'single', 8), ('s2', 'mixed', 10), "
            "('s3', 'none', 12), ('s4', 'merged', 6)",
        ]:
            connection.execute(text(sql))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.execute(
            text("SELECT reps, machine_photo_id FROM workout_sets ORDER BY id")
        ).all() == [(8, "a"), (10, None), (12, None), (6, "a")]
        migration.downgrade()
        assert "machine_photo_id" not in {
            c["name"] for c in inspect(connection).get_columns("workout_sets")
        }
        assert connection.execute(
            text("SELECT reps FROM workout_sets ORDER BY id")
        ).scalars().all() == [8, 10, 12, 6]
