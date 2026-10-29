import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_photo_merge_migration_preserves_existing_photos_and_links():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0045_merged_machine_photos.py"
    spec = importlib.util.spec_from_file_location("photo_merge_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0044_import_batches"
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


def test_import_and_photo_migrations_form_one_preserving_upgrade_path():
    versions = Path(__file__).resolve().parents[1] / "migrations/versions"
    migrations = []
    for filename in ("0044_import_batches.py", "0045_merged_machine_photos.py"):
        spec = importlib.util.spec_from_file_location(
            filename.removesuffix(".py"), versions / filename
        )
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        migrations.append(migration)
    imports, photos = migrations
    assert photos.down_revision == imports.revision
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES ('owner')"))
        connection.execute(text("CREATE TABLE machine_photos (id TEXT PRIMARY KEY, caption TEXT)"))
        connection.execute(text("INSERT INTO machine_photos VALUES ('old', 'Saved press')"))
        operations = Operations(MigrationContext.configure(connection))
        imports.op = operations
        imports.upgrade()
        connection.execute(
            text(
                "INSERT INTO import_batches "
                "(id,user_id,file_name,source,workout_ids,measurements,exercises) "
                "VALUES ('batch','owner','sample.csv','gym','[]','[]','[]')"
            )
        )
        photos.op = operations
        photos.upgrade()
        assert connection.scalar(text("SELECT id FROM import_batches")) == "batch"
        assert connection.execute(
            text("SELECT caption, merged_into_id FROM machine_photos")
        ).one() == ("Saved press", None)
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        photos.downgrade()
        assert connection.scalar(text("SELECT id FROM import_batches")) == "batch"
        assert connection.scalar(text("SELECT caption FROM machine_photos")) == "Saved press"
    engine.dispose()
