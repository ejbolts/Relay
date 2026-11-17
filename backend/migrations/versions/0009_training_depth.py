"""Add PRs, set classifications, supersets, muscle credits, cardio, and goals.

Revision ID: 0009_training_depth
Revises: 0008_machine_photos
"""

import sqlalchemy as sa
from alembic import op

revision = "0009_training_depth"
down_revision = "0008_machine_photos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "body_weight_goals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=False),
        sa.Column("start_weight_kg", sa.Float(), nullable=False),
        sa.Column("target_weight_kg", sa.Float(), nullable=False),
        sa.Column("mode", sa.String(11), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "start_weight_kg > 0 AND target_weight_kg > 0", name="body_goal_weights_positive"
        ),
        sa.CheckConstraint("target_date >= start_date", name="body_goal_dates_ordered"),
    )
    op.create_table(
        "exercise_muscle_contributions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("exercise_id", sa.String(36), nullable=False),
        sa.Column("muscle_name", sa.String(100), nullable=False),
        sa.Column("role", sa.String(9), nullable=False),
        sa.Column("contribution_factor", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("exercise_id", "muscle_name", name="uq_exercise_muscle"),
        sa.CheckConstraint(
            "contribution_factor > 0 AND contribution_factor <= 1",
            name="exercise_muscle_factor_range",
        ),
    )
    op.create_index(
        op.f("ix_exercise_muscle_contributions_exercise_id"),
        "exercise_muscle_contributions",
        ["exercise_id"],
    )

    op.create_table(
        "superset_groups",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workout_id", sa.String(36), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=True),
        sa.ForeignKeyConstraint(["workout_id"], ["training_workouts.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("workout_id", "order_index", name="uq_workout_superset_order"),
        sa.CheckConstraint("order_index >= 0", name="superset_order_nonnegative"),
    )
    op.create_index(op.f("ix_superset_groups_workout_id"), "superset_groups", ["workout_id"])

    with op.batch_alter_table("workout_movements") as batch:
        batch.add_column(sa.Column("superset_group_id", sa.String(36), nullable=True))
        batch.create_foreign_key(
            "fk_workout_movements_superset_group",
            "superset_groups",
            ["superset_group_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_workout_movements_superset_group_id", ["superset_group_id"])

    with op.batch_alter_table("workout_sets") as batch:
        batch.add_column(
            sa.Column("set_type", sa.String(6), nullable=False, server_default="NORMAL")
        )
        batch.add_column(
            sa.Column("failed", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch.add_column(sa.Column("target_reps", sa.Integer(), nullable=True))
        batch.create_check_constraint(
            "workout_set_target_reps_nonnegative", "target_reps IS NULL OR target_reps >= 0"
        )
    op.execute("UPDATE workout_sets SET set_type = 'WARMUP' WHERE warmup = 1")

    op.create_table(
        "personal_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("exercise_id", sa.String(36), nullable=False),
        sa.Column("workout_id", sa.String(36), nullable=False),
        sa.Column("set_id", sa.String(36), nullable=False),
        sa.Column("achieved_date", sa.Date(), nullable=False),
        sa.Column("record_type", sa.String(14), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(30), nullable=False),
        sa.Column("normalized_weight", sa.Float(), nullable=True),
        sa.Column("formula", sa.String(100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workout_id"], ["training_workouts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["set_id"], ["workout_sets.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "set_id", "record_type", "normalized_weight", name="uq_pr_set_type_weight"
        ),
        sa.CheckConstraint("value >= 0", name="personal_record_value_nonnegative"),
    )
    for column in ("exercise_id", "workout_id", "set_id", "achieved_date"):
        op.create_index(op.f(f"ix_personal_records_{column}"), "personal_records", [column])

    op.create_table(
        "cardio_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("activity_type", sa.String(100), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("intensity", sa.String(100), nullable=True),
        sa.Column("zone", sa.String(30), nullable=True),
        sa.Column("qualifies_zone2", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "duration_minutes > 0 AND duration_minutes <= 1440", name="cardio_duration_range"
        ),
    )
    op.create_index(op.f("ix_cardio_sessions_session_date"), "cardio_sessions", ["session_date"])

    connection = op.get_bind()
    for key, value in (
        ("preferred_weight_unit", "kg"),
        ("week_start", "monday"),
        ("zone2_goal_minutes", "150"),
    ):
        connection.execute(
            sa.text("INSERT OR IGNORE INTO app_settings (key, value) VALUES (:key, :value)"),
            {"key": key, "value": value},
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_cardio_sessions_session_date"), table_name="cardio_sessions")
    op.drop_table("cardio_sessions")
    for column in ("achieved_date", "set_id", "workout_id", "exercise_id"):
        op.drop_index(op.f(f"ix_personal_records_{column}"), table_name="personal_records")
    op.drop_table("personal_records")
    with op.batch_alter_table("workout_sets") as batch:
        batch.drop_constraint("workout_set_target_reps_nonnegative", type_="check")
        batch.drop_column("target_reps")
        batch.drop_column("failed")
        batch.drop_column("set_type")
    with op.batch_alter_table("workout_movements") as batch:
        batch.drop_index("ix_workout_movements_superset_group_id")
        batch.drop_constraint("fk_workout_movements_superset_group", type_="foreignkey")
        batch.drop_column("superset_group_id")
    op.drop_index(op.f("ix_superset_groups_workout_id"), table_name="superset_groups")
    op.drop_table("superset_groups")
    op.drop_index(
        op.f("ix_exercise_muscle_contributions_exercise_id"),
        table_name="exercise_muscle_contributions",
    )
    op.drop_table("exercise_muscle_contributions")
    op.drop_table("body_weight_goals")
