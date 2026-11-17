"""Account-owned workout types; removing a type preserves historical workouts.

Revision ID: 0036_workout_types
Revises: 0035_feedback_resolution
"""

import sqlalchemy as sa
from alembic import op

revision = "0036_workout_types"
down_revision = "0035_feedback_resolution"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workout_types",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(40, collation="NOCASE"), nullable=False),
        sa.Column("color", sa.String(7), nullable=False),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default="0"),
        sa.UniqueConstraint("user_id", "name", name="uq_workout_type_user_name"),
    )
    op.create_index("ix_workout_types_user_id", "workout_types", ["user_id"])
    # SQLite accepts an inline foreign key when adding a nullable column. Avoid
    # rebuilding this parent table: dropping it with foreign keys enabled would
    # cascade into saved movements, sets, records and cardio sessions.
    op.execute(
        "ALTER TABLE training_workouts ADD COLUMN workout_type_id VARCHAR(36) "
        "REFERENCES workout_types(id) ON DELETE RESTRICT"
    )


def downgrade() -> None:
    op.drop_column("training_workouts", "workout_type_id")
    op.drop_table("workout_types")
