from collections import Counter

import pytest
from conftest import register_user
from fastapi.testclient import TestClient
from test_run_reaction_migration import load
from test_sharing import befriend, share
from test_workout_comments import post
from test_workout_reactions import log_workout

from app.reactions import is_single_emoji, ordered_counts, reaction_key


@pytest.fixture
def third_client(client):
    with TestClient(client.app) as third:
        third.user = register_user(third, "third", "Third")
        yield third


@pytest.fixture
def discussion(client, other_client):
    share(client)
    share(other_client, "followers")
    befriend(client, other_client)
    workout = log_workout(other_client, "Bench day", 0)
    return f"/api/sharing/workouts/{workout['id']}/comments"


@pytest.mark.parametrize(
    "emoji",
    [
        "🫡",
        "😮‍💨",
        "👍🏽",
        "🧑🏻‍🦰",
        "👩🏻‍❤️‍💋‍👨🏼",
        "👨‍👩‍👧‍👦",
        "🏳️‍🌈",
        "🇦🇺",
        "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
        "1️⃣",
        "#️⃣",
        "☀️",
        "❤️‍🔥",
    ],
)
def test_single_emojis_are_reactions(emoji):
    assert is_single_emoji(emoji)
    assert reaction_key(emoji) == emoji


@pytest.mark.parametrize(
    "value",
    ["", " ", "a", "1", "hi", "👍👍", "🔥 🔥", "👍a", "🇦", "🇦🇺🇳🇿", "\u200d", "🏴\U000e0067", "🏽"],
)
def test_text_and_several_emojis_are_not_reactions(value):
    assert not is_single_emoji(value)
    with pytest.raises(ValueError):
        reaction_key(value)


def test_original_emojis_keep_their_names_so_older_apps_show_them():
    for name, emoji in {"like": "👍", "love": "❤️", "fire": "🔥", "run": "🏃"}.items():
        assert reaction_key(emoji) == name
        assert reaction_key(name) == name
    # Hearts typed without the emoji style still count as Love.
    assert reaction_key("❤") == "love"
    assert reaction_key("🏃‍♀️") == "🏃‍♀️"


def test_counts_list_original_reactions_first_then_the_most_used():
    counts = Counter({"🫡": 1, "fire": 2, "😮‍💨": 3, "like": 1, "🙌": 3, "love": 0})
    assert ordered_counts(counts) == [
        ("like", 1),
        ("fire", 2),
        ("😮‍💨", 3),
        ("🙌", 3),
        ("🫡", 1),
    ]


def test_any_emoji_reaches_the_feed_people_and_notifications(client, other_client, third_client):
    share(client, "public")
    share(other_client, "public")
    share(third_client, "public")
    befriend(client, other_client)
    workout = log_workout(client, "Leg day", 0)
    url = f"/api/sharing/workouts/{workout['id']}/reaction"
    response = other_client.put(url, json={"reaction": "🫡"})
    assert response.status_code == 200, response.text
    assert response.json() == {
        "counts": [{"reaction": "🫡", "count": 1}],
        "yours": "🫡",
        "comment_count": 0,
    }
    # An original emoji is stored by its name.
    assert third_client.put(url, json={"reaction": "🔥"}).json()["yours"] == "fire"
    assert other_client.get("/api/sharing/feed").json()["items"][0]["reactions"] == {
        "counts": [{"reaction": "fire", "count": 1}, {"reaction": "🫡", "count": 1}],
        "yours": "🫡",
        "comment_count": 0,
    }
    people = {item["id"]: item["reaction"] for item in client.get(url + "s").json()["items"]}
    assert people == {other_client.user["id"]: "🫡", third_client.user["id"]: "fire"}
    notices = client.get("/api/sharing/notifications").json()["reactions"]
    assert {notice["reaction"] for notice in notices} == {"🫡", "fire"}
    assert other_client.put(url, json={"reaction": "😮‍💨"}).json()["yours"] == "😮‍💨"


