"""Track average METs for cardio sessions.

Revision ID: 0025_cardio_mets
Revises: 0024_merge_machine_triceps_extension
"""

import sqlalchemy as sa
from alembic import op

revision = "0025_cardio_mets"
down_revision = "0024_merge_machine_triceps_extension"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cardio_sessions") as batch:
        batch.add_column(sa.Column("average_mets", sa.Float(), nullable=True))
        batch.create_check_constraint(
            "cardio_average_mets_range",
            "average_mets IS NULL OR (average_mets > 0 AND average_mets <= 50)",
        )


def downgrade() -> None:
    with op.batch_alter_table("cardio_sessions") as batch:
        batch.drop_constraint("cardio_average_mets_range", type_="check")
        batch.drop_column("average_mets")
