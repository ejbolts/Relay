"""Let accounts share their profile and follow each other.

Revision ID: 0033_profile_sharing
Revises: 0032_profile_photos

Accounts without a ``profile_sharing`` row are private. Downgrading drops the sharing choices and
follows only.
"""

import sqlalchemy as sa
from alembic import op

revision = "0033_profile_sharing"
down_revision = "0032_profile_photos"
branch_labels = None
depends_on = None

CHOICES = (
    "share_notes",
    "share_cardio",
    "share_body_weight",
    "share_goals",
    "share_machine_photos",
)


def user_column(name: str) -> sa.Column:
    return sa.Column(
        name, sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )


def upgrade() -> None:
    op.create_table(
        "profile_sharing",
        user_column("user_id"),
        sa.Column("visibility", sa.String(20), server_default="private", nullable=False),
        *(sa.Column(name, sa.Boolean(), server_default="0", nullable=False) for name in CHOICES),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "visibility IN ('private', 'followers', 'public')", name="profile_visibility_known"
        ),
    )
    op.create_table(
        "profile_follows",
        user_column("follower_id"),
        user_column("followee_id"),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("follower_id != followee_id", name="profile_follow_not_self"),
        sa.CheckConstraint("status IN ('pending', 'accepted')", name="profile_follow_status_known"),
    )
    op.create_index("ix_profile_follows_followee_id", "profile_follows", ["followee_id"])


def downgrade() -> None:
    op.drop_table("profile_follows")
    op.drop_table("profile_sharing")
