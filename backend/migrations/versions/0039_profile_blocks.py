"""Keep blocked members from accessing each other's shared profiles and activity."""

import sqlalchemy as sa
from alembic import op

revision = "0039_profile_blocks"
down_revision = "0038_workout_reactions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profile_blocks",
        sa.Column(
            "blocker_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "blocked_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("blocker_id != blocked_id", name="profile_block_not_self"),
    )
    op.create_index("ix_profile_blocks_blocked_id", "profile_blocks", ["blocked_id"])


def downgrade() -> None:
    op.drop_index("ix_profile_blocks_blocked_id", table_name="profile_blocks")
    op.drop_table("profile_blocks")
