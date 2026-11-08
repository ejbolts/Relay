"""Let an admin require a new password after handing out a temporary one."""

import sqlalchemy as sa
from alembic import op

revision = "0051_must_change_password"
down_revision = "0050_split_follow_workouts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default="0")
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("must_change_password")
