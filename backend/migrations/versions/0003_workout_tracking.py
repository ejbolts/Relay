"""Add structured workout tracking."""

import sqlalchemy as sa
from alembic import op

revision = "0003_workout_tracking"
down_revision = "0002_push_subscriptions"
branch_labels = None
depends_on = None

category_enum = sa.Enum(
    "UPPER", "LOWER", "PUSH", "PULL", "FULL_BODY", "CARDIO", "OTHER", native_enum=False
)
kind_enum = sa.Enum("STRENGTH", "CARDIO", native_enum=False)


def upgrade() -> None:
    op.create_table(
        "exercises",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("category", category_enum, nullable=False),
        sa.Column("kind", kind_enum, nullable=False),
        sa.Column("muscle_group", sa.String(length=100), nullable=False),
        sa.Column("equipment", sa.String(length=100), nullable=True),
        sa.Column("is_custom", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "training_workouts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("workout_date", sa.Date(), nullable=False),
        sa.Column("category", category_enum, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes >= 0",
            name="training_workout_duration_nonnegative",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "workout_movements",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workout_id", sa.String(length=36), nullable=False),
        sa.Column("exercise_id", sa.String(length=36), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.CheckConstraint("order_index >= 0", name="workout_movement_order_nonnegative"),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"]),
        sa.ForeignKeyConstraint(["workout_id"], ["training_workouts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workout_id", "order_index", name="uq_workout_movement_order"),
    )
    op.create_table(
        "workout_sets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("movement_id", sa.String(length=36), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("reps", sa.Integer(), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("rpe", sa.Float(), nullable=True),
        sa.Column("rest_seconds", sa.Integer(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("distance_km", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("completed", sa.Boolean(), nullable=False),
        sa.CheckConstraint("order_index >= 0", name="workout_set_order_nonnegative"),
        sa.CheckConstraint("reps IS NULL OR reps >= 0", name="workout_set_reps_nonnegative"),
        sa.CheckConstraint(
            "weight_kg IS NULL OR weight_kg >= 0", name="workout_set_weight_nonnegative"
        ),
        sa.CheckConstraint("rpe IS NULL OR (rpe >= 1 AND rpe <= 10)", name="workout_set_rpe_range"),
        sa.CheckConstraint(
            "rest_seconds IS NULL OR rest_seconds >= 0", name="workout_set_rest_nonnegative"
        ),
        sa.ForeignKeyConstraint(["movement_id"], ["workout_movements.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("movement_id", "order_index", name="uq_workout_set_order"),
    )


def downgrade() -> None:
    op.drop_table("workout_sets")
    op.drop_table("workout_movements")
    op.drop_table("training_workouts")
    op.drop_table("exercises")
