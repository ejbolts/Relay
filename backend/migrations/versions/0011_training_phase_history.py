"""Add dated training-phase history for body-weight trends.

Revision ID: 0011_training_phase_history
Revises: 0010_normalize_set_type_enum
"""

import sqlalchemy as sa
from alembic import op

revision = "0011_training_phase_history"
down_revision = "0010_normalize_set_type_enum"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Older app starts may have created this mapped table before Alembic ran.
    # Adopt that matching table instead of failing the migration.
    if not sa.inspect(op.get_bind()).has_table("training_phases"):
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

    # Preserve phase dates already captured by body-weight goals. If several goals
    # began on one date, the newest one represents the final phase choice that day.
    op.execute(
        """
        INSERT OR IGNORE INTO training_phases (id, start_date, mode, created_at)
        SELECT
            lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
            lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
            lower(hex(randomblob(6))),
            goal.start_date,
            upper(goal.mode),
            goal.created_at
        FROM body_weight_goals AS goal
        WHERE goal.id = (
            SELECT newest.id
            FROM body_weight_goals AS newest
            WHERE newest.start_date = goal.start_date
            ORDER BY newest.created_at DESC, newest.id DESC
            LIMIT 1
        )
        AND upper(goal.mode) IN ('CUT', 'MAINTENANCE', 'BULK')
        """
    )

    # The current setting wins for today, including a manual phase selection that
    # was made before phase history existed.
    op.execute(
        """
        INSERT OR REPLACE INTO training_phases (id, start_date, mode, created_at)
        SELECT
            lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
            lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
            lower(hex(randomblob(6))),
            date('now', 'localtime'),
            upper(value),
            CURRENT_TIMESTAMP
        FROM app_settings
        WHERE key = 'training_mode'
        AND lower(value) IN ('cut', 'maintenance', 'bulk')
        """
    )


def downgrade() -> None:
    op.drop_table("training_phases")
