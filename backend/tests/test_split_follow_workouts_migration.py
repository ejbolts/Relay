import importlib.util
import json
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text


def load(operations):
    name = "0050_split_follow_workouts"
    path = Path(__file__).resolve().parents[1] / f"migrations/versions/{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    migration.op = operations
    return migration


def test_every_saved_split_follows_workouts_and_downgrades_to_calendar():
    engine = create_engine("sqlite://")
    legacy = {"name": "PPL", "enabled": True, "start_date": "2026-10-26", "steps": []}
    rows = {
        ("a", "training_split"): json.dumps(legacy),
        ("b", "training_split"): json.dumps({**legacy, "progression": "calendar"}),
        ("c", "training_split"): "not json",
        ("a", "weight_unit"): '"kg"',
    }
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE user_settings (user_id TEXT, key TEXT, value TEXT)"))
        for (user, key), value in rows.items():
            connection.execute(
                text("INSERT INTO user_settings VALUES (:user, :key, :value)"),
                {"user": user, "key": key, "value": value},
            )

        def stored():
            return {
                (user, key): value
                for user, key, value in connection.execute(
                    text("SELECT user_id, key, value FROM user_settings")
                )
            }

        migration = load(Operations(MigrationContext.configure(connection)))
        migration.upgrade()
        after = stored()
        for user in ("a", "b"):
            assert json.loads(after[(user, "training_split")]) == {
                **legacy,
                "progression": "workouts",
            }
        assert after[("c", "training_split")] == "not json"
        assert after[("a", "weight_unit")] == '"kg"'
        migration.downgrade()
        assert json.loads(stored()[("a", "training_split")])["progression"] == "calendar"
