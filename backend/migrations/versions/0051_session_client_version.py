"""Record which app release each signed-in session last used."""

import sqlalchemy as sa
from alembic import op

revision = "0051_session_client_version"
down_revision = "0050_split_follow_workouts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("user_sessions") as batch:
        batch.add_column(sa.Column("client_version", sa.String(length=32), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("user_sessions") as batch:
        batch.drop_column("client_version")
