import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text


def test_upgrade_merges_exercises_and_preserves_related_history():
    migration_path = (
        Path(__file__).parents[1] / "migrations/versions/0023_merge_duplicate_exercises.py"
    )
    spec = importlib.util.spec_from_file_location("exercise_merge_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")

    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE exercises (id TEXT PRIMARY KEY, name TEXT, category TEXT, "
                "kind TEXT, muscle_group TEXT, equipment TEXT, is_custom INTEGER, "
                "is_favorite INTEGER, created_at TEXT)"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE exercise_muscle_contributions "
                "(id TEXT, exercise_id TEXT, muscle_name TEXT)"
            )
        )
        for table in ("workout_movements", "personal_records", "machine_photos"):
            connection.execute(text(f"CREATE TABLE {table} (id TEXT, exercise_id TEXT)"))
        connection.execute(text("CREATE TABLE cardio_sessions (id TEXT, source_exercise_id TEXT)"))
        connection.execute(text("CREATE TABLE app_settings (key TEXT, value TEXT)"))
        connection.execute(
            text(
                "INSERT INTO exercises VALUES "
                "('canonical', 'Pec Deck', 'PUSH', 'STRENGTH', 'Chest', 'Machine', 0, 0, '2'), "
                "('alias', 'Machine Chest Fly', 'PUSH', 'STRENGTH', 'Chest', NULL, 1, 1, '1')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO exercise_muscle_contributions VALUES "
                "('canonical-chest', 'canonical', 'Pectorals'), "
                "('alias-chest', 'alias', 'Pectorals'), "
                "('alias-delts', 'alias', 'Front delts')"
            )
        )
        for table in ("workout_movements", "personal_records", "machine_photos"):
            connection.execute(text(f"INSERT INTO {table} VALUES ('related', 'alias')"))
        connection.execute(text("INSERT INTO cardio_sessions VALUES ('cardio', 'alias')"))
        connection.execute(
            text("INSERT INTO app_settings VALUES ('workout_cache_revision', 'before')")
        )

        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()

        assert connection.execute(
            text("SELECT id, name, is_favorite FROM exercises ORDER BY id")
        ).all() == [("canonical", "Pec Deck", 1)]
        for table in ("workout_movements", "personal_records", "machine_photos"):
            assert connection.scalar(text(f"SELECT exercise_id FROM {table}")) == "canonical"
        assert connection.scalar(text("SELECT source_exercise_id FROM cardio_sessions")) == (
            "canonical"
        )
        assert connection.execute(
            text(
                "SELECT muscle_name FROM exercise_muscle_contributions "
                "WHERE exercise_id = 'canonical' ORDER BY muscle_name"
            )
        ).scalars().all() == ["Front delts", "Pectorals"]
        assert (
            connection.scalar(
                text("SELECT value FROM app_settings WHERE key = 'workout_cache_revision'")
            )
            != "before"
        )
