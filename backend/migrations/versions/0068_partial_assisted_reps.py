"""Record partial and assisted reps on a set, for exercises that track them.

A set's ``reps`` stay its full reps. Existing sets have neither kind of extra rep, and no
exercise tracks them until its owner turns that on.

Revision ID: 0068_partial_assisted_reps
Revises: 0067_custom_reactions
"""

import sqlalchemy as sa
from alembic import op

revision = "0068_partial_assisted_reps"
down_revision = "0067_custom_reactions"
branch_labels = None
depends_on = None

REP_COLUMNS = ("partial_reps", "assisted_reps")


def upgrade() -> None:
    op.add_column(
        "exercises",
        sa.Column("extra_reps_enabled", sa.Boolean(), nullable=False, server_default="0"),
    )
    with op.batch_alter_table("workout_sets") as batch:
        for column in REP_COLUMNS:
            batch.add_column(sa.Column(column, sa.Integer(), nullable=True))
            batch.create_check_constraint(
                f"workout_set_{column}_nonnegative", f"{column} IS NULL OR {column} >= 0"
            )


def downgrade() -> None:
    with op.batch_alter_table("workout_sets") as batch:
        for column in REP_COLUMNS:
            batch.drop_constraint(f"workout_set_{column}_nonnegative", type_="check")
            batch.drop_column(column)
    op.drop_column("exercises", "extra_reps_enabled")
