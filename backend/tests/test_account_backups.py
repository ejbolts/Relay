from __future__ import annotations

import importlib.util
import json
import sqlite3
from contextlib import closing
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from conftest import TEST_PASSWORD
from sqlalchemy import create_engine, inspect, select, text
from test_sharing import befriend, share
from test_tracker import workout_payload

from app import manage
from app.account_backups import (
    ACCOUNT_ROWS,
    BACKUP_DATABASE,
    MANIFEST,
    BackupError,
    backup_folder,
    create_account_snapshot,
    import_legacy_backup,
)
from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.models import AccountBackup, Exercise, MachinePhoto, User

BACKEND = Path(__file__).parents[1]


def add_workout(test_client) -> str:
    exercise = test_client.get("/api/exercises").json()[0]
    response = test_client.post("/api/workouts", json=workout_payload(exercise["id"]))
    assert response.status_code == 201, response.text
    return response.json()["id"]


def add_photo(user_id: str, name: str) -> None:
    with SessionLocal() as db:
        exercise_id = db.scalar(select(Exercise.id).where(Exercise.user_id == user_id).limit(1))
        db.add(
            MachinePhoto(
                user_id=user_id,
                exercise_id=exercise_id,
                caption="Seat on 4",
                original_filename=f"{name}.jpg",
                full_filename=f"{name}-full.webp",
                thumbnail_filename=f"{name}-thumbnail.webp",
                file_size=1,
                width=10,
                height=10,
            )
        )
        db.commit()
    photos = get_settings().machine_photos_dir
    (photos / f"{name}-full.webp").write_bytes(b"full")
    (photos / f"{name}-thumbnail.webp").write_bytes(b"thumb")


def snapshot(username: str) -> AccountBackup:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == username))
        return create_account_snapshot(db, get_settings(), user)


def rows(database: Path, query: str) -> list[tuple]:
    with closing(sqlite3.connect(database)) as connection:
        return connection.execute(query).fetchall()


def test_every_table_is_either_backed_up_or_deliberately_left_out():
    assert set(ACCOUNT_ROWS) == {*Base.metadata.tables, "alembic_version"}


def test_snapshot_holds_only_its_owners_data(client, other_client):
    owner_id, other_id = client.user["id"], other_client.user["id"]
    owner_workout = add_workout(client)
    other_workout = add_workout(other_client)
    owner_type = client.post("/api/workout-types", json={"name": "Arms", "color": "#a855f7"}).json()
    other_type = other_client.post(
        "/api/workout-types", json={"name": "Legs", "color": "#a855f7"}
    ).json()
    add_photo(owner_id, "owner-photo")
    add_photo(other_id, "other-photo")
    owner_exercise = client.get("/api/exercises").json()[0]["id"]
    other_exercise = other_client.get("/api/exercises").json()[0]["id"]
    for browser, exercise_id in [(client, owner_exercise), (other_client, other_exercise)]:
        assert (
            browser.patch(
                f"/api/exercises/{exercise_id}/partial-sets", json={"partial_sets_enabled": False}
            ).status_code
            == 200
        )

    backup = snapshot("owner")

    folder = backup_folder(get_settings(), owner_id, backup.id)
    database = folder / BACKUP_DATABASE
    assert backup.user_id == owner_id
    assert rows(database, "SELECT id, password_hash FROM users") == [(owner_id, "")]
    assert rows(database, "SELECT id FROM training_workouts") == [(owner_workout,)]
    assert rows(database, "SELECT id, name FROM workout_types") == [(owner_type["id"], "Arms")]
    assert rows(database, "SELECT COUNT(*) FROM workout_sets") == [(2,)]
    assert {owner for (owner,) in rows(database, "SELECT user_id FROM exercises")} == {owner_id}
    assert rows(database, "SELECT exercise_id, enabled FROM exercise_partial_set_weeks") == [
        (owner_exercise, 0)
    ]
    for table in ("user_sessions", "push_subscriptions", "account_backups"):
        assert rows(database, f"SELECT COUNT(*) FROM {table}") == [(0,)]
    photos = sorted(path.name for path in (folder / "machine-photos").iterdir())
    assert photos == ["owner-photo-full.webp", "owner-photo-thumbnail.webp"]

    manifest = json.loads((folder / MANIFEST).read_text(encoding="utf-8"))
    assert manifest["owner"] == {"id": owner_id, "username": "owner"}
    assert manifest["format"] == 2
    assert "email" not in {column[1] for column in rows(database, "PRAGMA table_info(users)")}
    assert manifest["tables"]["training_workouts"] == 1
    assert manifest["missing_files"] == []
    assert {item["path"] for item in manifest["files"]} == {
        BACKUP_DATABASE,
        "machine-photos/owner-photo-full.webp",
        "machine-photos/owner-photo-thumbnail.webp",
    }
    assert backup.file_count == 3

    other_backup = snapshot("other")
    other_database = backup_folder(get_settings(), other_id, other_backup.id) / BACKUP_DATABASE
    assert rows(other_database, "SELECT id FROM training_workouts") == [(other_workout,)]
    assert rows(other_database, "SELECT exercise_id, enabled FROM exercise_partial_set_weeks") == [
        (other_exercise, 0)
    ]
    assert rows(other_database, "SELECT id, name FROM workout_types") == [
        (other_type["id"], "Legs")
    ]


