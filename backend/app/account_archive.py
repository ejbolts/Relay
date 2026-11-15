"""Self-service account archives: download everything an account holds, and restore it later.

An archive is a zip of one account snapshot (see ``account_backups``): a standalone SQLite database
with only that account's rows, its machine photos and profile photo, and a manifest listing every
file with its size and SHA-256.

Restoring replaces the signed-in account's training data with an archive's. The uploaded file is
untrusted, so a restore:

- unpacks only the expected file names, within size and count limits, and checks every file
  against the manifest;
- opens the database read-only with SQLite's defensive settings, and accepts only plain tables
  and indexes with the names this app knows;
- brings an archive from an older release up to the current schema in a separate process, on a
  private copy;
- copies rows across as values, always under the signed-in account, never the account, sign-in
  or server tables, and then proves that every reference points at that account's own rows;
- re-encodes every photo instead of trusting the stored file;
- runs in one transaction, after taking a server-side snapshot of the account as it was.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
import zipfile
from contextlib import closing, contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from .account_backups import (
    ACCOUNT_ROWS,
    BACKUP_DATABASE,
    MANIFEST,
    PHOTOS,
    PROFILE_PHOTOS,
    BackupError,
    backup_folder,
    copy_account_rows,
    copy_photos,
    copy_profile_photo,
    create_account_snapshot,
    read_only_uri,
    schema_revision,
    sha256_of,
    write_manifest,
)
from .account_limits import limit_save_rate, load_account_limits
from .auth import CurrentUser
from .config import Settings, get_settings
from .database import get_db
from .errors import api_error
from .models import AccountBackup, AccountBackupKind, User, new_uuid, utc_now
from .photo_storage import PhotoValidationError, _write_machine_variants
from .training_metrics import rebuild_personal_records, set_setting

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 512 * 1024 * 1024
MAX_UNPACKED_BYTES = 1024 * 1024 * 1024
MAX_FILES = 20_000
MAX_MANIFEST_BYTES = 5 * 1024 * 1024
CHUNK = 1024 * 1024
MIGRATION_TIMEOUT_SECONDS = 300
STALE_WORK_SECONDS = 60 * 60
SAFE_FILE_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,199}")

# Account rows a restore leaves exactly as they are. The account itself keeps its username,
# password and role; video rows describe files an archive does not hold; records are rebuilt.
NOT_RESTORED = frozenset(
    {"alembic_version", "users", "sessions", "clips", "timestamps", "personal_records"}
)
# Settings this server manages for the account. Mirrors tracker.WORKOUT_CACHE_REVISION_KEY.
CACHE_REVISION_KEY = "workout_cache_revision"
SERVER_MANAGED_SETTINGS = frozenset({CACHE_REVISION_KEY})
SAFETY_LABEL = "Before restore"
KEPT_SAFETY_SNAPSHOTS = 2

DAMAGED = "This file is not a Relay archive, or it is damaged."
OTHER_VERSION = (
    "This archive was made by a newer version of Relay than this server runs, so it cannot be "
    "restored here yet."
)
NOT_UPDATABLE = "This archive could not be updated to the current version of Relay."
OTHER_ACCOUNT = (
    "This archive holds another account's data from this server, so it cannot be restored here."
)
BUSY = "An archive is already being prepared or restored for this account. Try again shortly."


class ArchiveError(Exception):
    """An archive could not be made or restored; the message is shown to the person."""

    def __init__(self, message: str, status_code: int = 422, code: str = "archive_refused"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


class ArchiveCounts(BaseModel):
    workouts: int = 0
    cardio_sessions: int = 0
    body_check_ins: int = 0
    custom_exercises: int = 0
    photos: int = 0


class ArchivePreview(BaseModel):
    created_at: str | None
    username: str | None
    archive: ArchiveCounts
    current: ArchiveCounts
    # Photos in the archive whose files are missing or unreadable; they are left out.
    photos_skipped: int = 0


class ArchiveRestored(BaseModel):
    restored: ArchiveCounts
    photos_skipped: int = 0


@dataclass
class StagedArchive:
    """An uploaded archive that passed every check, unpacked in its own work folder."""

    work: Path
    folder: Path
    database: Path
    manifest: dict
    counts: ArchiveCounts = field(default_factory=ArchiveCounts)


_busy_accounts: set[str] = set()
_busy_lock = threading.Lock()


@contextmanager
def one_at_a_time(user_id: str):
    """Archives copy a whole account, so each account runs one archive operation at a time."""
    with _busy_lock:
        if user_id in _busy_accounts:
            raise ArchiveError(BUSY, status_code=429, code="archive_busy")
        _busy_accounts.add(user_id)
    try:
        yield
    finally:
        with _busy_lock:
            _busy_accounts.discard(user_id)


def new_work_folder(settings: Settings) -> Path:
    """A private folder for one archive operation. Folders abandoned by a crash are cleared."""
    root = settings.data_dir / "archive-work"
    root.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - STALE_WORK_SECONDS
    for entry in root.iterdir():
        try:
            if entry.stat().st_mtime < cutoff:
                shutil.rmtree(entry, ignore_errors=True)
        except OSError:
            continue
    work = root / uuid.uuid4().hex
    work.mkdir()
    return work


def build_archive(settings: Settings, user: User) -> tuple[Path, Path]:
    """Write ``user``'s archive zip; return it with the work folder to delete once it is sent."""
    work = new_work_folder(settings)
    try:
        staging = work / "archive"
        staging.mkdir()
        database = staging / BACKUP_DATABASE
        created_at = utc_now()
        tables = copy_account_rows(settings.database_path, database, user.id)
        missing = copy_photos(database, settings.machine_photos_dir, staging / PHOTOS)
        missing += copy_profile_photo(user, settings.profile_photos_dir, staging / PROFILE_PHOTOS)
        write_manifest(
            staging,
            backup_id=new_uuid(),
            kind=AccountBackupKind.SNAPSHOT,
            label=f"Archive {created_at:%Y-%m-%d %H:%M} UTC",
            user=user,
            created_at=created_at,
            schema_revision=schema_revision(database),
            details={
                "tables": tables,
                "missing_files": missing,
                "not_included": ["video uploads and processed videos"],
            },
        )
        archive = work / "archive.zip"
        with zipfile.ZipFile(archive, "w") as bundle:
            for path in sorted(item for item in staging.rglob("*") if item.is_file()):
                name = path.relative_to(staging).as_posix()
                # Photos are already compressed; the database and manifest shrink well.
                compression = zipfile.ZIP_DEFLATED if "/" not in name else zipfile.ZIP_STORED
                bundle.write(path, name, compress_type=compression)
        shutil.rmtree(staging, ignore_errors=True)
        return archive, work
    except BaseException:
        shutil.rmtree(work, ignore_errors=True)
        raise


