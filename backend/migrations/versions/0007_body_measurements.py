"""Add dated body composition measurements."""

import sqlalchemy as sa
from alembic import op

revision = "0007_body_measurements"
down_revision = "0006_app_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "body_measurements",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("measurement_date", sa.Date(), nullable=False),
        sa.Column("weight_kg", sa.Float(), nullable=False),
        sa.Column("body_fat_pct", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_sample", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("weight_kg > 0 AND weight_kg <= 500", name="body_weight_range"),
        sa.CheckConstraint(
            "body_fat_pct IS NULL OR (body_fat_pct >= 1 AND body_fat_pct <= 70)",
            name="body_fat_range",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("measurement_date"),
    )


def downgrade() -> None:
    op.drop_table("body_measurements")
