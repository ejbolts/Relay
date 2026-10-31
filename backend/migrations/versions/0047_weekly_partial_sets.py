"""Remember partial-set changes from a given week without rewriting earlier weeks."""

import sqlalchemy as sa
from alembic import op

revision = "0047_weekly_partial_sets"
down_revision = "0046_exercise_partial_sets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "exercise_partial_set_weeks",
        sa.Column(
            "exercise_id",
            sa.String(36),
            sa.ForeignKey("exercises.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("week_start", sa.Date(), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("exercise_partial_set_weeks")
