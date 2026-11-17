"""Add optional maintenance weight bands without changing existing goals."""

import sqlalchemy as sa
from alembic import op

revision = "0053_maintenance_ranges"
down_revision = "0052_must_change_password"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("body_weight_goals") as batch:
        batch.add_column(sa.Column("maintenance_min_kg", sa.Float(), nullable=True))
        batch.add_column(sa.Column("maintenance_max_kg", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("body_weight_goals") as batch:
        batch.drop_column("maintenance_max_kg")
        batch.drop_column("maintenance_min_kg")
