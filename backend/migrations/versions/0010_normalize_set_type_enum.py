"""Normalize set-type values to SQLAlchemy enum member names.

Revision ID: 0010_normalize_set_type_enum
Revises: 0009_training_depth
"""

import sqlalchemy as sa
from alembic import op

revision = "0010_normalize_set_type_enum"
down_revision = "0009_training_depth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE workout_sets SET set_type = UPPER(set_type)")
    with op.batch_alter_table("workout_sets") as batch:
        batch.alter_column(
            "set_type",
            existing_type=sa.String(length=6),
            nullable=False,
            server_default="NORMAL",
        )


def downgrade() -> None:
    op.execute("UPDATE workout_sets SET set_type = LOWER(set_type)")
    with op.batch_alter_table("workout_sets") as batch:
        batch.alter_column(
            "set_type",
            existing_type=sa.String(length=6),
            nullable=False,
            server_default="normal",
        )
