import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_revision_migration_starts_existing_workouts_at_one():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0056_workout_revision.py"
    spec = importlib.util.spec_from_file_location("workout_revision_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0055_remove_ffmi_profiles"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(
            text("CREATE TABLE training_workouts (id TEXT PRIMARY KEY, user_id TEXT, notes TEXT)")
        )
        connection.execute(
            text("INSERT INTO training_workouts VALUES ('old', 'owner', 'Keep note')")
        )
        connection.execute(
            text("CREATE TABLE child (workout_id TEXT REFERENCES training_workouts(id))")
        )
        connection.execute(text("INSERT INTO child VALUES ('old')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.execute(
            text("SELECT notes, revision FROM training_workouts WHERE id='old'")
        ).one() == ("Keep note", 1)
        connection.execute(text("INSERT INTO training_workouts (id, user_id) VALUES ('new', 'x')"))
        assert connection.scalar(text("SELECT revision FROM training_workouts WHERE id='new'")) == 1
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        migration.downgrade()
        columns = {
            column["name"] for column in inspect(connection).get_columns("training_workouts")
        }
        assert columns == {"id", "user_id", "notes"}
        assert connection.scalar(text("SELECT COUNT(*) FROM child")) == 1
