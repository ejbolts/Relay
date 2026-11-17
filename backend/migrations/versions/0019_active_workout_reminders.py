"""Persist two-hour active workout reminders across server restarts."""

import sqlalchemy as sa
from alembic import op

revision = "0019_active_workout_reminders"
down_revision = "0018_cardio_performance_metrics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "active_workout_reminders",
        sa.Column("endpoint", sa.String(2000), primary_key=True),
        sa.Column("timer_id", sa.String(100), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delivered", sa.Boolean(), nullable=False),
        sa.Column("cancelled", sa.Boolean(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("active_workout_reminders")
