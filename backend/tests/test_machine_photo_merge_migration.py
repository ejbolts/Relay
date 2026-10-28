import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_photo_merge_migration_preserves_existing_photos_and_links():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0044_merged_machine_photos.py"
    spec = importlib.util.spec_from_file_location("photo_merge_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0043_workout_save_sessions"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(text("CREATE TABLE machine_photos (id TEXT PRIMARY KEY, caption TEXT)"))
        connection.execute(
            text(
                "CREATE TABLE movement_machine_photos (movement_id TEXT, "
                "machine_photo_id TEXT REFERENCES machine_photos(id))"
            )
        )
        connection.execute(text("INSERT INTO machine_photos VALUES ('old', 'Saved press')"))
        connection.execute(text("INSERT INTO movement_machine_photos VALUES ('workout', 'old')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.execute(
            text("SELECT caption, merged_into_id FROM machine_photos")
        ).one() == ("Saved press", None)
        assert (
            connection.scalar(text("SELECT machine_photo_id FROM movement_machine_photos")) == "old"
        )
        assert (
            inspect(connection).get_foreign_keys("machine_photos")[0]["referred_table"]
            == "machine_photos"
        )
        migration.downgrade()
        assert "merged_into_id" not in {
            col["name"] for col in inspect(connection).get_columns("machine_photos")
        }
        assert connection.scalar(text("SELECT caption FROM machine_photos")) == "Saved press"
