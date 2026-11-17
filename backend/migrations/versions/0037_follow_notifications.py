"""Remember dismissed new-follower notifications without changing profile visibility."""

import sqlalchemy as sa
from alembic import op

revision = "0037_follow_notifications"
down_revision = "0036_workout_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "profile_follows",
        sa.Column("notification_seen", sa.Boolean(), nullable=False, server_default="0"),
    )
    # Existing followers are not new notifications. Pending requests remain actionable.
    op.execute("UPDATE profile_follows SET notification_seen = 1 WHERE status = 'accepted'")


def downgrade() -> None:
    op.drop_column("profile_follows", "notification_seen")
