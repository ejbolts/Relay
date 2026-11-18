"""Record when a signed-out person asks the admins for a temporary password.

Revision ID: 0061_password_reset_requests
Revises: 0060_cardio_elevation_gain
"""

import sqlalchemy as sa
from alembic import op

revision = "0061_password_reset_requests"
down_revision = "0060_cardio_elevation_gain"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("password_reset_requested_at", sa.DateTime(timezone=True), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("password_reset_requested_at")
