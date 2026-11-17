import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def load_migration():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0040_friendships.py"
    spec = importlib.util.spec_from_file_location("friendships_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def test_upgrade_turns_follows_into_friendships_and_downgrade_restores_follows():
    migration = load_migration()
    assert migration.down_revision == "0039_profile_blocks"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY)"))
        connection.execute(
            text("INSERT INTO users VALUES ('a'), ('b'), ('c'), ('d'), ('e'), ('f'), ('g')")
        )
        connection.execute(text("CREATE TABLE profile_sharing (user_id TEXT, visibility TEXT)"))
        connection.execute(text("INSERT INTO profile_sharing VALUES ('a', 'followers')"))
        connection.execute(
            text(
                "CREATE TABLE profile_follows (follower_id TEXT, followee_id TEXT, status TEXT, "
                "created_at DATETIME, accepted_at DATETIME, notification_seen BOOLEAN, "
                "PRIMARY KEY (follower_id, followee_id))"
            )
        )
        connection.execute(
            text("CREATE INDEX ix_profile_follows_followee_id ON profile_follows (followee_id)")
        )
        connection.execute(
            text(
                "INSERT INTO profile_follows VALUES "
                # Mutual follows: friends since the earlier acceptance.
                "('a', 'b', 'accepted', '2026-01-01 10:00:00', '2026-01-02 10:00:00', 1), "
                "('b', 'a', 'accepted', '2026-01-03 10:00:00', '2026-01-04 10:00:00', 1), "
                # A one-way accepted follow is enough, whichever account sorts first.
                "('d', 'c', 'accepted', '2026-02-01 10:00:00', '2026-02-05 10:00:00', 0), "
                # An accepted follow wins over a pending one in the other direction.
                "('e', 'a', 'pending', '2026-03-01 10:00:00', NULL, 0), "
                "('a', 'e', 'accepted', '2026-03-02 10:00:00', '2026-03-03 10:00:00', 1), "
                # Pending only: the earliest request waits for the other member.
                "('g', 'f', 'pending', '2026-04-02 10:00:00', NULL, 1), "
                "('f', 'g', 'pending', '2026-04-03 10:00:00', NULL, 0)"
            )
        )
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        assert "profile_follows" not in inspect(connection).get_table_names()
        rows = connection.execute(
            text(
                "SELECT member_a_id, member_b_id, requested_by_id, status, created_at, "
                "accepted_at, notification_seen FROM friendships ORDER BY member_a_id"
            )
        ).all()
        assert [tuple(row) for row in rows] == [
            ("a", "b", "a", "accepted", "2026-01-01 10:00:00", "2026-01-02 10:00:00", 1),
            ("a", "e", "e", "accepted", "2026-03-01 10:00:00", "2026-03-03 10:00:00", 1),
            ("c", "d", "d", "accepted", "2026-02-01 10:00:00", "2026-02-05 10:00:00", 1),
            ("f", "g", "g", "pending", "2026-04-02 10:00:00", None, 1),
        ]
        assert connection.scalar(text("SELECT visibility FROM profile_sharing")) == "followers"
        # The ordered-pair constraint keeps one row per pair.
        connection.execute(
            text(
                "INSERT INTO friendships (member_a_id, member_b_id, requested_by_id, status) "
                "VALUES ('b', 'c', 'c', 'pending')"
            )
        )

        migration.downgrade()
        assert "friendships" not in inspect(connection).get_table_names()
        follows = connection.execute(
            text(
                "SELECT follower_id, followee_id, status, notification_seen FROM profile_follows "
                "ORDER BY follower_id, followee_id"
            )
        ).all()
        assert [tuple(row) for row in follows] == [
            ("a", "b", "accepted", 1),
            ("a", "e", "accepted", 1),
            ("b", "a", "accepted", 1),
            ("c", "b", "pending", 0),
            ("c", "d", "accepted", 1),
            ("d", "c", "accepted", 1),
            ("e", "a", "accepted", 1),
            ("g", "f", "pending", 1),
        ]


def test_friendship_pairs_are_ordered_and_requesters_are_members():
    migration = load_migration()
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY)"))
        connection.execute(
            text(
                "CREATE TABLE profile_follows (follower_id TEXT, followee_id TEXT, status TEXT, "
                "created_at DATETIME, accepted_at DATETIME, notification_seen BOOLEAN)"
            )
        )
        connection.execute(
            text("CREATE INDEX ix_profile_follows_followee_id ON profile_follows (followee_id)")
        )
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        for values in ("('b', 'a', 'a', 'pending')", "('a', 'b', 'c', 'pending')"):
            savepoint = connection.begin_nested()
            try:
                connection.execute(
                    text(
                        "INSERT INTO friendships (member_a_id, member_b_id, requested_by_id, "
                        f"status) VALUES {values}"
                    )
                )
            except Exception:
                savepoint.rollback()
            else:
                raise AssertionError(f"Accepted invalid friendship {values}")
