"""Per-account backups: each belongs to one account and holds only that account's data.

A snapshot copies the account's rows out of the live database into a standalone SQLite file,
together with its machine photos. A legacy import files a backup taken before accounts existed
under the account that claimed the pre-accounts data, which is always the first account.

Backups live in ``account_backups_dir/<user_id>/<backup_id>/`` with a ``manifest.json`` that lists
every file with its size and SHA-256.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .models import AccountBackup, AccountBackupKind, User, new_uuid, utc_now

BACKUP_DATABASE = "database.db"
MANIFEST = "manifest.json"
PHOTOS = "machine-photos"
PROFILE_PHOTOS = "profile-photos"
LEGACY_DATABASE = "gym-video-logger.db"
# Data folders kept from a pre-accounts backup. Server secrets, keys and logs are left out.
LEGACY_FOLDERS = ("machine-photos", "uploads", "outputs", "normalized")
MAX_LABEL_LENGTH = 200

_OWNED = "user_id = :user_id"
_WORKOUTS = "SELECT id FROM src.training_workouts WHERE user_id = :user_id"
_MOVEMENTS = f"SELECT id FROM src.workout_movements WHERE workout_id IN ({_WORKOUTS})"
_SESSIONS = "SELECT id FROM src.sessions WHERE user_id = :user_id"
_EXERCISES = "SELECT id FROM src.exercises WHERE user_id = :user_id"

# The rows of each table that belong in one account's snapshot. ``None`` marks server-wide data,
# sign-ins and device registrations, which never go into an account backup. Every table must be
# listed, so a new table cannot slip into or out of backups unnoticed.
ACCOUNT_ROWS: dict[str, str | None] = {
    "alembic_version": "1 = 1",
    "users": "id = :user_id",
    "user_settings": _OWNED,
    "profile_sharing": _OWNED,
    "sessions": _OWNED,
    "clips": f"session_id IN ({_SESSIONS})",
    "timestamps": f"session_id IN ({_SESSIONS})",
    "body_measurements": _OWNED,
    "body_weight_goals": _OWNED,
    "exercises": _OWNED,
    "exercise_muscle_contributions": f"exercise_id IN ({_EXERCISES})",
    "exercise_partial_set_weeks": f"exercise_id IN ({_EXERCISES})",
    "machine_photos": _OWNED,
    "training_workouts": _OWNED,
    "workout_types": _OWNED,
    "workout_movements": f"workout_id IN ({_WORKOUTS})",
    "workout_sets": f"movement_id IN ({_MOVEMENTS})",
    "superset_groups": f"workout_id IN ({_WORKOUTS})",
    "movement_machine_photos": f"movement_id IN ({_MOVEMENTS})",
    "personal_records": _OWNED,
    "cardio_sessions": _OWNED,
    "push_subscriptions": None,
    "active_workout_reminders": None,
    # A workout in progress is shown to friends live; it is not part of the training archive.
    "live_workouts": None,
    "user_sessions": None,
    "server_settings": None,
    "app_settings": None,
    "account_backups": None,
    # Feedback is sent to administrators, rather than part of a user's training archive.
    "app_feedback": None,
    # Friendships are relationships with other accounts, which a snapshot does not contain.
    "friendships": None,
    # Blocks involve other accounts, which are not restored from an account snapshot.
    "profile_blocks": None,
    # Reactions are exchanged with other accounts, like friendships.
    "workout_reactions": None,
    # Discussions and their notices reference other accounts, like workout reactions.
    "workout_comments": None,
    "comment_reactions": None,
    "comment_notifications": None,
    "youtube_connections": None,
    "youtube_oauth_states": None,
}


class BackupError(Exception):
    """A backup could not be made or imported; the message is shown to the person running it."""


def backup_folder(settings: Settings, user_id: str, backup_id: str) -> Path:
    return settings.account_backups_dir / user_id / backup_id


def account_backups(db: Session, user_id: str) -> list[AccountBackup]:
    return list(
        db.scalars(
            select(AccountBackup)
            .where(AccountBackup.user_id == user_id)
            .order_by(AccountBackup.created_at, AccountBackup.id)
        )
    )


def legacy_data_owner(db: Session) -> User | None:
    """The first account, which claimed every row from before accounts existed."""
    return db.scalar(select(User).order_by(User.created_at, User.id).limit(1))


def create_account_snapshot(
    db: Session, settings: Settings, user: User, label: str | None = None
) -> AccountBackup:
    """Back up ``user``'s rows, machine photos and profile photo, and nobody else's."""
    created_at = utc_now()
    label = clean_label(label or f"Snapshot {created_at:%Y-%m-%d %H:%M} UTC")
    backup_id = new_uuid()
    staging = start_staging(settings, user.id, backup_id)
    try:
        database = staging / BACKUP_DATABASE
        tables = copy_account_rows(settings.database_path, database, user.id)
        missing = copy_photos(database, settings.machine_photos_dir, staging / PHOTOS)
        missing += copy_profile_photo(user, settings.profile_photos_dir, staging / PROFILE_PHOTOS)
        return finish_backup(
            db,
            settings,
            user,
            staging,
            backup_id=backup_id,
            kind=AccountBackupKind.SNAPSHOT,
            label=label,
            created_at=created_at,
            schema_revision=schema_revision(database),
            details={
                "tables": tables,
                "missing_files": missing,
                "not_included": ["video uploads and processed videos"],
            },
        )
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def import_legacy_backup(
    db: Session, settings: Settings, user: User, source: Path, label: str | None = None
) -> AccountBackup:
    """File a backup taken before accounts existed under the account that claimed that data.

    ``source`` is the backup folder, or its ``data`` folder. Databases, photos and video files are
    copied; server secrets, keys and logs are not.
    """
    data = source / "data" if (source / "data").is_dir() else source
    main_database = data / LEGACY_DATABASE
    if not main_database.is_file():
        raise BackupError(f"No {LEGACY_DATABASE} in {data}.")
    owner = legacy_data_owner(db)
    if owner is None or owner.id != user.id:
        claimed_by = f" ({owner.username})" if owner else ""
        raise BackupError(
            "A backup from before accounts holds the data the first account claimed, so it can "
            f"only be filed under that account{claimed_by}."
        )
    databases = sorted({*data.glob("*.db"), *(data / "backups").glob("*.db")})
    for database in databases:
        if account_count(database):
            raise BackupError(
                f"{database.name} already has accounts in it. Only backups from before accounts "
                "can be imported; back up an account with `backup-account` instead."
            )
    fingerprint = sha256_of(main_database)
    already_imported = db.scalar(
        select(AccountBackup.id).where(
            AccountBackup.user_id == user.id, AccountBackup.source_fingerprint == fingerprint
        )
    )
    if already_imported:
        raise BackupError(
            f"This backup is already filed under {user.username} ({already_imported})."
        )

    created_at = utc_now()
    label = clean_label(label or f"Before accounts: {source.resolve().name}")
    backup_id = new_uuid()
    staging = start_staging(settings, user.id, backup_id)
    try:
        for database in databases:
            target = staging / database.relative_to(data)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(database, target)
        for folder in LEGACY_FOLDERS:
            if (data / folder).is_dir():
                shutil.copytree(data / folder, staging / folder)
        kept = {*(database.relative_to(data).parts[0] for database in databases), *LEGACY_FOLDERS}
        skipped = [entry.name for entry in data.iterdir() if entry.name not in kept]
        if data != source:
            skipped += [entry.name for entry in source.iterdir() if entry != data]
        return finish_backup(
            db,
            settings,
            user,
            staging,
            backup_id=backup_id,
            kind=AccountBackupKind.LEGACY_IMPORT,
            label=label,
            created_at=created_at,
            schema_revision=schema_revision(main_database),
            fingerprint=fingerprint,
            details={
                "source": str(source.resolve()),
                "tables": table_counts(main_database),
                "skipped": sorted(skipped),
            },
        )
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def copy_account_rows(source: Path, target: Path, user_id: str) -> dict[str, int]:
    """Write ``user_id``'s rows from the ``source`` database into a new database at ``target``.

    Reads happen in one transaction, so the copy is consistent even while the app is writing.
    The account's password hash is blanked: a backup should never be able to sign anyone in.
    """
    if not source.is_file():
        raise BackupError(f"No database at {source}.")
    with closing(sqlite3.connect(target, isolation_level=None, uri=True)) as connection:
        connection.execute("ATTACH DATABASE ? AS src", (f"{read_only_uri(source)}",))
        schema = connection.execute(
            "SELECT type, name, sql FROM src.sqlite_master "
            "WHERE type IN ('table', 'index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' "
            "ORDER BY type = 'index', rowid"
        ).fetchall()
        tables = [name for kind, name, _sql in schema if kind == "table"]
        unknown = sorted(set(tables) - ACCOUNT_ROWS.keys())
        if unknown:
            raise BackupError(
                f"The database has tables that backups do not know about: {', '.join(unknown)}. "
                "Add them to ACCOUNT_ROWS before backing up."
            )
        for _kind, _name, sql in schema:
            connection.execute(sql)
        counts: dict[str, int] = {}
        connection.execute("BEGIN")
        try:
            for table in tables:
                rows = ACCOUNT_ROWS[table]
                if rows is None:
                    continue
                cursor = connection.execute(
                    f'INSERT INTO main."{table}" SELECT * FROM src."{table}" WHERE {rows}',
                    {"user_id": user_id},
                )
                counts[table] = cursor.rowcount
            connection.execute("UPDATE main.users SET password_hash = ''")
            connection.execute("COMMIT")
        except BaseException:
            connection.execute("ROLLBACK")
            raise
        connection.execute("DETACH DATABASE src")
    return counts


def copy_photos(database: Path, photos_dir: Path, target_dir: Path) -> list[str]:
    """Copy the machine photos the backup's rows refer to; return any that were missing."""
    with closing(sqlite3.connect(read_only_uri(database), uri=True)) as connection:
        rows = connection.execute(
            "SELECT full_filename, thumbnail_filename FROM machine_photos"
        ).fetchall()
    missing = []
    for name in sorted({name for row in rows for name in row}):
        source = photos_dir / name
        # Names come from the database; never let one point outside the photo folder.
        if Path(name).name != name or not source.is_file():
            missing.append(name)
            continue
        target_dir.mkdir(exist_ok=True)
        shutil.copy2(source, target_dir / name)
    return missing