@pytest.mark.parametrize("value", ["hello", "👍👍", "", "x" * 40, None, 5])
def test_text_is_refused_as_a_reaction(client, other_client, value):
    share(client, "public")
    share(other_client, "public")
    workout = log_workout(client, "Leg day", 0)
    url = f"/api/sharing/workouts/{workout['id']}/reaction"
    assert other_client.put(url, json={"reaction": value}).status_code == 422
    assert client.get(url + "s").json()["total"] == 0


def test_any_emoji_reacts_to_a_comment_and_attaches_to_one(client, other_client, discussion):
    comment = post(client, discussion, "Brutal set", reaction="😮‍💨")
    assert comment["reaction"] == "😮‍💨"
    url = f"/api/sharing/comments/{comment['id']}/reaction"
    response = other_client.put(url, json={"reaction": "🫠"})
    assert response.status_code == 200, response.text
    assert response.json()["reactions"] == {
        "counts": [{"reaction": "🫠", "count": 1}],
        "yours": "🫠",
        "comment_count": 0,
    }
    notices = client.get("/api/sharing/notifications").json()["comments"]
    assert any(n["kind"] == "comment_reaction" and n["reaction"] == "🫠" for n in notices)
    assert other_client.put(url, json={"reaction": "👍"}).json()["reactions"]["yours"] == "like"
    assert other_client.put(url, json={"reaction": "words"}).status_code == 422
    assert client.post(discussion, json={"body": "Hi", "reaction": "words"}).status_code == 422


def test_custom_reactions_migration_allows_emojis_and_downgrades(tmp_path):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import create_engine, text
    from sqlalchemy.exc import IntegrityError

    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(text("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE training_workouts (id VARCHAR(36) PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES ('a'), ('b')"))
        connection.execute(text("INSERT INTO training_workouts VALUES ('workout')"))
        operations = Operations(MigrationContext.configure(connection))
        load("0038_workout_reactions", operations).upgrade()
        load("0041_workout_comments", operations).upgrade()
        load("0049_run_reaction", operations).upgrade()
        connection.execute(
            text(
                "INSERT INTO workout_comments (id, workout_id, user_id, body) "
                "VALUES ('comment', 'workout', 'a', 'Great run!')"
            )
        )
        tables = (
            ("workout_reactions", "workout_id", "workout"),
            ("comment_reactions", "comment_id", "comment"),
        )
        insert = "INSERT INTO {} ({}, user_id, reaction) VALUES (:id, :user, :reaction)"
        for table, key, value in tables:
            connection.execute(
                text(insert.format(table, key)), {"id": value, "user": "a", "reaction": "fire"}
            )
        before = {
            table: connection.execute(text(f"SELECT * FROM {table}")).all()
            for table, _, _ in tables
        }

        migration = load("0067_custom_reactions", operations)
        migration.upgrade()
        for table, rows in before.items():
            assert connection.execute(text(f"SELECT * FROM {table}")).all() == rows
        for table, key, value in tables:
            connection.execute(
                text(insert.format(table, key)), {"id": value, "user": "b", "reaction": "🫡"}
            )
            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(
                    text(f"UPDATE {table} SET reaction = :long WHERE user_id = 'b'"),
                    {"long": "x" * 17},
                )
        connection.execute(text("UPDATE workout_comments SET reaction = '🫡'"))
        connection.execute(
            text(
                "INSERT INTO comment_notifications "
                "(id, comment_id, recipient_id, actor_id, kind, reaction) "
                "VALUES ('notice', 'comment', 'a', 'b', 'comment_reaction', '🫡')"
            )
        )

        migration.downgrade()
        for table, rows in before.items():
            assert connection.execute(text(f"SELECT * FROM {table}")).all() == rows
        for table in ("workout_comments", "comment_notifications"):
            assert connection.scalar(text(f"SELECT count(*) FROM {table}")) == 1
            assert connection.scalar(text(f"SELECT reaction FROM {table}")) is None
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(
                text(insert.format("comment_reactions", "comment_id")),
                {"id": "comment", "user": "b", "reaction": "🫡"},
            )
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    engine.dispose()
