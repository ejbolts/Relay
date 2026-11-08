import importlib.util
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from conftest import TEST_PASSWORD
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import hash_password, verify_password
from app.database import Base
from app.models import (
    AccountBackup,
    Exercise,
    MachinePhoto,
    TrainingWorkout,
    User,
    UserSession,
    UserSetting,
)


def load_migration(name: str = "0030_username_accounts"):
    path = Path(__file__).parents[1] / f"migrations/versions/{name}.py"
    spec = importlib.util.spec_from_file_location(f"migration_{name}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def create_email_schema(connection):
    Base.metadata.create_all(connection)
    # Synthetic previous-version parent table, with the real child schemas and references.
    connection.execute(text("DROP TABLE users"))
    connection.execute(
        text("""
        CREATE TABLE users (
            id VARCHAR(36) PRIMARY KEY,
            email VARCHAR(320) NOT NULL UNIQUE,
            display_name VARCHAR(80) NOT NULL,
            password_hash VARCHAR(300) NOT NULL,
            is_admin BOOLEAN NOT NULL DEFAULT 0,
            disabled_at DATETIME,
            last_active_at DATETIME,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
    """)
    )


def test_migration_preserves_accounts_and_children_and_assigns_unique_usernames():
    migration = load_migration()
    engine = create_engine("sqlite://")
    now = datetime(2026, 10, 1)
    password_hash = hash_password(TEST_PASSWORD)
    emails = [
        "Owner@first.com",
        "owner@second.com",
        "owner-2@third.com",
        "a+b@first.com",
        "a-b@second.com",
        "x@first.com",
        "ç”¨æˆ·@first.com",
        ".First@first.com",
        "Z" * 60 + "@first.com",
        "z" * 32 + "@second.com",
    ]
    expected = [
        "owner",
        "owner-3",
        "owner-2",
        "a-b",
        "a-b-2",
        "user",
        "user-2",
        "first",
        "z" * 32,
        "z" * 30 + "-2",
    ]
    with engine.begin() as connection:
        create_email_schema(connection)
        for i, email in enumerate(emails):
            connection.execute(
                text("""
                INSERT INTO users VALUES (:id, :email, 'Lifter', :hash, :admin,
                    :disabled, :active, :created, :updated)
            """),
                {
                    "id": f"u{i}",
                    "email": email,
                    "hash": password_hash,
                    "admin": i == 0,
                    "disabled": now if i == 2 else None,
                    "active": now,
                    "created": now + timedelta(seconds=i),
                    "updated": now,
                },
            )
        for i in range(len(emails)):
            connection.execute(
                UserSession.__table__.insert().values(
                    id=f"s{i}",
                    user_id=f"u{i}",
                    token_hash=f"hash{i}",
                    expires_at=now + timedelta(days=90),
                )
            )
            connection.execute(
                UserSetting.__table__.insert().values(
                    user_id=f"u{i}", key="week_start", value="sunday"
                )
            )
            connection.execute(
                Exercise.__table__.insert().values(
                    id=f"e{i}", user_id=f"u{i}", name="Squat", category="PUSH", muscle_group="Quads"
                )
            )
            connection.execute(
                TrainingWorkout.__table__.insert().values(
                    id=f"w{i}",
                    user_id=f"u{i}",
                    name="History",
                    category="PUSH",
                    workout_date=date(2026, 9, 1),
                )
            )
            connection.execute(
                MachinePhoto.__table__.insert().values(
                    id=f"p{i}",
                    user_id=f"u{i}",
                    exercise_id=f"e{i}",
                    caption="Synthetic machine photo",
                    original_filename="machine.jpg",
                    full_filename=f"{i}.webp",
                    thumbnail_filename=f"{i}-thumb.webp",
                    file_size=10,
                    width=10,
                    height=10,
                )
            )
            connection.execute(
                AccountBackup.__table__.insert().values(
                    id=f"b{i}",
                    user_id=f"u{i}",
                    kind="snapshot",
                    label="Old snapshot",
                    file_count=1,
                    size_bytes=10,
                )
            )
        before = {
            table.name: connection.execute(select(table)).all()
            for table in (
                UserSession.__table__,
                UserSetting.__table__,
                Exercise.__table__,
                TrainingWorkout.__table__,
                MachinePhoto.__table__,
                AccountBackup.__table__,
            )
        }
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            # The current User model also has the later profile photo and password columns.
            load_migration("0032_profile_photos").upgrade()
            load_migration("0051_must_change_password").upgrade()
        columns = {column["name"] for column in inspect(connection).get_columns("users")}
        assert "username" in columns and "email" not in columns
        assert "profile_photo_filename" in columns
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        for name, rows in before.items():
            assert connection.execute(select(Base.metadata.tables[name])).all() == rows

    with Session(engine) as db:
        for i, username in enumerate(expected):
            user = db.scalar(select(User).where(User.username == username.upper()))
            assert user.id == f"u{i}"
            assert user.password_hash == password_hash and verify_password(
                TEST_PASSWORD, user.password_hash
            )
            assert user.is_admin == (i == 0)
            assert user.disabled_at == (now if i == 2 else None)
            assert user.last_active_at == user.updated_at == now
            assert user.created_at == now + timedelta(seconds=i)
    with engine.begin() as connection:
        with pytest.raises(IntegrityError):
            connection.execute(
                User.__table__.insert().values(
                    username="OWNER", display_name="Duplicate", password_hash=password_hash
                )
            )


def test_empty_database_upgrade_and_unsafe_fk_connection_guard():
    migration = load_migration()
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        create_email_schema(connection)
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        assert connection.scalar(text("SELECT COUNT(*) FROM users")) == 0
        assert "email" not in {
            column["name"] for column in inspect(connection).get_columns("users")
        }
        with Operations.context(MigrationContext.configure(connection)):
            with pytest.raises(RuntimeError, match="pre-upgrade backup"):
                migration.downgrade()
    with create_engine("sqlite://").begin() as connection:
        create_email_schema(connection)
        connection.execute(text("PRAGMA foreign_keys=ON"))
        assert connection.scalar(text("PRAGMA foreign_keys")) == 1
        with Operations.context(MigrationContext.configure(connection)):
            with pytest.raises(RuntimeError, match="foreign_keys OFF"):
                migration.upgrade()
        assert "email" in {column["name"] for column in inspect(connection).get_columns("users")}
        assert "username" not in {
            column["name"] for column in inspect(connection).get_columns("users")
        }
