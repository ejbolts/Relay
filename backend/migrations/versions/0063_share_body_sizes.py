"""Let accounts choose whether their profile shares body measurements.

Existing accounts keep them private until they switch sharing on.
"""

import sqlalchemy as sa
from alembic import op

revision = "0063_share_body_sizes"
down_revision = "0062_profile_borders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "profile_sharing",
        sa.Column("share_body_sizes", sa.Boolean(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    with op.batch_alter_table("profile_sharing") as batch:
        batch.drop_column("share_body_sizes")