def receive_upload(upload: UploadFile, target: Path) -> None:
    total = 0
    with target.open("wb") as handle:
        while chunk := upload.file.read(CHUNK):
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                raise ArchiveError("This archive is too large to restore.", status_code=413)
            handle.write(chunk)


def allowed_member(name: str) -> bool:
    if name in (MANIFEST, BACKUP_DATABASE):
        return True
    folder, _, file_name = name.partition("/")
    return folder in (PHOTOS, PROFILE_PHOTOS) and bool(SAFE_FILE_NAME.fullmatch(file_name))


def unpack(archive: Path, folder: Path) -> None:
    """Extract an uploaded zip, accepting only the files an archive is made of."""
    try:
        with zipfile.ZipFile(archive) as bundle:
            members = bundle.infolist()
            names = [member.filename for member in members]
            if (
                len(members) > MAX_FILES
                or len(set(names)) != len(names)
                or not all(allowed_member(name) for name in names)
                or any(member.flag_bits & 0x1 for member in members)
                or MANIFEST not in names
                or BACKUP_DATABASE not in names
            ):
                raise ArchiveError(DAMAGED)
            if sum(member.file_size for member in members) > MAX_UNPACKED_BYTES:
                raise ArchiveError("This archive is too large to restore.", status_code=413)
            unpacked = 0
            for member in members:
                target = folder / member.filename
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.open(member) as source, target.open("wb") as handle:
                    while chunk := source.read(CHUNK):
                        unpacked += len(chunk)
                        # Declared sizes can lie; count what actually comes out.
                        if unpacked > MAX_UNPACKED_BYTES:
                            raise ArchiveError(
                                "This archive is too large to restore.", status_code=413
                            )
                        handle.write(chunk)
    except (zipfile.BadZipFile, OSError, RuntimeError, NotImplementedError) as error:
        raise ArchiveError(DAMAGED) from error


