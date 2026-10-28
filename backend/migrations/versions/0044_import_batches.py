"""Track new CSV imports for account-scoped undo; leave legacy history untouched."""

import sqlalchemy as sa
from alembic import op

revision = "0044_import_batches"
down_revision = "0043_workout_save_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "import_batches",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("file_name", sa.String(200), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("workout_ids", sa.JSON(), nullable=False),
        sa.Column("measurements", sa.JSON(), nullable=False),
        sa.Column("exercises", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_import_batches_user_id", "import_batches", ["user_id"])


def downgrade() -> None:
    op.drop_table("import_batches")
