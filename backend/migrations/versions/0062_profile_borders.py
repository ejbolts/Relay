"""Store each account's sex and the earned profile border it wears."""

import sqlalchemy as sa
from alembic import op

revision = "0062_profile_borders"
down_revision = "0061_password_reset_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Plain column changes: rebuilding the users table would disturb every table that refers to it.
    op.add_column("users", sa.Column("sex", sa.String(length=6), nullable=True))
    op.add_column("users", sa.Column("profile_border", sa.String(length=40), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "profile_border")
    op.drop_column("users", "sex")
