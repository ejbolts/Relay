import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_body_sizes_stay_private_for_existing_accounts():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0063_share_body_sizes.py"
    spec = importlib.util.spec_from_file_location("share_body_sizes_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0062_profile_sex"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            text("CREATE TABLE profile_sharing (user_id TEXT PRIMARY KEY, visibility TEXT)")
        )
        connection.execute(text("INSERT INTO profile_sharing VALUES ('member', 'public')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.scalar(text("SELECT share_body_sizes FROM profile_sharing")) == 0
        migration.downgrade()
        columns = {column["name"] for column in inspect(connection).get_columns("profile_sharing")}
        assert columns == {"user_id", "visibility"}
        assert connection.scalar(text("SELECT visibility FROM profile_sharing")) == "public"
