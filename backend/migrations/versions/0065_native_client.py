"""Record the native platform and build version on a session.

Revision ID: 0065_native_client
Revises: 0064_username_reminder_requests
"""

import sqlalchemy as sa
from alembic import op

revision = "0065_native_client"
down_revision = "0064_username_reminder_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_sessions", sa.Column("native_client", sa.String(32), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("user_sessions") as batch:
        batch.drop_column("native_client")