def read_manifest(folder: Path) -> dict:
    """Load the manifest and check that the unpacked files are exactly the ones it lists."""
    path = folder / MANIFEST
    try:
        if path.stat().st_size > MAX_MANIFEST_BYTES:
            raise ArchiveError(DAMAGED)
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ArchiveError(DAMAGED) from error
    files = manifest.get("files") if isinstance(manifest, dict) else None
    if (
        not isinstance(files, list)
        or manifest.get("format") != 2
        or manifest.get("kind") != AccountBackupKind.SNAPSHOT.value
    ):
        raise ArchiveError(DAMAGED)
    listed: dict[str, dict] = {}
    for item in files:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str):
            raise ArchiveError(DAMAGED)
        listed[item["path"]] = item
    unpacked = {
        item.relative_to(folder).as_posix()
        for item in folder.rglob("*")
        if item.is_file() and item != path
    }
    if unpacked != set(listed):
        raise ArchiveError(DAMAGED)
    for name, item in listed.items():
        file = folder / name
        if file.stat().st_size != item.get("size") or sha256_of(file) != item.get("sha256"):
            raise ArchiveError(DAMAGED)
    return manifest


def open_untrusted(database: Path) -> sqlite3.Connection:
    """Open an uploaded database read-only, with SQLite's defences against crafted files."""
    connection = None
    try:
        connection = sqlite3.connect(read_only_uri(database), uri=True)
        connection.setconfig(sqlite3.SQLITE_DBCONFIG_DEFENSIVE, True)
        connection.setconfig(sqlite3.SQLITE_DBCONFIG_TRUSTED_SCHEMA, False)
        connection.execute("PRAGMA cell_size_check = ON")
        if connection.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
            raise ArchiveError(DAMAGED)
        return connection
    except sqlite3.Error as error:
        if connection is not None:
            connection.close()
        raise ArchiveError(DAMAGED) from error
    except ArchiveError:
        if connection is not None:
            connection.close()
        raise


def restored_tables() -> list[str]:
    """The tables a restore replaces, parents before the tables that refer to them."""
    return [
        table
        for table, rows in ACCOUNT_ROWS.items()
        if rows is not None and table not in NOT_RESTORED
    ]


def columns_of(connection: sqlite3.Connection, table: str, schema: str = "main") -> list[str]:
    return [row[1] for row in connection.execute(f'PRAGMA {schema}.table_info("{table}")')]


def check_schema(connection: sqlite3.Connection) -> None:
    """Accept only plain tables and indexes, with the table names this app has."""
    try:
        objects = connection.execute(
            "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"
        ).fetchall()
        tables = {name for kind, name in objects if kind == "table"}
        if (
            any(kind not in ("table", "index") for kind, _name in objects)
            or not tables <= ACCOUNT_ROWS.keys()
            or not {"users", *restored_tables()} <= tables
            or connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] != 1
        ):
            raise ArchiveError(DAMAGED)
    except sqlite3.Error as error:
        raise ArchiveError(DAMAGED) from error


def migrations_root() -> Path:
    return Path(__file__).resolve().parents[2]


def known_revision(revision: str) -> bool:
    """Whether this server's migrations include ``revision``; a newer release's are unknown."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from alembic.util import CommandError

    root = migrations_root()
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "backend" / "migrations"))
    try:
        return ScriptDirectory.from_config(config).get_revision(revision) is not None
    except CommandError:
        return False


def migrate_database(database: Path, work: Path) -> None:
    """Bring a private copy of an archive's database up to this server's schema.

    Runs the ordinary migrations in a separate process pointed at the copy, so the live database
    and this process's settings are never involved.
    """
    root = migrations_root()
    if not (root / "alembic.ini").is_file():
        raise ArchiveError(NOT_UPDATABLE)
    environment = {
        **os.environ,
        "GYM_DATABASE_PATH": str(database),
        "GYM_DATA_DIR": str(work / "migration-data"),
    }
    try:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "-c", str(root / "alembic.ini"), "upgrade", "head"],
            cwd=root,
            env=environment,
            capture_output=True,
            timeout=MIGRATION_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ArchiveError(NOT_UPDATABLE) from error
    if result.returncode != 0:
        logger.warning(
            "An uploaded archive could not be migrated: %s",
            result.stderr.decode("utf-8", "replace")[-2000:],
        )
        raise ArchiveError(NOT_UPDATABLE)


def count_rows(connection: sqlite3.Connection, user_id: str | None = None) -> ArchiveCounts:
    """Headline totals. With ``user_id`` they are that account's rows in the live database."""

    def count(table: str, extra: str = "") -> int:
        where = [extra] if extra else []
        parameters: tuple = ()
        if user_id is not None:
            where.append("user_id = ?")
            parameters = (user_id,)
        clause = f" WHERE {' AND '.join(where)}" if where else ""
        return connection.execute(f'SELECT COUNT(*) FROM "{table}"{clause}', parameters).fetchone()[
            0
        ]

    return ArchiveCounts(
        workouts=count("training_workouts"),
        cardio_sessions=count("cardio_sessions"),
        body_check_ins=count("body_measurements"),
        custom_exercises=count("exercises", "is_custom = 1"),
        photos=count("machine_photos"),
    )


