"""Add reusable exercise machine photos and workout movement pins."""

import sqlalchemy as sa
from alembic import op

revision = "0008_machine_photos"
down_revision = "0007_body_measurements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "machine_photos",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("exercise_id", sa.String(length=36), nullable=False),
        sa.Column("caption", sa.String(length=160), nullable=False),
        sa.Column("original_filename", sa.String(length=500), nullable=False),
        sa.Column("full_filename", sa.String(length=200), nullable=False),
        sa.Column("thumbnail_filename", sa.String(length=200), nullable=False),
        sa.Column("media_type", sa.String(length=100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint("file_size > 0", name="machine_photo_file_size_positive"),
        sa.CheckConstraint("width > 0", name="machine_photo_width_positive"),
        sa.CheckConstraint("height > 0", name="machine_photo_height_positive"),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("full_filename"),
        sa.UniqueConstraint("thumbnail_filename"),
    )
    op.create_index(
        op.f("ix_machine_photos_exercise_id"), "machine_photos", ["exercise_id"], unique=False
    )
    op.create_table(
        "movement_machine_photos",
        sa.Column("movement_id", sa.String(length=36), nullable=False),
        sa.Column("machine_photo_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["machine_photo_id"], ["machine_photos.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["movement_id"], ["workout_movements.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("movement_id", "machine_photo_id"),
    )


def downgrade() -> None:
    op.drop_table("movement_machine_photos")
    op.drop_index(op.f("ix_machine_photos_exercise_id"), table_name="machine_photos")
    op.drop_table("machine_photos")