def copy_profile_photo(user: User, photos_dir: Path, target_dir: Path) -> list[str]:
    """Copy the account's profile photo, if it has one; return it if it was missing."""
    name = user.profile_photo_filename
    if not name:
        return []
    source = photos_dir / name
    if Path(name).name != name or not source.is_file():
        return [name]
    target_dir.mkdir(exist_ok=True)
    shutil.copy2(source, target_dir / name)
    return []


def finish_backup(
    db: Session,
    settings: Settings,
    user: User,
    staging: Path,
    *,
    backup_id: str,
    kind: AccountBackupKind,
    label: str,
    created_at: datetime,
    schema_revision: str | None,
    details: dict,
    fingerprint: str | None = None,
) -> AccountBackup:
    files = [
        {
            "path": path.relative_to(staging).as_posix(),
            "size": path.stat().st_size,
            "sha256": sha256_of(path),
        }
        for path in sorted(path for path in staging.rglob("*") if path.is_file())
    ]
    manifest = {
        "format": 2,
        "id": backup_id,
        "kind": kind.value,
        "label": label,
        "owner": {"id": user.id, "username": user.username},
        "created_at": created_at.isoformat(),
        "schema_revision": schema_revision,
        **details,
        "files": files,
    }
    (staging / MANIFEST).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    folder = backup_folder(settings, user.id, backup_id)
    staging.rename(folder)
    backup = AccountBackup(
        id=backup_id,
        user_id=user.id,
        kind=kind.value,
        label=label,
        schema_revision=schema_revision,
        file_count=len(files),
        size_bytes=sum(item["size"] for item in files),
        source_fingerprint=fingerprint,
        created_at=created_at,
    )
    db.add(backup)
    try:
        db.commit()
    except BaseException:
        db.rollback()
        shutil.rmtree(folder, ignore_errors=True)
        raise
    return backup


