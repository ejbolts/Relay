import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_upgrade_keeps_existing_videos_without_assigning_shared_credentials():
    path = Path(__file__).parents[1] / "migrations/versions/0034_youtube_connections.py"
    spec = importlib.util.spec_from_file_location("youtube_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE user_sessions (id VARCHAR(36) PRIMARY KEY)"))
        connection.execute(
            text(
                "CREATE TABLE sessions (id VARCHAR(36) PRIMARY KEY, youtube_video_id VARCHAR(100))"
            )
        )
        connection.execute(text("INSERT INTO sessions VALUES ('existing', 'existing-video')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert {"youtube_connections", "youtube_oauth_states"} <= set(
            inspect(connection).get_table_names()
        )
        assert connection.execute(
            text("SELECT youtube_video_id, youtube_channel_id FROM sessions")
        ).one() == ("existing-video", None)
        assert connection.scalar(text("SELECT COUNT(*) FROM youtube_connections")) == 0
        migration.downgrade()
        assert "youtube_connections" not in inspect(connection).get_table_names()
        assert connection.scalar(text("SELECT youtube_video_id FROM sessions")) == "existing-video"
