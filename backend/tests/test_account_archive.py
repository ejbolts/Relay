from __future__ import annotations

import io
import json
import os
import sqlite3
import subprocess
import sys
import zipfile
from contextlib import closing
from pathlib import Path

import pytest
from test_auth import upload_photo
from test_sharing import befriend, share
from test_workout_reactions import log_workout

from app import account_archive
from app.account_archive import BUSY, DAMAGED, OTHER_ACCOUNT, OTHER_VERSION, one_at_a_time
from app.account_backups import BACKUP_DATABASE, MANIFEST, sha256_of
from app.config import get_settings
from app.database import SessionLocal
from app.models import AccountBackup

BACKEND = Path(__file__).parents[1]
ROOT = BACKEND.parent


def download(test_client) -> bytes:
    response = test_client.get("/api/account-archive")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    assert "attachment" in response.headers["content-disposition"]
    assert response.headers["cache-control"] == "no-store"
    return response.content


def send(test_client, archive: bytes, action: str = "restore"):
    return test_client.post(
        f"/api/account-archive/{action}",
        files={"file": ("relay-archive.zip", archive, "application/zip")},
    )


def error_message(response) -> str:
    return response.json()["error"]["message"]


def workout_names(test_client) -> list[str]:
    return sorted(item["name"] for item in test_client.get("/api/workouts").json())


def rebuild(archive: bytes, tmp_path: Path, change) -> bytes:
    """Unpack an archive, let ``change`` alter its folder, then repack with a valid manifest.

    This is what a crafted upload looks like: every file matches its manifest entry.
    """
    folder = tmp_path / "crafted"
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        bundle.extractall(folder)
    change(folder)
    manifest_path = folder / MANIFEST
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["files"] = [
        {
            "path": path.relative_to(folder).as_posix(),
            "size": path.stat().st_size,
            "sha256": sha256_of(path),
        }
        for path in sorted(item for item in folder.rglob("*") if item.is_file())
        if path != manifest_path
    ]
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    return repack(folder)


def repack(folder: Path, extra: dict[str, bytes] | None = None) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as bundle:
        for path in sorted(item for item in folder.rglob("*") if item.is_file()):
            bundle.write(path, path.relative_to(folder).as_posix())
        for name, data in (extra or {}).items():
            bundle.writestr(name, data)
    return buffer.getvalue()


def edit_database(sql: str, *parameters):
    def change(folder: Path) -> None:
        with closing(sqlite3.connect(folder / BACKUP_DATABASE)) as connection:
            connection.execute(sql, parameters)
            connection.commit()

    return change


def test_archive_holds_only_the_accounts_data_without_a_password(client, other_client):
    log_workout(client, "Owner push", 0)
    log_workout(other_client, "Other push", 0)
    archive = download(client)
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        names = set(bundle.namelist())
        assert {MANIFEST, BACKUP_DATABASE} <= names
        manifest = json.loads(bundle.read(MANIFEST))
        database = bundle.read(BACKUP_DATABASE)
    assert manifest["owner"]["username"] == client.user["username"]
    assert {item["path"] for item in manifest["files"]} == names - {MANIFEST}
    path = Path(get_settings().data_dir) / "archive-check.db"
    path.write_bytes(database)
    with closing(sqlite3.connect(path)) as connection:
        assert connection.execute("SELECT name FROM training_workouts").fetchall() == [
            ("Owner push",)
        ]
        assert connection.execute("SELECT password_hash FROM users").fetchall() == [("",)]
        assert connection.execute("SELECT COUNT(*) FROM user_sessions").fetchone() == (0,)
    path.unlink()
    # Nothing is left in the work area once the download has been sent.
    work = Path(get_settings().data_dir) / "archive-work"
    assert not any(work.iterdir())


def test_archive_needs_a_signed_in_account(anonymous_client):
    assert anonymous_client.get("/api/account-archive").status_code == 401
    assert send(anonymous_client, b"zip", "preview").status_code == 401


