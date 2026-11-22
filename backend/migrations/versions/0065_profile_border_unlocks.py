"""Record the first day each account earned a profile border."""

import sqlalchemy as sa
from alembic import op

revision = "0065_profile_border_unlocks"
down_revision = "0064_profile_borders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profile_border_unlocks",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("border_key", sa.String(40)),
        sa.Column("unlocked_on", sa.Date(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("user_id", "border_key"),
    )


def downgrade() -> None:
    op.drop_table("profile_border_unlocks")
