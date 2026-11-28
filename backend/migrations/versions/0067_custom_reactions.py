"""Allow any single emoji as a reaction to a workout or comment.

The seven original reactions keep their stored names; other emojis are stored as themselves,
so the fixed list check becomes a length check. Downgrading removes the other emojis.

Revision ID: 0067_custom_reactions
Revises: 0066_expo_push_tokens
"""

from alembic import op

revision = "0067_custom_reactions"
down_revision = "0066_expo_push_tokens"
branch_labels = None
depends_on = None

KNOWN = "reaction IN ('like', 'love', 'strong', 'fire', 'clap', 'trophy', 'run')"
LENGTH = "length(reaction) BETWEEN 1 AND 16"
TABLES = ("workout_reactions", "comment_reactions")


def name(table: str, suffix: str) -> str:
    return f"{table.removesuffix('s')}_{suffix}"


def replace_checks(old: str, new: str, condition: str) -> None:
    for table in TABLES:
        with op.batch_alter_table(table, recreate="always") as batch:
            batch.drop_constraint(name(table, old), type_="check")
            batch.create_check_constraint(name(table, new), condition)


def upgrade() -> None:
    replace_checks("known", "length", LENGTH)


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"DELETE FROM {table} WHERE NOT ({KNOWN})")
    for table in ("workout_comments", "comment_notifications"):
        op.execute(
            f"UPDATE {table} SET reaction = NULL WHERE reaction IS NOT NULL AND NOT ({KNOWN})"
        )
    replace_checks("length", "known", KNOWN)
