"""Move every saved training split to follow logged workouts."""

import json

from alembic import op
from sqlalchemy import text

revision = "0050_split_follow_workouts"
down_revision = "0049_run_reaction"
branch_labels = None
depends_on = None

KEY = "training_split"


def set_progression(value: str) -> None:
    connection = op.get_bind()
    rows = connection.execute(
        text("SELECT user_id, value FROM user_settings WHERE key = :key"), {"key": KEY}
    ).all()
    for user_id, stored in rows:
        try:
            split = json.loads(stored)
        except ValueError:
            continue
        # Unreadable settings are left alone; the app already ignores them.
        if not isinstance(split, dict):
            continue
        split["progression"] = value
        connection.execute(
            text("UPDATE user_settings SET value = :value WHERE user_id = :user AND key = :key"),
            {"value": json.dumps(split, separators=(",", ":")), "user": user_id, "key": KEY},
        )


def upgrade() -> None:
    set_progression("workouts")


def downgrade() -> None:
    set_progression("calendar")
