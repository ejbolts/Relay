from __future__ import annotations

import logging
import sqlite3
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

logger = logging.getLogger(__name__)

# How long a save waits for another save to finish before it fails. Long enough to queue behind
# a save that rebuilds an account's records, and short enough that the wait plus the save still
# fits inside the app's own request limits: the server must not keep working on a save whose
# sender has already given up, because the app then sends it again.
BUSY_TIMEOUT_SECONDS = 8


class Base(DeclarativeBase):
    pass


def make_engine():
    settings = get_settings()
    new_engine = create_engine(
        f"sqlite:///{settings.database_path.resolve().as_posix()}",
        connect_args={"check_same_thread": False, "timeout": BUSY_TIMEOUT_SECONDS},
    )

    @event.listens_for(new_engine, "connect")
    def configure_connection(dbapi_connection, _):
        cursor = dbapi_connection.cursor()
        # SQLite ignores ON DELETE CASCADE unless this is enabled on every connection.
        cursor.execute("PRAGMA foreign_keys=ON")
        # Write-ahead logging lets every read carry on while a save is in progress. In the
        # default rollback mode a save that is committing locks readers out, so one slow save
        # failed unrelated screens. The mode is stored in the database file: the first
        # connection converts it and later ones find it already set. Durability is unchanged
        # (synchronous stays FULL), so an acknowledged save still survives a crash.
        try:
            cursor.execute("PRAGMA journal_mode=WAL").fetchone()
        except sqlite3.OperationalError:
            # Converting needs a moment with no other lock on the file. The next new connection
            # tries again, and the app works in either mode meanwhile.
            logger.warning("Could not switch the database to write-ahead logging yet")
        cursor.close()

    return new_engine


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
