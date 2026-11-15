"""Private account-wide live workout drafts and durable inactivity reminders."""

import sqlalchemy as sa
from alembic import op

revision = "0057_active_workout_sync"
down_revision = "0054_set_machine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "active_workout_sync",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("draft", sa.JSON(), nullable=True),
        sa.Column("session_id", sa.String(36), nullable=True),
        sa.Column("started_at", sa.String(30), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reminder_delivered", sa.Boolean(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("active_workout_sync")