def stage_archive(settings: Settings, upload: UploadFile) -> StagedArchive:
    """Receive, unpack and fully check an uploaded archive. Nothing in the account changes."""
    work = new_work_folder(settings)
    try:
        received = work / "upload.zip"
        receive_upload(upload, received)
        folder = work / "archive"
        folder.mkdir()
        unpack(received, folder)
        received.unlink(missing_ok=True)
        manifest = read_manifest(folder)
        database = folder / BACKUP_DATABASE

        with closing(open_untrusted(database)) as connection:
            check_schema(connection)
            try:
                has_version = (
                    connection.execute(
                        "SELECT COUNT(*) FROM sqlite_master WHERE name = 'alembic_version'"
                    ).fetchone()[0]
                    == 1
                )
                row = (
                    connection.execute("SELECT version_num FROM alembic_version").fetchone()
                    if has_version
                    else None
                )
            except sqlite3.Error as error:
                raise ArchiveError(DAMAGED) from error
        revision = row[0] if row else None
        live_revision = schema_revision(settings.database_path)
        if live_revision is not None and revision != live_revision:
            if not isinstance(revision, str) or not known_revision(revision):
                raise ArchiveError(OTHER_VERSION)
            migrate_database(database, work)

        with (
            closing(open_untrusted(database)) as connection,
            closing(sqlite3.connect(read_only_uri(settings.database_path), uri=True)) as live,
        ):
            check_schema(connection)
            for table in restored_tables():
                if set(columns_of(connection, table)) != set(columns_of(live, table)):
                    raise ArchiveError(OTHER_VERSION)
            try:
                counts = count_rows(connection)
            except sqlite3.Error as error:
                raise ArchiveError(DAMAGED) from error
        return StagedArchive(
            work=work, folder=folder, database=database, manifest=manifest, counts=counts
        )
    except BaseException:
        shutil.rmtree(work, ignore_errors=True)
        raise


@dataclass(frozen=True)
class RestoredPhoto:
    full_filename: str
    thumbnail_filename: str
    file_size: int
    width: int
    height: int


def prepare_photos(
    settings: Settings, staged: StagedArchive, connection: sqlite3.Connection
) -> tuple[dict[str, RestoredPhoto], set[str]]:
    """Re-encode each archived photo under a new name. Returns the kept and the skipped ids."""
    kept: dict[str, RestoredPhoto] = {}
    skipped: set[str] = set()
    try:
        rows = connection.execute("SELECT id, full_filename FROM machine_photos").fetchall()
    except sqlite3.Error as error:
        raise ArchiveError(DAMAGED) from error
    for photo_id, full_name in rows:
        source = staged.folder / PHOTOS / str(full_name)
        if (
            not isinstance(photo_id, str)
            or not isinstance(full_name, str)
            or not SAFE_FILE_NAME.fullmatch(full_name)
            or not source.is_file()
        ):
            skipped.add(str(photo_id))
            continue
        token = uuid.uuid4().hex
        full = settings.machine_photos_dir / f"{token}-full.webp"
        thumbnail = settings.machine_photos_dir / f"{token}-thumbnail.webp"
        try:
            width, height = _write_machine_variants(source, full, thumbnail)
        except (PhotoValidationError, OSError, ValueError):
            full.unlink(missing_ok=True)
            thumbnail.unlink(missing_ok=True)
            skipped.add(photo_id)
            continue
        kept[photo_id] = RestoredPhoto(
            full.name, thumbnail.name, full.stat().st_size, width, height
        )
    return kept, skipped


