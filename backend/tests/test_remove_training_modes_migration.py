import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_upgrade_removes_modes_and_preserves_body_weight_goals():
    migration_path = Path(__file__).parents[1] / "migrations/versions/0026_remove_training_modes.py"
    spec = importlib.util.spec_from_file_location("remove_training_modes_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")

    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT)"))
        connection.execute(
            text(
                """
                CREATE TABLE body_weight_goals (
                    id TEXT PRIMARY KEY,
                    start_date DATE NOT NULL,
                    target_date DATE NOT NULL,
                    start_weight_kg FLOAT NOT NULL,
                    target_weight_kg FLOAT NOT NULL,
                    mode TEXT NOT NULL,
                    active BOOLEAN NOT NULL,
                    created_at DATETIME NOT NULL
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE training_phases (
                    id TEXT PRIMARY KEY,
                    start_date DATE NOT NULL UNIQUE,
                    mode TEXT NOT NULL,
                    created_at DATETIME NOT NULL
                )
                """
            )
        )
        connection.execute(
            text(
                """
                INSERT INTO body_weight_goals VALUES (
                    'goal-1', '2026-07-30', '2026-12-30', 100, 92,
                    'CUT', 1, '2026-07-30 08:00:00'
                )
                """
            )
        )
        connection.execute(
            text(
                """
                INSERT INTO training_phases
                VALUES ('phase-1', '2026-07-30', 'CUT', CURRENT_TIMESTAMP)
                """
            )
        )
        connection.execute(
            text(
                "INSERT INTO app_settings VALUES ('training_mode', 'cut'), ('week_start', 'monday')"
            )
        )

        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()

        inspector = inspect(connection)
        assert not inspector.has_table("training_phases")
        assert {column["name"] for column in inspector.get_columns("body_weight_goals")} == {
            "id",
            "start_date",
            "target_date",
            "start_weight_kg",
            "target_weight_kg",
            "active",
            "created_at",
        }
        assert connection.execute(
            text(
                """
                SELECT id, start_date, target_date, start_weight_kg,
                       target_weight_kg, active
                FROM body_weight_goals
                """
            )
        ).one() == ("goal-1", "2026-07-30", "2026-12-30", 100.0, 92.0, 1)
        assert connection.execute(text("SELECT key, value FROM app_settings")).all() == [
            ("week_start", "monday")
        ]

        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()

        inspector = inspect(connection)
        assert inspector.has_table("training_phases")
        assert "mode" in {column["name"] for column in inspector.get_columns("body_weight_goals")}
        assert (
            connection.scalar(text("SELECT mode FROM body_weight_goals WHERE id = 'goal-1'"))
            == "MAINTENANCE"
        )