def test_preview_reports_both_sides_and_changes_nothing(client):
    log_workout(client, "First", 1)
    log_workout(client, "Second", 0)
    archive = download(client)
    first = next(item for item in client.get("/api/workouts").json() if item["name"] == "First")
    assert client.delete(f"/api/workouts/{first['id']}").status_code == 204

    response = send(client, archive, "preview")
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview["username"] == client.user["username"]
    assert preview["archive"]["workouts"] == 2
    assert preview["current"]["workouts"] == 1
    assert preview["photos_skipped"] == 0
    assert workout_names(client) == ["Second"]
    with SessionLocal() as db:
        assert db.query(AccountBackup).count() == 0


def test_restore_brings_back_the_archived_training_and_records(client):
    log_workout(client, "Kept", 1)
    archive = download(client)
    records_before = client.get("/api/personal-records").json()
    revision_before = client.get("/api/workouts/revision").json()
    kept = client.get("/api/workouts").json()[0]
    assert client.delete(f"/api/workouts/{kept['id']}").status_code == 204
    log_workout(client, "Added after the archive", 0)

    response = send(client, archive)
    assert response.status_code == 200, response.text
    assert response.json()["restored"]["workouts"] == 1
    assert workout_names(client) == ["Kept"]
    restored = client.get(f"/api/workouts/{kept['id']}").json()
    assert restored["movements"][0]["sets"][0]["weight_kg"] == 100
    assert {item["workout_id"] for item in client.get("/api/personal-records").json()} == {
        item["workout_id"] for item in records_before
    }
    # Other devices learn that the training data changed.
    assert client.get("/api/workouts/revision").json() != revision_before
    # The account as it was just before the restore is kept as a server-side snapshot.
    with SessionLocal() as db:
        snapshots = db.query(AccountBackup).all()
    assert [item.label.startswith("Before restore") for item in snapshots] == [True]


def test_restore_keeps_sign_in_and_only_the_two_newest_safety_snapshots(client):
    log_workout(client, "Workout", 0)
    archive = download(client)
    for _ in range(3):
        assert send(client, archive).status_code == 200
    assert client.get("/api/auth/me").status_code == 200
    with SessionLocal() as db:
        assert db.query(AccountBackup).count() == 2


def test_restore_keeps_friends_reactions_on_workouts_it_brings_back(client, other_client):
    share(client, "public")
    share(other_client, "public")
    befriend(client, other_client)
    kept = log_workout(client, "Kept", 1)
    archive = download(client)
    dropped = log_workout(client, "Not in the archive", 0)
    for workout in (kept, dropped):
        url = f"/api/sharing/workouts/{workout['id']}/reaction"
        assert other_client.put(url, json={"reaction": "fire"}).status_code == 200

    assert send(client, archive).status_code == 200
    kept_people = client.get(f"/api/sharing/workouts/{kept['id']}/reactions").json()
    assert [person["reaction"] for person in kept_people["items"]] == ["fire"]
    assert client.get(f"/api/sharing/workouts/{dropped['id']}/reactions").status_code == 404
    # The friendship itself is untouched.
    assert other_client.get(f"/api/sharing/profiles/{client.user['id']}").status_code == 200


def test_restore_re_encodes_photos_under_new_names_and_removes_replaced_files(client):
    exercise = client.get("/api/exercises").json()[0]
    assert upload_photo(client, exercise["id"], "Rack").status_code == 201
    photo = client.get(f"/api/exercises/{exercise['id']}/machine-photos").json()[0]
    archive = download(client)
    photos_dir = get_settings().machine_photos_dir
    old_files = {path.name for path in photos_dir.iterdir()}

    response = send(client, archive)
    assert response.status_code == 200, response.text
    assert response.json()["photos_skipped"] == 0
    restored = client.get(f"/api/exercises/{exercise['id']}/machine-photos").json()
    assert [item["id"] for item in restored] == [photo["id"]]
    assert [item["caption"] for item in restored] == ["Rack"]
    new_files = {path.name for path in photos_dir.iterdir()}
    assert len(new_files) == 2 and not new_files & old_files
    assert client.get(restored[0]["thumbnail_url"]).status_code == 200