def remove_photo_files(settings: Settings, names) -> None:
    for name in names:
        if isinstance(name, str) and SAFE_FILE_NAME.fullmatch(name):
            (settings.machine_photos_dir / name).unlink(missing_ok=True)


def live_rows(table: str) -> str:
    """``table``'s ownership rule from ``ACCOUNT_ROWS``, read against the live database."""
    rows = ACCOUNT_ROWS[table]
    assert rows is not None
    return rows.replace("src.", "main.")


def insert_rows(
    live: sqlite3.Connection,
    archive: sqlite3.Connection,
    table: str,
    user_id: str,
    photos: dict[str, RestoredPhoto],
    skipped_photos: set[str],
) -> int:
    """Copy ``table``'s archived rows into the live database; return how many were inserted."""
    columns = columns_of(live, table)
    select_columns = ", ".join(f'"{column}"' for column in columns)
    statement = (
        f'INSERT INTO "{table}" ({select_columns}) VALUES ({", ".join("?" for _ in columns)})'
    )
    index = {column: position for position, column in enumerate(columns)}
    batch: list[list] = []
    inserted = 0
    for row in archive.execute(f'SELECT {select_columns} FROM "{table}"'):
        values = list(row)
        # Whatever account the archive names, its rows are restored into this one.
        if "user_id" in index:
            values[index["user_id"]] = user_id
        if table == "user_settings" and values[index["key"]] in SERVER_MANAGED_SETTINGS:
            continue
        if table == "machine_photos":
            photo = photos.get(values[index["id"]])
            if photo is None:
                continue
            values[index["full_filename"]] = photo.full_filename
            values[index["thumbnail_filename"]] = photo.thumbnail_filename
            values[index["media_type"]] = "image/webp"
            values[index["file_size"]] = photo.file_size
            values[index["width"]] = photo.width
            values[index["height"]] = photo.height
            if values[index["merged_into_id"]] in skipped_photos:
                values[index["merged_into_id"]] = None
        if table == "movement_machine_photos" and values[index["machine_photo_id"]] in (
            skipped_photos
        ):
            continue
        if table == "workout_sets" and values[index["machine_photo_id"]] in skipped_photos:
            values[index["machine_photo_id"]] = None
        batch.append(values)
        inserted += 1
        if len(batch) >= 1000:
            live.executemany(statement, batch)
            batch.clear()
    if batch:
        live.executemany(statement, batch)
    return inserted


def owned_counts(live: sqlite3.Connection, tables: list[str], user_id: str) -> dict[str, int]:
    return {
        table: live.execute(
            f'SELECT COUNT(*) FROM main."{table}" WHERE {live_rows(table)}', {"user_id": user_id}
        ).fetchone()[0]
        for table in tables
    }


def check_references(
    live: sqlite3.Connection,
    tables: list[str],
    user_id: str,
    kept: dict[str, int],
    inserted: dict[str, int],
) -> None:
    """Refuse the restore unless every restored row and reference belongs to this account.

    Rows come from an uploaded file, so a crafted one could name another account's workout or
    exercise as a parent. Every inserted row must fall under its table's ownership rule, so each
    table's owned rows must be the ones kept through the restore plus every inserted row. Each
    owned row's foreign keys must then point at rows the parent table's rule gives this account.
    """
    parameters = {"user_id": user_id}
    owned = owned_counts(live, tables, user_id)
    for table in tables:
        if owned[table] != kept[table] + inserted.get(table, 0):
            raise ArchiveError(DAMAGED)
    for table in tables:
        for key in live.execute(f'PRAGMA foreign_key_list("{table}")').fetchall():
            parent, column, parent_column = key[2], key[3], key[4]
            if ACCOUNT_ROWS.get(parent) is None:
                raise ArchiveError(DAMAGED)
            parent_column = parent_column or "id"
            outside = live.execute(
                f'SELECT COUNT(*) FROM main."{table}" WHERE ({live_rows(table)}) '
                f'AND "{column}" IS NOT NULL AND "{column}" NOT IN '
                f'(SELECT "{parent_column}" FROM main."{parent}" WHERE {live_rows(parent)})',
                parameters,
            ).fetchone()[0]
            if outside:
                raise ArchiveError(DAMAGED)


