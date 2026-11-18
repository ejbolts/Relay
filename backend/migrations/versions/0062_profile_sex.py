"""Store each account's sex.

Existing accounts start without one and choose it themselves.
"""

import sqlalchemy as sa
from alembic import op

revision = "0062_profile_sex"
down_revision = "0061_password_reset_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A plain column change: rebuilding the users table would disturb every table that refers to it.
    op.add_column("users", sa.Column("sex", sa.String(length=6), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "sex")
