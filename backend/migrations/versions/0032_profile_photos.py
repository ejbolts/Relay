"""Let each account store a profile photo.

Revision ID: 0032_profile_photos
Revises: 0031_app_feedback

Photo files live under ``data/profile-photos/``. Downgrading drops only the column; the files
stay on disk.
"""

import sqlalchemy as sa
from alembic import op

revision = "0032_profile_photos"
down_revision = "0031_app_feedback"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("profile_photo_filename", sa.String(64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("profile_photo_filename")
