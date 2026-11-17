"""Mirror workout cardio movements into cardio sessions.

Revision ID: 0014_workout_cardio_sessions
Revises: 0013_treadmill_set_fields
"""

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision = "0014_workout_cardio_sessions"
down_revision = "0013_treadmill_set_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cardio_sessions") as batch:
        batch.add_column(sa.Column("source_workout_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("source_movement_index", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_cardio_sessions_source_workout",
            "training_workouts",
            ["source_workout_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch.create_check_constraint(
            "cardio_source_fields_together",
            "(source_workout_id IS NULL AND source_movement_index IS NULL) OR "
            "(source_workout_id IS NOT NULL AND source_movement_index IS NOT NULL)",
        )
        batch.create_unique_constraint(
            "uq_cardio_source_workout_movement",
            ["source_workout_id", "source_movement_index"],
        )
        batch.create_index("ix_cardio_sessions_source_workout_id", ["source_workout_id"])

    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT w.id AS workout_id, w.workout_date, m.order_index, e.name,
                   SUM(s.duration_seconds) AS duration_seconds
            FROM training_workouts AS w
            JOIN workout_movements AS m ON m.workout_id = w.id
            JOIN exercises AS e ON e.id = m.exercise_id
            JOIN workout_sets AS s ON s.movement_id = m.id
            WHERE e.kind = 'CARDIO'
              AND s.completed = 1
              AND s.duration_seconds > 0
            GROUP BY w.id, w.workout_date, m.order_index, e.name
            HAVING SUM(s.duration_seconds) >= 60
            """
        )
    ).mappings()
    now = datetime.now(UTC)
    for row in rows:
        connection.execute(
            sa.text(
                """
                INSERT INTO cardio_sessions (
                    id, session_date, activity_type, duration_minutes, intensity, zone,
                    qualifies_zone2, notes, source_workout_id, source_movement_index,
                    created_at, updated_at
                ) VALUES (
                    :id, :session_date, :activity_type, :duration_minutes,
                    'Imported from workout', 'Zone 2', 1, NULL, :source_workout_id,
                    :source_movement_index, :created_at, :updated_at
                )
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "session_date": row["workout_date"],
                "activity_type": row["name"],
                "duration_minutes": row["duration_seconds"] // 60,
                "source_workout_id": row["workout_id"],
                "source_movement_index": row["order_index"],
                "created_at": now,
                "updated_at": now,
            },
        )


def downgrade() -> None:
    op.execute("DELETE FROM cardio_sessions WHERE source_workout_id IS NOT NULL")
    with op.batch_alter_table("cardio_sessions") as batch:
        batch.drop_index("ix_cardio_sessions_source_workout_id")
        batch.drop_constraint("uq_cardio_source_workout_movement", type_="unique")
        batch.drop_constraint("cardio_source_fields_together", type_="check")
        batch.drop_constraint("fk_cardio_sessions_source_workout", type_="foreignkey")
        batch.drop_column("source_movement_index")
        batch.drop_column("source_workout_id")