def test_snapshot_refuses_a_table_it_does_not_know_and_leaves_nothing_behind(client):
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE mystery (id INTEGER PRIMARY KEY)"))

    with pytest.raises(BackupError, match="mystery"):
        snapshot("owner")

    with SessionLocal() as db:
        assert db.scalar(select(AccountBackup.id)) is None
    owner_folder = get_settings().account_backups_dir / client.user["id"]
    assert not any(owner_folder.iterdir())
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE mystery"))


def make_legacy_database(path: Path, *, with_accounts: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as connection:
        connection.execute("CREATE TABLE alembic_version (version_num VARCHAR(32))")
        connection.execute("INSERT INTO alembic_version VALUES ('0026_remove_training_modes')")
        connection.execute("CREATE TABLE training_workouts (id VARCHAR(36) PRIMARY KEY)")
        connection.execute("INSERT INTO training_workouts VALUES ('w-1'), ('w-2')")
        if with_accounts:
            connection.execute("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY)")
            connection.execute("INSERT INTO users VALUES ('someone')")
        connection.commit()


@pytest.fixture
def legacy_backup(tmp_path) -> Path:
    """A backup folder as taken before accounts: data plus server secrets that must stay out."""
    source = tmp_path / "stable-20261011"
    data = source / "data"
    make_legacy_database(data / "gym-video-logger.db")
    make_legacy_database(data / "backups" / "before-0008.db")
    (data / "machine-photos").mkdir()
    (data / "machine-photos" / "rack.webp").write_bytes(b"photo")
    (data / "uploads").mkdir()
    (data / "uploads" / "clip.mp4").write_bytes(b"video")
    (data / "web-push-vapid-private.pem").write_text("private key")
    (data / "uvicorn.log").write_text("log")
    (source / "secrets").mkdir()
    (source / "secrets" / "youtube-token.json").write_text("{}")
    (source / ".env").write_text("GYM_SECRET=1")
    return source


def test_legacy_backup_is_filed_under_the_first_account_without_server_secrets(
    client, legacy_backup
):
    with SessionLocal() as db:
        owner = db.get(User, client.user["id"])
        backup = import_legacy_backup(db, get_settings(), owner, legacy_backup)

    folder = backup_folder(get_settings(), client.user["id"], backup.id)
    copied = sorted(
        path.relative_to(folder).as_posix() for path in folder.rglob("*") if path.is_file()
    )
    assert copied == [
        "backups/before-0008.db",
        "gym-video-logger.db",
        "machine-photos/rack.webp",
        MANIFEST,
        "uploads/clip.mp4",
    ]
    manifest = json.loads((folder / MANIFEST).read_text(encoding="utf-8"))
    assert manifest["kind"] == "legacy_import"
    assert manifest["owner"]["username"] == "owner"
    assert manifest["tables"]["training_workouts"] == 2
    assert manifest["skipped"] == [".env", "secrets", "uvicorn.log", "web-push-vapid-private.pem"]
    assert backup.user_id == client.user["id"]
    assert backup.schema_revision == "0026_remove_training_modes"
    assert backup.label == "Before accounts: stable-20261011"


def test_legacy_backup_cannot_be_filed_twice_or_under_another_account(
    client, other_client, legacy_backup
):
    with SessionLocal() as db:
        owner = db.get(User, client.user["id"])
        other = db.get(User, other_client.user["id"])
        import_legacy_backup(db, get_settings(), owner, legacy_backup)

        with pytest.raises(BackupError, match="already filed"):
            import_legacy_backup(db, get_settings(), owner, legacy_backup)
        with pytest.raises(BackupError, match="first account claimed.*owner"):
            import_legacy_backup(db, get_settings(), other, legacy_backup)
        assert db.scalar(select(AccountBackup.user_id).distinct()) == owner.id


def test_a_backup_that_already_has_accounts_is_not_a_legacy_backup(client, legacy_backup):
    make_legacy_database(legacy_backup / "data" / "after-accounts.db", with_accounts=True)

    with SessionLocal() as db, pytest.raises(BackupError, match="already has accounts"):
        import_legacy_backup(db, get_settings(), db.get(User, client.user["id"]), legacy_backup)


def test_backup_commands(client, other_client, legacy_backup, capsys):
    add_workout(client)

    manage.main(["backup-account", "--username", "Owner", "--label", "Before trip"])
    manage.main(["import-legacy-backup", "--username", "owner", "--source", str(legacy_backup)])
    output = capsys.readouterr().out
    assert "Backed up owner: Before trip" in output
    assert "Filed under owner: Before accounts: stable-20261011" in output

    manage.main(["list-backups"])
    listing = capsys.readouterr().out.splitlines()
    assert len(listing) == 2
    assert all(line.startswith("owner\t") for line in listing)
    manage.main(["list-backups", "--username", "other"])
    assert capsys.readouterr().out.strip() == "No backups yet."

    with pytest.raises(SystemExit, match="first account"):
        manage.main(["import-legacy-backup", "--username", "other", "--source", str(legacy_backup)])
    with pytest.raises(SystemExit, match="No account for"):
        manage.main(["backup-account", "--username", "nobody"])


def load_migration():
    path = BACKEND / "migrations/versions/0029_account_backups.py"
    spec = importlib.util.spec_from_file_location("account_backups_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def test_migration_adds_an_owner_for_every_backup_and_downgrades():
    migration = load_migration()
    database = create_engine("sqlite://")
    with database.begin() as connection:
        connection.execute(text("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY)"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()

        inspector = inspect(connection)
        columns = {column["name"]: column for column in inspector.get_columns("account_backups")}
        assert columns["user_id"]["nullable"] is False
        assert [key["referred_table"] for key in inspector.get_foreign_keys("account_backups")] == [
            "users"
        ]

        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert "account_backups" not in inspect(connection).get_table_names()


def test_deleting_an_account_deletes_its_backups_and_nobody_elses(client, other_client):
    owner_backup = snapshot("owner")
    other_backup = snapshot("other")
    settings = get_settings()
    other_id = other_client.user["id"]

    response = other_client.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD})

    assert response.status_code == 204, response.text
    assert not (settings.account_backups_dir / other_id).exists()
    assert backup_folder(settings, client.user["id"], owner_backup.id).is_dir()
    with SessionLocal() as db:
        assert db.get(AccountBackup, other_backup.id) is None
        assert db.get(AccountBackup, owner_backup.id) is not None


def test_snapshots_deliberately_exclude_cross_account_discussions(client, other_client):
    share(client)
    share(other_client)
    befriend(client, other_client)
    workout_id = add_workout(client)
    url = f"/api/sharing/workouts/{workout_id}/comments"
    comment = other_client.post(url, json={"body": "Great session"})
    assert comment.status_code == 201, comment.text
    reply = client.post(url, json={"body": "Thanks!", "reply_to_id": comment.json()["id"]})
    assert reply.status_code == 201, reply.text
    reacted = other_client.put(
        f"/api/sharing/comments/{reply.json()['id']}/reaction", json={"reaction": "love"}
    )
    assert reacted.status_code == 200, reacted.text
    tables = ("workout_comments", "comment_reactions", "comment_notifications")
    for table in tables:
        assert rows(get_settings().database_path, f"SELECT COUNT(*) FROM {table}")[0][0] > 0
    for account in (client, other_client):
        backup = snapshot(account.user["username"])
        database = backup_folder(get_settings(), account.user["id"], backup.id) / BACKUP_DATABASE
        for table in tables:
            assert rows(database, f"SELECT COUNT(*) FROM {table}") == [(0,)]
        assert rows(database, "SELECT id FROM users") == [(account.user["id"],)]
