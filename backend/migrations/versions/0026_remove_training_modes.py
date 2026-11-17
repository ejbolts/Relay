"""Remove training modes, phase history, and body-weight goal modes.

Revision ID: 0026_remove_training_modes
Revises: 0025_cardio_mets
"""

import sqlalchemy as sa
from alembic import op

revision = "0026_remove_training_modes"
down_revision = "0025_cardio_mets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM app_settings WHERE key = 'training_mode'")
    op.drop_table("training_phases")
    with op.batch_alter_table("body_weight_goals") as batch:
        batch.drop_column("mode")


def downgrade() -> None:
    with op.batch_alter_table("body_weight_goals") as batch:
        batch.add_column(
            sa.Column(
                "mode",
                sa.String(11),
                nullable=False,
                server_default="MAINTENANCE",
            )
        )

    op.create_table(
        "training_phases",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("mode", sa.String(11), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("start_date"),
    )