def test_unreadable_photo_is_left_out_and_reported(client, tmp_path):
    exercise = client.get("/api/exercises").json()[0]
    assert upload_photo(client, exercise["id"]).status_code == 201

    def spoil_photos(folder: Path) -> None:
        for path in (folder / "machine-photos").iterdir():
            path.write_bytes(b"not an image")

    archive = rebuild(download(client), tmp_path, spoil_photos)
    assert send(client, archive, "preview").json()["photos_skipped"] == 0
    response = send(client, archive)
    assert response.status_code == 200, response.text
    assert response.json()["photos_skipped"] == 1
    assert client.get(f"/api/exercises/{exercise['id']}/machine-photos").json() == []


def test_another_accounts_archive_from_this_server_is_refused(client, other_client):
    log_workout(client, "Owner only", 0)
    log_workout(other_client, "Other only", 0)
    response = send(other_client, download(client))
    assert response.status_code == 422
    assert error_message(response) == OTHER_ACCOUNT
    assert workout_names(client) == ["Owner only"]
    assert workout_names(other_client) == ["Other only"]


@pytest.mark.parametrize(
    "damage",
    ["not a zip", "tampered database", "unlisted file", "path outside", "encrypted name"],
)
def test_damaged_or_unexpected_archives_are_refused(client, tmp_path, damage):
    log_workout(client, "Safe", 0)
    archive = download(client)
    if damage == "not a zip":
        archive = b"PK\x03\x04 truncated"
    elif damage == "tampered database":
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
            files = {name: bundle.read(name) for name in bundle.namelist()}
        files[BACKUP_DATABASE] = files[BACKUP_DATABASE][:-1] + b"x"
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as bundle:
            for name, data in files.items():
                bundle.writestr(name, data)
        archive = buffer.getvalue()
    else:
        folder = tmp_path / "unpacked"
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
            bundle.extractall(folder)
        name = {
            "unlisted file": "machine-photos/extra.webp",
            "path outside": "../outside.txt",
            "encrypted name": "machine-photos/.hidden",
        }[damage]
        archive = repack(folder, {name: b"data"})
    for action in ("preview", "restore"):
        response = send(client, archive, action)
        assert response.status_code == 422, response.text
        assert error_message(response) == DAMAGED
    assert workout_names(client) == ["Safe"]
    assert not (ROOT / "outside.txt").exists()


@pytest.mark.parametrize(
    "sql",
    [
        "CREATE TRIGGER sneaky AFTER INSERT ON workout_sets BEGIN SELECT 1; END",
        "CREATE VIEW extra AS SELECT 1",
        "CREATE TABLE unknown_table (id TEXT)",
    ],
)
def test_archives_with_unexpected_schema_objects_are_refused(client, tmp_path, sql):
    log_workout(client, "Safe", 0)
    archive = rebuild(download(client), tmp_path, edit_database(sql))
    response = send(client, archive)
    assert response.status_code == 422
    assert error_message(response) == DAMAGED
    assert workout_names(client) == ["Safe"]


def test_rows_pointing_at_another_accounts_data_are_refused(client, other_client, tmp_path):
    log_workout(client, "Owner push", 0)
    other_workout = log_workout(other_client, "Other push", 0)
    other_movement = other_workout["movements"][0]["id"]
    # A crafted set row hung off another account's exercise entry.
    archive = rebuild(
        download(client),
        tmp_path,
        edit_database(
            "UPDATE workout_sets SET movement_id = ?, order_index = 99 "
            "WHERE rowid = (SELECT MIN(rowid) FROM workout_sets)",
            other_movement,
        ),
    )
    other_sets = other_client.get(f"/api/workouts/{other_workout['id']}").json()
    response = send(client, archive)
    assert response.status_code == 422
    assert error_message(response) == DAMAGED
    assert workout_names(client) == ["Owner push"]
    assert other_client.get(f"/api/workouts/{other_workout['id']}").json() == other_sets


