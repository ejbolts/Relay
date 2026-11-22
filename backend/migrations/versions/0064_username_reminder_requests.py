"""Record when a signed-out person asks the admins for a forgotten username.

Revision ID: 0064_username_reminder_requests
Revises: 0063_share_body_sizes
"""

import sqlalchemy as sa
from alembic import op

revision = "0064_username_reminder_requests"
down_revision = "0063_share_body_sizes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("username_reminder_requested_at", sa.DateTime(timezone=True), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("username_reminder_requested_at")
