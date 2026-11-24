from __future__ import annotations

import sqlite3
import time
from contextlib import closing

from sqlalchemy import select

from app.config import get_settings
from app.database import BUSY_TIMEOUT_SECONDS, SessionLocal, engine
from app.models import BodyMeasurement


def test_database_uses_write_ahead_logging_without_giving_up_durability():
    with engine.connect() as connection:
        assert connection.exec_driver_sql("PRAGMA journal_mode").scalar() == "wal"
        # FULL: an acknowledged save is on disk. The app drops its own copy once the server
        # answers, so a faster setting could lose a workout to a crash.
        assert connection.exec_driver_sql("PRAGMA synchronous").scalar() == 2
        assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
        assert (
            connection.exec_driver_sql("PRAGMA busy_timeout").scalar()
            == BUSY_TIMEOUT_SECONDS * 1000
        )


def test_reads_are_answered_while_another_connection_is_saving(client):
    saved = client.post(
        "/api/body-measurements", json={"measurement_date": "2026-11-24", "weight_kg": 84}
    )
    assert saved.status_code == 200, saved.text

    # A save that rebuilds an account's records holds the database for seconds. Readers used to
    # be locked out while it committed, which failed unrelated screens such as a profile.
    with closing(sqlite3.connect(get_settings().database_path, isolation_level=None)) as writer:
        writer.execute("BEGIN EXCLUSIVE")
        writer.execute("UPDATE body_measurements SET weight_kg = 90")
        started = time.monotonic()
        with SessionLocal() as db:
            weights = list(db.scalars(select(BodyMeasurement.weight_kg)))
        waited = time.monotonic() - started
        writer.execute("ROLLBACK")

    # The reader sees the last committed state straight away, not the unfinished save.
    assert weights == [84]
    assert waited < BUSY_TIMEOUT_SECONDS / 2
