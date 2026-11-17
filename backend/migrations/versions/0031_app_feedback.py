"""Store private application feedback.

Revision ID: 0031_app_feedback
Revises: 0030_username_accounts
"""

import sqlalchemy as sa
from alembic import op

revision = "0031_app_feedback"
down_revision = "0030_username_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_feedback",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("submission_id", sa.String(36), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("user_id", "submission_id"),
    )
    op.create_index("ix_app_feedback_user_id", "app_feedback", ["user_id"])
    op.create_index("ix_app_feedback_created_at", "app_feedback", ["created_at"])


def downgrade() -> None:
    op.drop_table("app_feedback")