def test_rows_naming_another_accounts_exercise_are_refused(client, other_client, tmp_path):
    log_workout(client, "Owner push", 0)
    other_exercise = other_client.get("/api/exercises").json()[0]["id"]
    archive = rebuild(
        download(client),
        tmp_path,
        edit_database("UPDATE workout_movements SET exercise_id = ?", other_exercise),
    )
    response = send(client, archive)
    assert response.status_code == 422
    assert error_message(response) == DAMAGED
    assert workout_names(client) == ["Owner push"]


def test_archived_account_ids_are_restored_into_the_signed_in_account(client, tmp_path):
    log_workout(client, "Mine", 0)
    archive = rebuild(
        download(client),
        tmp_path,
        edit_database("UPDATE training_workouts SET user_id = 'someone-else'"),
    )
    assert send(client, archive).status_code == 200
    assert workout_names(client) == ["Mine"]


def test_archive_beyond_the_account_limits_is_refused(client, other_client):
    log_workout(other_client, "One", 1)
    log_workout(other_client, "Two", 0)
    archive = download(other_client)
    limits = client.get("/api/admin/limits").json()["values"]
    assert (
        client.put("/api/admin/limits", json={**limits, "workouts_per_account": 1}).status_code
        == 200
    )
    response = send(other_client, archive)
    assert response.status_code == 422
    assert "more than this account can keep" in error_message(response)
    assert workout_names(other_client) == ["One", "Two"]


def test_an_archive_from_a_newer_release_is_refused(client, monkeypatch):
    log_workout(client, "Safe", 0)
    archive = download(client)
    monkeypatch.setattr(
        account_archive,
        "schema_revision",
        lambda path: "0001_current" if path == get_settings().database_path else None,
    )
    response = send(client, archive)
    assert response.status_code == 422
    assert error_message(response) == OTHER_VERSION
    assert workout_names(client) == ["Safe"]


def test_known_revisions_are_this_servers_migrations():
    assert account_archive.known_revision("0054_set_machine")
    assert not account_archive.known_revision("9999_from_the_future")


def test_one_archive_operation_at_a_time_per_account(client):
    with one_at_a_time(client.user["id"]):
        response = client.get("/api/account-archive")
    assert response.status_code == 429
    assert error_message(response) == BUSY
    assert client.get("/api/account-archive").status_code == 200


def alembic(database: Path, data: Path, *arguments: str) -> None:
    environment = {**os.environ, "GYM_DATABASE_PATH": str(database), "GYM_DATA_DIR": str(data)}
    subprocess.run(
        [sys.executable, "-m", "alembic", "-c", str(ROOT / "alembic.ini"), *arguments],
        cwd=ROOT,
        env=environment,
        check=True,
        capture_output=True,
        timeout=300,
    )


def make_previous_release_database(database: Path, data: Path) -> None:
    """A database as release 0053 left it: workout sets had no machine column yet."""
    alembic(database, data, "upgrade", "head")
    with closing(sqlite3.connect(database, isolation_level=None)) as connection:
        connection.execute("PRAGMA foreign_keys = OFF")
        sql = connection.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'workout_sets'"
        ).fetchone()[0]
        body = [line.strip() for line in sql.splitlines()[1:-1] if "machine_photo_id" not in line]
        columns = ", ".join(line.rstrip(",").rstrip() for line in body)
        connection.execute("DROP INDEX ix_workout_sets_machine_photo_id")
        connection.execute("DROP TABLE workout_sets")
        connection.execute(f"CREATE TABLE workout_sets ({columns})")
        connection.execute("UPDATE alembic_version SET version_num = '0053_maintenance_ranges'")


def test_an_older_archive_database_is_brought_up_to_date(tmp_path):
    database = tmp_path / "archive.db"
    data = tmp_path / "data"
    make_previous_release_database(database, data)
    with closing(sqlite3.connect(database)) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(workout_sets)")}
    assert "machine_photo_id" not in columns
    account_archive.migrate_database(database, tmp_path)
    with closing(sqlite3.connect(database)) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(workout_sets)")}
        revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    assert "machine_photo_id" in columns
    assert revision == "0054_set_machine"
