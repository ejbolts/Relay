import importlib.util
import os
import subprocess
import sys
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

BACKEND = Path(__file__).parents[1]
OWNED_TABLES = (
    "sessions",
    "push_subscriptions",
    "active_workout_reminders",
    "body_measurements",
    "body_weight_goals",
    "exercises",
    "machine_photos",
    "training_workouts",
    "personal_records",
    "cardio_sessions",
)


def load_migration():
    path = BACKEND / "migrations/versions/0027_multi_user_auth.py"
    spec = importlib.util.spec_from_file_location("multi_user_auth_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def create_legacy_schema(connection) -> None:
    """The pre-accounts shape: single-user tables with inline (unnamed) UNIQUE constraints."""
    statements = (
        "CREATE TABLE app_settings (key VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL)",
        "CREATE TABLE sessions (id VARCHAR(36) PRIMARY KEY, name VARCHAR(200) NOT NULL)",
        """CREATE TABLE push_subscriptions (
            id VARCHAR(36) PRIMARY KEY, endpoint TEXT NOT NULL, UNIQUE (endpoint))""",
        """CREATE TABLE active_workout_reminders (
            endpoint VARCHAR(2000) PRIMARY KEY, timer_id VARCHAR(100) NOT NULL)""",
        """CREATE TABLE body_measurements (
            id VARCHAR(36) PRIMARY KEY, measurement_date DATE NOT NULL,
            weight_kg FLOAT NOT NULL, UNIQUE (measurement_date))""",
        """CREATE TABLE body_weight_goals (
            id VARCHAR(36) PRIMARY KEY, start_weight_kg FLOAT NOT NULL)""",
        """CREATE TABLE exercises (
            id VARCHAR(36) PRIMARY KEY, name VARCHAR(160) NOT NULL,
            is_favorite BOOLEAN DEFAULT '0' NOT NULL, UNIQUE (name))""",
        """CREATE TABLE machine_photos (
            id VARCHAR(36) PRIMARY KEY, exercise_id VARCHAR(36) NOT NULL REFERENCES exercises (id),
            full_filename VARCHAR(200) NOT NULL, UNIQUE (full_filename))""",
        "CREATE TABLE training_workouts (id VARCHAR(36) PRIMARY KEY, name VARCHAR(200) NOT NULL)",
        """CREATE TABLE workout_movements (
            id VARCHAR(36) PRIMARY KEY,
            workout_id VARCHAR(36) NOT NULL REFERENCES training_workouts (id) ON DELETE CASCADE,
            exercise_id VARCHAR(36) NOT NULL REFERENCES exercises (id))""",
        "CREATE TABLE personal_records (id VARCHAR(36) PRIMARY KEY, value FLOAT NOT NULL)",
        "CREATE TABLE cardio_sessions (id VARCHAR(36) PRIMARY KEY, activity_type VARCHAR(100))",
    )
    for statement in statements:
        connection.execute(text(statement))
    seed = (
        "INSERT INTO app_settings VALUES ('week_start', 'sunday')",
        "INSERT INTO sessions VALUES ('video-1', 'Legs')",
        "INSERT INTO push_subscriptions VALUES ('push-1', 'https://push.example.test/a')",
        "INSERT INTO active_workout_reminders VALUES ('https://push.example.test/a', 'timer')",
        "INSERT INTO body_measurements VALUES ('bm-1', '2026-07-01', 80)",
        "INSERT INTO body_weight_goals VALUES ('goal-1', 80)",
        "INSERT INTO exercises (id, name) VALUES ('ex-1', 'Back Squat')",
        "INSERT INTO machine_photos VALUES ('photo-1', 'ex-1', 'photo.webp')",
        "INSERT INTO training_workouts VALUES ('w-1', 'Legs')",
        "INSERT INTO workout_movements VALUES ('mv-1', 'w-1', 'ex-1')",
        "INSERT INTO personal_records VALUES ('pr-1', 100)",
        "INSERT INTO cardio_sessions VALUES ('c-1', 'Walking')",
    )
    for statement in seed:
        connection.execute(text(statement))


def foreign_key_targets(inspector, table: str) -> set[str]:
    return {key["referred_table"] for key in inspector.get_foreign_keys(table)}


def test_upgrade_adds_ownership_and_keeps_legacy_rows_unclaimed():
    migration = load_migration()
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        create_legacy_schema(connection)
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()

        inspector = inspect(connection)
        assert {"users", "user_sessions", "user_settings"} <= set(inspector.get_table_names())
        assert {column["name"] for column in inspector.get_columns("users")} == {
            "id",
            "email",
            "display_name",
            "password_hash",
            "is_admin",
            "created_at",
            "updated_at",
        }
        assert {column["name"] for column in inspector.get_columns("user_sessions")} == {
            "id",
            "user_id",
            "token_hash",
            "created_at",
            "expires_at",
            "last_seen_at",
            "user_agent",
        }
        assert inspector.get_pk_constraint("user_settings")["constrained_columns"] == [
            "user_id",
            "key",
        ]
        for table in OWNED_TABLES:
            columns = {column["name"]: column for column in inspector.get_columns(table)}
            assert columns["user_id"]["nullable"] is True, table
            assert "users" in foreign_key_targets(inspector, table), table
            assert any(
                index["column_names"] == ["user_id"] for index in inspector.get_indexes(table)
            ), table
            assert connection.scalar(text(f"SELECT COUNT(*) FROM {table}")) == 1
            assert (
                connection.scalar(text(f"SELECT COUNT(*) FROM {table} WHERE user_id IS NULL")) == 1
            )

        # Child tables keep pointing at the rebuilt parent.
        assert "exercises" in foreign_key_targets(inspector, "workout_movements")
        assert "exercises" in foreign_key_targets(inspector, "machine_photos")
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        # Global-by-design uniqueness is retained.
        unique_sets = [
            set(item["column_names"])
            for item in inspector.get_unique_constraints("push_subscriptions")
        ]
        assert {"endpoint"} in unique_sets
        assert connection.scalar(text("SELECT value FROM app_settings WHERE key='week_start'"))


def test_upgrade_makes_exercise_names_and_measurement_dates_unique_per_user():
    migration = load_migration()
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        create_legacy_schema(connection)
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        for user_id in ("u1", "u2"):
            connection.execute(
                text(
                    "INSERT INTO users (id, email, display_name, password_hash) "
                    "VALUES (:id, :email, 'N', 'h')"
                ),
                {"id": user_id, "email": f"{user_id}@example.com"},
            )
            connection.execute(
                text("INSERT INTO exercises (id, name, user_id) VALUES (:id, 'Deadlift', :user)"),
                {"id": f"ex-{user_id}", "user": user_id},
            )
            connection.execute(
                text(
                    "INSERT INTO body_measurements (id, measurement_date, weight_kg, user_id) "
                    "VALUES (:id, '2026-07-02', 90, :user)"
                ),
                {"id": f"bm-{user_id}", "user": user_id},
            )

        for statement in (
            "INSERT INTO exercises (id, name, user_id) VALUES ('dup', 'Deadlift', 'u1')",
            "INSERT INTO body_measurements (id, measurement_date, weight_kg, user_id) "
            "VALUES ('dup', '2026-07-02', 90, 'u1')",
        ):
            nested = connection.begin_nested()
            with pytest.raises(IntegrityError):
                connection.execute(text(statement))
            nested.rollback()


def test_downgrade_restores_the_single_user_schema_for_one_account():
    migration = load_migration()
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        create_legacy_schema(connection)
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        connection.execute(
            text(
                "INSERT INTO users (id, email, display_name, password_hash) "
                "VALUES ('u1', 'u1@example.com', 'N', 'h')"
            )
        )
        connection.execute(
            text("INSERT INTO user_settings VALUES ('u1', 'week_start', 'saturday')")
        )

        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()

        inspector = inspect(connection)
        assert not {"users", "user_sessions", "user_settings"} & set(inspector.get_table_names())
        for table in OWNED_TABLES:
            assert "user_id" not in {column["name"] for column in inspector.get_columns(table)}
            assert connection.scalar(text(f"SELECT COUNT(*) FROM {table}")) == 1
        assert connection.scalar(text("SELECT value FROM app_settings WHERE key='week_start'")) == (
            "saturday"
        )
        with pytest.raises(IntegrityError):
            connection.execute(text("INSERT INTO exercises (id, name) VALUES ('x', 'Back Squat')"))


def test_downgrade_refuses_to_discard_a_multi_user_database():
    migration = load_migration()
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        create_legacy_schema(connection)
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        for user_id in ("u1", "u2"):
            connection.execute(
                text(
                    "INSERT INTO users (id, email, display_name, password_hash) "
                    "VALUES (:id, :email, 'N', 'h')"
                ),
                {"id": user_id, "email": f"{user_id}@example.com"},
            )
        with Operations.context(MigrationContext.configure(connection)):
            with pytest.raises(RuntimeError, match="more than one account"):
                migration.downgrade()


def run_alembic(database_path: Path, *arguments: str) -> subprocess.CompletedProcess:
    root = BACKEND.parent
    environment = {
        **os.environ,
        "GYM_DATABASE_PATH": str(database_path),
        "GYM_DATA_DIR": str(database_path.parent / "data"),
    }
    return subprocess.run(
        [sys.executable, "-m", "alembic", *arguments],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=300,
    )


def test_alembic_upgrade_head_works_on_an_empty_database(tmp_path):
    database = tmp_path / "fresh.db"

    first = run_alembic(database, "upgrade", "head")
    assert first.returncode == 0, first.stderr
    engine = create_engine(f"sqlite:///{database.as_posix()}")
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == (
            "0042_exercise_partial_sets"
        )
        tables = set(inspect(connection).get_table_names())
        assert {"users", "user_sessions", "user_settings", "exercises", "account_backups"} <= tables
        assert "profile_sharing" in tables
        assert {"youtube_connections", "youtube_oauth_states"} <= tables
        assert "workout_types" in tables
        assert "workout_reactions" in tables
        assert "profile_blocks" in tables
        assert "friendships" in tables and "profile_follows" not in tables
        assert {"resolved_at", "resolved_by_id"} <= {
            item["name"] for item in inspect(connection).get_columns("app_feedback")
        }
        assert "workout_type_id" in {
            item["name"] for item in inspect(connection).get_columns("training_workouts")
        }

    again = run_alembic(database, "upgrade", "head")
    assert again.returncode == 0, again.stderr
    engine.dispose()
