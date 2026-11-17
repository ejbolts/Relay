"""Let administrators resolve app feedback.

Revision ID: 0035_feedback_resolution
Revises: 0034_youtube_connections

Existing feedback stays open, so administrators see it as waiting for review.
"""

import sqlalchemy as sa
from alembic import op

revision = "0035_feedback_resolution"
down_revision = "0034_youtube_connections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("app_feedback") as batch:
        batch.add_column(sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("resolved_by_id", sa.String(36), nullable=True))
        batch.create_foreign_key(
            "fk_app_feedback_resolved_by_id_users",
            "users",
            ["resolved_by_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_app_feedback_resolved_at", ["resolved_at"])


def downgrade() -> None:
    with op.batch_alter_table("app_feedback") as batch:
        batch.drop_index("ix_app_feedback_resolved_at")
        batch.drop_constraint("fk_app_feedback_resolved_by_id_users", type_="foreignkey")
        batch.drop_column("resolved_by_id")
        batch.drop_column("resolved_at")