def start_staging(settings: Settings, user_id: str, backup_id: str) -> Path:
    """A private folder the backup is built in; it only takes its final name once complete."""
    staging = backup_folder(settings, user_id, f"{backup_id}.partial")
    staging.mkdir(parents=True)
    return staging


def clean_label(label: str) -> str:
    label = " ".join(label.split())
    if not 1 <= len(label) <= MAX_LABEL_LENGTH:
        raise BackupError(f"A backup label must be 1-{MAX_LABEL_LENGTH} characters long.")
    return label


def read_only_uri(database: Path) -> str:
    return f"{database.resolve().as_uri()}?mode=ro"


def open_read_only(database: Path) -> sqlite3.Connection:
    try:
        connection = sqlite3.connect(read_only_uri(database), uri=True)
        connection.execute("SELECT name FROM sqlite_master LIMIT 1").fetchall()
    except sqlite3.DatabaseError as error:
        raise BackupError(f"{database.name} is not a readable database ({error}).") from error
    return connection


def table_names(connection: sqlite3.Connection) -> list[str]:
    return [
        name
        for (name,) in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' "
            "ORDER BY name"
        )
    ]


def account_count(database: Path) -> int:
    with closing(open_read_only(database)) as connection:
        if "users" not in table_names(connection):
            return 0
        return connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]


def table_counts(database: Path) -> dict[str, int]:
    with closing(open_read_only(database)) as connection:
        return {
            table: connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
            for table in table_names(connection)
        }


def schema_revision(database: Path) -> str | None:
    with closing(open_read_only(database)) as connection:
        if "alembic_version" not in table_names(connection):
            return None
        row = connection.execute("SELECT version_num FROM alembic_version").fetchone()
        return row[0] if row else None


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