def clear_orphans(live: sqlite3.Connection, already_broken: set[tuple], tables: list[str]) -> None:
    """Delete rows outside the archive that pointed at data the restore removed.

    Cascades are off during a restore so reactions and comments on workouts the archive still
    has survive. What a cascade would have removed, such as a friend's reaction to a workout
    that is gone, is removed here instead.
    """
    for _ in range(20):
        broken = [
            row
            for row in live.execute("PRAGMA foreign_key_check").fetchall()
            if (row[0], row[1]) not in already_broken
        ]
        if not broken:
            return
        for table, rowid, _parent, _key in broken:
            if table in tables or rowid is None:
                raise ArchiveError(DAMAGED)
            live.execute(f'DELETE FROM "{table}" WHERE rowid = ?', (rowid,))
    raise ArchiveError(DAMAGED)


def check_limits(db: Session, settings: Settings, user: User, counts: ArchiveCounts) -> None:
    """An archive cannot hold more than the account is allowed to. Admins are exempt."""
    if user.is_admin:
        return
    limits = load_account_limits(db, settings)
    over = (
        counts.workouts > limits.workouts_per_account
        or counts.cardio_sessions > limits.cardio_sessions_per_account
        or counts.custom_exercises > limits.custom_exercises_per_account
        or counts.photos > limits.photos_per_account
    )
    if over:
        raise ArchiveError(
            "This archive holds more than this account can keep on this server. "
            "Ask the administrator about the account limits."
        )


def prune_safety_snapshots(db: Session, settings: Settings, user_id: str) -> None:
    snapshots = list(
        db.scalars(
            select(AccountBackup)
            .where(AccountBackup.user_id == user_id, AccountBackup.label.like(f"{SAFETY_LABEL}%"))
            .order_by(AccountBackup.created_at.desc(), AccountBackup.id)
        )
    )
    for snapshot in snapshots[KEPT_SAFETY_SNAPSHOTS:]:
        shutil.rmtree(backup_folder(settings, user_id, snapshot.id), ignore_errors=True)
        db.delete(snapshot)
    db.commit()


def restore_archive(
    db: Session, settings: Settings, user: User, staged: StagedArchive
) -> ArchiveRestored:
    """Replace ``user``'s training data with the staged archive's, or change nothing."""
    user_id = user.id
    check_limits(db, settings, user, staged.counts)
    try:
        create_account_snapshot(
            db, settings, user, f"{SAFETY_LABEL} {utc_now():%Y-%m-%d %H:%M:%S} UTC"
        )
    except BackupError as error:
        raise ArchiveError(
            "Your current data could not be backed up first, so nothing was restored.",
            status_code=500,
        ) from error
    prune_safety_snapshots(db, settings, user_id)
    # End this request's read transaction: the restore writes through its own connection.
    db.rollback()

    tables = restored_tables()
    new_files: list[str] = []
    committed = False
    try:
        with closing(open_untrusted(staged.database)) as archive:
            photos, skipped = prepare_photos(settings, staged, archive)
            new_files = [
                name
                for photo in photos.values()
                for name in (photo.full_filename, photo.thumbnail_filename)
            ]
            with closing(
                sqlite3.connect(settings.database_path, timeout=30, isolation_level=None)
            ) as live:
                # Off, so deleting this account's rows does not cascade into friends' rows.
                live.execute("PRAGMA foreign_keys = OFF")
                live.execute("BEGIN IMMEDIATE")
                try:
                    already_broken = {
                        (row[0], row[1])
                        for row in live.execute("PRAGMA foreign_key_check").fetchall()
                    }
                    old_files = [
                        name
                        for row in live.execute(
                            "SELECT full_filename, thumbnail_filename FROM machine_photos "
                            "WHERE user_id = ?",
                            (user_id,),
                        )
                        for name in row
                    ]
                    parameters = {"user_id": user_id}
                    # Children first: their ownership rules read their parents' rows.
                    for table in reversed([*tables, "personal_records"]):
                        extra = (
                            f" AND key NOT IN ({', '.join('?' for _ in SERVER_MANAGED_SETTINGS)})"
                            if table == "user_settings"
                            else ""
                        )
                        if extra:
                            live.execute(
                                f'DELETE FROM main."{table}" WHERE user_id = ?{extra}',
                                (user_id, *sorted(SERVER_MANAGED_SETTINGS)),
                            )
                        else:
                            live.execute(
                                f'DELETE FROM main."{table}" WHERE {live_rows(table)}', parameters
                            )
                    # Server-managed settings stay through the restore; nothing else should.
                    kept = owned_counts(live, tables, user_id)
                    inserted = {
                        table: insert_rows(live, archive, table, user_id, photos, skipped)
                        for table in tables
                    }
                    check_references(live, tables, user_id, kept, inserted)
                    clear_orphans(live, already_broken, tables)
                    restored = count_rows(live, user_id)
                    live.execute("COMMIT")
                    committed = True
                except sqlite3.IntegrityError as error:
                    live.execute("ROLLBACK")
                    raise ArchiveError(OTHER_ACCOUNT) from error
                except sqlite3.Error as error:
                    live.execute("ROLLBACK")
                    raise ArchiveError(DAMAGED) from error
                except BaseException:
                    live.execute("ROLLBACK")
                    raise
    finally:
        if not committed:
            remove_photo_files(settings, new_files)

    remove_photo_files(settings, set(old_files) - set(new_files))
    db.expire_all()
    rebuild_personal_records(db, user_id)
    # A new revision tells this account's other devices to reload their training data.
    set_setting(db, user_id, CACHE_REVISION_KEY, str(uuid.uuid4()))
    db.commit()
    logger.info("Restored an account archive for %s.", user.username)
    return ArchiveRestored(restored=restored, photos_skipped=len(skipped))


