from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


def make_engine():
    settings = get_settings()
    new_engine = create_engine(
        f"sqlite:///{settings.database_path.resolve().as_posix()}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(new_engine, "connect")
    def enable_foreign_keys(dbapi_connection, _):
        # SQLite ignores ON DELETE CASCADE unless this is enabled on every connection.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
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
