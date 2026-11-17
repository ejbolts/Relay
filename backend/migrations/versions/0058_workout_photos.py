"""Photos of a whole workout, shown with it to everyone who can see the workout."""

import sqlalchemy as sa
from alembic import op

revision = "0058_workout_photos"
down_revision = "0057_active_workout_sync"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workout_photos",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("workout_id", sa.String(length=36), nullable=False),
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
        sa.CheckConstraint("file_size > 0", name="workout_photo_file_size_positive"),
        sa.CheckConstraint("width > 0", name="workout_photo_width_positive"),
        sa.CheckConstraint("height > 0", name="workout_photo_height_positive"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workout_id"], ["training_workouts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("full_filename"),
        sa.UniqueConstraint("thumbnail_filename"),
    )
    op.create_index(op.f("ix_workout_photos_user_id"), "workout_photos", ["user_id"])
    op.create_index(op.f("ix_workout_photos_workout_id"), "workout_photos", ["workout_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_workout_photos_workout_id"), table_name="workout_photos")
    op.drop_index(op.f("ix_workout_photos_user_id"), table_name="workout_photos")
    op.drop_table("workout_photos")
