"""Allow the running reaction on shared workouts and comments."""

from alembic import op

revision = "0049_run_reaction"
down_revision = "0048_live_activity"
branch_labels = None
depends_on = None

OLD = "reaction IN ('like', 'love', 'strong', 'fire', 'clap', 'trophy')"
NEW = "reaction IN ('like', 'love', 'strong', 'fire', 'clap', 'trophy', 'run')"


def replace_checks(condition: str) -> None:
    for table, constraint in (
        ("workout_reactions", "workout_reaction_known"),
        ("comment_reactions", "comment_reaction_known"),
    ):
        with op.batch_alter_table(table, recreate="always") as batch:
            batch.drop_constraint(constraint, type_="check")
            batch.create_check_constraint(constraint, condition)


def upgrade() -> None:
    replace_checks(NEW)


def downgrade() -> None:
    op.execute("DELETE FROM workout_reactions WHERE reaction = 'run'")
    op.execute("DELETE FROM comment_reactions WHERE reaction = 'run'")
    op.execute("UPDATE workout_comments SET reaction = NULL WHERE reaction = 'run'")
    op.execute("UPDATE comment_notifications SET reaction = NULL WHERE reaction = 'run'")
    replace_checks(OLD)
