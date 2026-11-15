import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text


def test_migration_deletes_only_ffmi_profile_settings():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0055_remove_ffmi_profiles.py"
    spec = importlib.util.spec_from_file_location("remove_ffmi_profiles_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0054_set_machine"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE user_settings (user_id TEXT, key TEXT, value TEXT,"
                " PRIMARY KEY (user_id, key))"
            )
        )
        connection.execute(
            text(
                "INSERT INTO user_settings VALUES"
                " ('member', 'ffmi_profile', '{\"height_cm\": 180}'),"
                " ('friend', 'ffmi_profile', '{}'),"
                " ('member', 'body_sizes:2026-11-01', '{\"waist_cm\": 82}'),"
                " ('member', 'training_split', '{}'),"
                " ('friend', 'ffmi_profile_notes', 'kept')"
            )
        )
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        remaining = connection.execute(
            text("SELECT user_id, key FROM user_settings ORDER BY user_id, key")
        ).all()
        assert remaining == [
            ("friend", "ffmi_profile_notes"),
            ("member", "body_sizes:2026-11-01"),
            ("member", "training_split"),
        ]
        migration.downgrade()
        assert connection.scalar(text("SELECT COUNT(*) FROM user_settings")) == 3
