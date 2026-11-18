"""Store the earned profile border each account wears."""

import sqlalchemy as sa
from alembic import op

revision = "0064_profile_borders"
down_revision = "0063_share_body_sizes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A plain column change: rebuilding the users table would disturb every table that refers to it.
    op.add_column("users", sa.Column("profile_border", sa.String(length=40), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "profile_border")
