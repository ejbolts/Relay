"""Persist favorite exercises.

Revision ID: 0012_exercise_favorites
Revises: 0011_training_phase_history
"""

import sqlalchemy as sa
from alembic import op

revision = "0012_exercise_favorites"
down_revision = "0011_training_phase_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("exercises") as batch:
        batch.add_column(
            sa.Column("is_favorite", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("exercises") as batch:
        batch.drop_column("is_favorite")