router = APIRouter(prefix="/api/account-archive", tags=["account archive"])
DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]
NO_STORE = {"Cache-Control": "no-store"}


def refusal(error: ArchiveError):
    return api_error(error.status_code, error.code, error.message)


@router.get("")
def download_archive(user: CurrentUser, settings: AppSettings) -> FileResponse:
    try:
        with one_at_a_time(user.id):
            archive, work = build_archive(settings, user)
    except ArchiveError as error:
        raise refusal(error) from error
    except BackupError as error:
        raise api_error(500, "archive_failed", "Your archive could not be prepared.") from error
    return FileResponse(
        archive,
        media_type="application/zip",
        filename=f"relay-archive-{user.username}-{utc_now():%Y-%m-%d}.zip",
        headers=NO_STORE,
        background=BackgroundTask(shutil.rmtree, work, ignore_errors=True),
    )


@router.post("/preview", response_model=ArchivePreview, dependencies=[Depends(limit_save_rate)])
def preview_archive(
    user: CurrentUser,
    settings: AppSettings,
    file: Annotated[UploadFile, File(...)],
) -> ArchivePreview:
    """Check an archive and report what restoring it would bring back. Changes nothing."""
    try:
        with one_at_a_time(user.id):
            staged = stage_archive(settings, file)
            try:
                with closing(open_untrusted(staged.database)) as archive:
                    photo_names = [
                        row[0]
                        for row in archive.execute("SELECT full_filename FROM machine_photos")
                    ]
                missing = sum(
                    1
                    for name in photo_names
                    if not isinstance(name, str)
                    or not SAFE_FILE_NAME.fullmatch(name)
                    or not (staged.folder / PHOTOS / name).is_file()
                )
                with closing(
                    sqlite3.connect(read_only_uri(settings.database_path), uri=True)
                ) as live:
                    current = count_rows(live, user.id)
            finally:
                shutil.rmtree(staged.work, ignore_errors=True)
    except ArchiveError as error:
        raise refusal(error) from error
    finally:
        file.file.close()
    owner = staged.manifest.get("owner")
    created_at = staged.manifest.get("created_at")
    username = owner.get("username") if isinstance(owner, dict) else None
    return ArchivePreview(
        created_at=created_at if isinstance(created_at, str) else None,
        username=username if isinstance(username, str) else None,
        archive=staged.counts,
        current=current,
        photos_skipped=missing,
    )


@router.post("/restore", response_model=ArchiveRestored, dependencies=[Depends(limit_save_rate)])
def restore_account_archive(
    user: CurrentUser,
    db: DbSession,
    settings: AppSettings,
    file: Annotated[UploadFile, File(...)],
) -> ArchiveRestored:
    try:
        with one_at_a_time(user.id):
            staged = stage_archive(settings, file)
            try:
                return restore_archive(db, settings, user, staged)
            finally:
                shutil.rmtree(staged.work, ignore_errors=True)
    except ArchiveError as error:
        raise refusal(error) from error
    finally:
        file.file.close()
