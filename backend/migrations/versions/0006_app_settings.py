"""Add persistent app settings for one-time sample seeding."""

import sqlalchemy as sa
from alembic import op

revision = "0006_app_settings"
down_revision = "0005_backfill_training_timestamps"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
