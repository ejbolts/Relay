"""Add user accounts, server-side sessions, and per-user data ownership.

Revision ID: 0027_multi_user_auth
Revises: 0026_remove_training_modes

Existing rows keep ``user_id`` NULL; the first account ever created claims them.
"""

import sqlalchemy as sa
from alembic import op

revision = "0027_multi_user_auth"
down_revision = "0026_remove_training_modes"
branch_labels = None
depends_on = None

OWNED_TABLES = (
    "sessions",
    "push_subscriptions",
    "active_workout_reminders",
    "body_measurements",
    "body_weight_goals",
    "exercises",
    "machine_photos",
    "training_workouts",
    "personal_records",
    "cardio_sessions",
)
# SQLite reflects the original inline UNIQUE constraints without names. A naming convention lets
# batch mode refer to (and therefore drop) them.
UNIQUE_NAMING = {"uq": "uq_%(table_name)s_%(column_0_name)s"}
FOREIGN_KEY_NAMING = {"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("display_name", sa.String(80), nullable=False),
        sa.Column("password_hash", sa.String(300), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_expires_at", "user_sessions", ["expires_at"])
    op.create_table(
        "user_settings",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
    )

    for table in OWNED_TABLES:
        naming = UNIQUE_NAMING if table in {"exercises", "body_measurements"} else None
        with op.batch_alter_table(table, naming_convention=naming) as batch:
            batch.add_column(sa.Column("user_id", sa.String(36), nullable=True))
            batch.create_foreign_key(
                f"fk_{table}_user_id_users", "users", ["user_id"], ["id"], ondelete="CASCADE"
            )
            batch.create_index(f"ix_{table}_user_id", ["user_id"])
            if table == "exercises":
                batch.drop_constraint("uq_exercises_name", type_="unique")
                batch.create_unique_constraint("uq_exercise_user_name", ["user_id", "name"])
            elif table == "body_measurements":
                batch.drop_constraint("uq_body_measurements_measurement_date", type_="unique")
                batch.create_unique_constraint(
                    "uq_body_measurement_user_date", ["user_id", "measurement_date"]
                )


def downgrade() -> None:
    connection = op.get_bind()
    user_count = connection.scalar(sa.text("SELECT COUNT(*) FROM users"))
    if user_count and user_count > 1:
        raise RuntimeError(
            "Cannot downgrade 0027_multi_user_auth with more than one account: the single-user "
            "schema cannot hold several users' data. Delete the extra accounts first."
        )

    for table in reversed(OWNED_TABLES):
        # SQLite also reflects the user_id foreign key without a name; this convention
        # reproduces the name it was created with so batch mode can drop it.
        with op.batch_alter_table(table, naming_convention=FOREIGN_KEY_NAMING) as batch:
            if table == "exercises":
                batch.drop_constraint("uq_exercise_user_name", type_="unique")
                batch.create_unique_constraint("uq_exercises_name", ["name"])
            elif table == "body_measurements":
                batch.drop_constraint("uq_body_measurement_user_date", type_="unique")
                batch.create_unique_constraint(
                    "uq_body_measurements_measurement_date", ["measurement_date"]
                )
            batch.drop_index(f"ix_{table}_user_id")
            batch.drop_constraint(f"fk_{table}_user_id_users", type_="foreignkey")
            batch.drop_column("user_id")

    # Hand the remaining account's preferences back to the global settings table.
    op.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) SELECT key, value FROM user_settings"
    )
    op.drop_table("user_settings")
    op.drop_index("ix_user_sessions_expires_at", table_name="user_sessions")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_table("users")
