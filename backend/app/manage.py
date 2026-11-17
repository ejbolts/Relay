"""Administrative commands: ``python -m app.manage <command>``.

Run from the folder that holds the app's ``.env`` (the repository root, or /opt/gym-logger on the
server) so the commands use the same database as the running app.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys
from collections.abc import Sequence
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.exc import OperationalError

from .account_backups import (
    BackupError,
    backup_folder,
    create_account_snapshot,
    import_legacy_backup,
)
from .accounts import UsernameTakenError, create_user, normalize_username
from .auth import MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, hash_password
from .config import get_settings
from .database import SessionLocal
from .models import AccountBackup, User, UserSession


def prompt_new_password() -> str:
    password = getpass.getpass("Password: ")
    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        raise SystemExit(
            f"Password must be {MIN_PASSWORD_LENGTH}-{MAX_PASSWORD_LENGTH} characters long."
        )
    if getpass.getpass("Repeat password: ") != password:
        raise SystemExit("Passwords did not match.")
    return password


def clean_username(value: str) -> str:
    try:
        return normalize_username(value)
    except ValueError as error:
        raise SystemExit(str(error)) from error


def command_create_user(args: argparse.Namespace) -> None:
    display_name = " ".join(args.display_name.split())
    if not 1 <= len(display_name) <= 80:
        raise SystemExit("Display name must be 1-80 characters long.")
    username = clean_username(args.username)
    password = prompt_new_password()
    with SessionLocal() as db:
        try:
            user = create_user(
                db,
                get_settings(),
                username=username,
                display_name=display_name,
                password=password,
                force_admin=args.admin,
            )
        except UsernameTakenError:
            raise SystemExit(f"An account for {username} already exists.") from None
        role = "admin" if user.is_admin else "user"
        print(f"Created {role} account {user.username} ({user.id}).")


def command_reset_password(args: argparse.Namespace) -> None:
    username = clean_username(args.username)
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == username))
        if user is None:
            raise SystemExit(f"No account for {username}.")
        user.password_hash = hash_password(prompt_new_password())
        # Anyone signed in with the old password is signed out.
        db.execute(delete(UserSession).where(UserSession.user_id == user.id))
        db.commit()
        print(f"Password updated for {user.username}; all sessions were signed out.")


def command_list_users(_: argparse.Namespace) -> None:
    with SessionLocal() as db:
        users = list(db.scalars(select(User).order_by(User.created_at, User.username)))
    if not users:
        print("No accounts yet. The first account created becomes the admin.")
        return
    for user in users:
        role = "admin" if user.is_admin else "user"
        status = "disabled" if user.disabled_at else "active"
        print(f"{user.username}\t{user.display_name}\t{role}\t{status}\t{user.created_at:%Y-%m-%d}")


def find_user(db, username: str) -> User:
    username = clean_username(username)
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        raise SystemExit(f"No account for {username}.")
    return user


def describe_backup(backup: AccountBackup) -> str:
    size = backup.size_bytes / (1024 * 1024)
    return f"{backup.label} ({backup.file_count} files, {size:.1f} MB)"


def command_backup_account(args: argparse.Namespace) -> None:
    settings = get_settings()
    with SessionLocal() as db:
        user = find_user(db, args.username)
        try:
            backup = create_account_snapshot(db, settings, user, args.label)
        except BackupError as error:
            raise SystemExit(str(error)) from None
        print(f"Backed up {user.username}: {describe_backup(backup)}")
        print(f"  {backup_folder(settings, user.id, backup.id)}")


def command_import_legacy_backup(args: argparse.Namespace) -> None:
    settings = get_settings()
    source = Path(args.source)
    if not source.is_dir():
        raise SystemExit(f"No folder at {source}.")
    with SessionLocal() as db:
        user = find_user(db, args.username)
        try:
            backup = import_legacy_backup(db, settings, user, source, args.label)
        except BackupError as error:
            raise SystemExit(str(error)) from None
        print(f"Filed under {user.username}: {describe_backup(backup)}")
        print(f"  {backup_folder(settings, user.id, backup.id)}")


def command_list_backups(args: argparse.Namespace) -> None:
    with SessionLocal() as db:
        query = (
            select(AccountBackup, User.username)
            .join(User, User.id == AccountBackup.user_id)
            .order_by(User.username, AccountBackup.created_at)
        )
        if args.username:
            query = query.where(AccountBackup.user_id == find_user(db, args.username).id)
        rows = db.execute(query).all()
    if not rows:
        print("No backups yet.")
        return
    for backup, username in rows:
        print(
            f"{username}	{backup.created_at:%Y-%m-%d %H:%M}	{backup.kind}	"
            f"{describe_backup(backup)}	{backup.id}"
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.manage", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    create = commands.add_parser("create-user", help="Create an account (prompts for a password).")
    create.add_argument("--username", required=True)
    create.add_argument("--display-name", required=True)
    create.add_argument("--admin", action="store_true", help="Make the account an administrator.")
    create.set_defaults(handler=command_create_user)

    reset = commands.add_parser("reset-password", help="Set a new password for an account.")
    reset.add_argument("--username", required=True)
    reset.set_defaults(handler=command_reset_password)

    listing = commands.add_parser("list-users", help="List all accounts.")
    listing.set_defaults(handler=command_list_users)

    backup = commands.add_parser(
        "backup-account", help="Back up one account's data, and nobody else's."
    )
    backup.add_argument("--username", required=True)
    backup.add_argument("--label")
    backup.set_defaults(handler=command_backup_account)

    legacy = commands.add_parser(
        "import-legacy-backup",
        help="File a backup from before accounts under the account that claimed that data.",
    )
    legacy.add_argument("--username", required=True)
    legacy.add_argument("--source", required=True, help="The backup folder or its data folder.")
    legacy.add_argument("--label")
    legacy.set_defaults(handler=command_import_legacy_backup)

    backups = commands.add_parser("list-backups", help="List backups and the account each is for.")
    backups.add_argument("--username", help="Only this account's backups.")
    backups.set_defaults(handler=command_list_backups)
    return parser


def check_database_location() -> None:
    """Refuse to guess: without .env the default relative path would open a different database."""
    if not Path(".env").is_file() and "GYM_DATABASE_PATH" not in os.environ:
        raise SystemExit(
            f"No .env file in {Path.cwd()}. Run this from the folder that holds the app's .env "
            "(the repository root, or /opt/gym-logger on the server), or set GYM_DATABASE_PATH."
        )
    print(f"Using database {get_settings().database_path.resolve()}", file=sys.stderr)


def main(argv: Sequence[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    check_database_location()
    try:
        args.handler(args)
    except OperationalError as error:
        raise SystemExit(
            f"Could not read the database ({error.orig}). Run `alembic upgrade head` first."
        ) from error


if __name__ == "__main__":
    main(sys.argv[1:])
