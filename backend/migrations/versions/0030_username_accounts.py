"""Replace account emails with unique, case-insensitive usernames.

Revision ID: 0030_username_accounts
Revises: 0029_account_backups

Account IDs, password hashes and ownership are unchanged. Old email local parts become
usernames, with invalid characters replaced and numeric suffixes to resolve collisions.
The old addresses are removed; downgrade cannot recover them.
"""

import re

import sqlalchemy as sa
from alembic import op

revision = "0030_username_accounts"
down_revision = "0029_account_backups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    # Rebuilding a referenced SQLite table with FK enforcement can cascade-delete its children.
    # Alembic's dedicated connection has enforcement off; refuse unsafe external callers.
    if connection.scalar(sa.text("PRAGMA foreign_keys")):
        raise RuntimeError("Run username migration on an Alembic connection with foreign_keys OFF.")

    rows = connection.execute(sa.text("SELECT id, email FROM users ORDER BY created_at, id")).all()
    bases = []
    for _, email in rows:
        base = re.sub(r"[^a-z0-9._-]+", "-", email.split("@", 1)[0].lower())
        base = base.lstrip("._-")[:32]
        bases.append(base if len(base) >= 3 else "user")
    reserved = set(bases)
    used = set()

    op.add_column("users", sa.Column("username", sa.String(32, collation="NOCASE")))
    for (user_id, _), base in zip(rows, bases, strict=True):
        username = base
        counter = 2
        while username in used or (username != base and username in reserved):
            suffix = f"-{counter}"
            username = base[: 32 - len(suffix)] + suffix
            counter += 1
        used.add(username)
        connection.execute(
            sa.text("UPDATE users SET username = :username WHERE id = :id"),
            {"id": user_id, "username": username},
        )

    # Batch rebuilding removes constraints for the dropped column, regardless of their name.
    with op.batch_alter_table("users") as batch:
        batch.drop_column("email")
        batch.alter_column(
            "username",
            existing_type=sa.String(32),
            type_=sa.String(32, collation="NOCASE"),
            nullable=False,
        )
        batch.create_unique_constraint("uq_users_username", ["username"])


def downgrade() -> None:
    raise RuntimeError(
        "Account emails were removed and cannot be recovered. Restore the pre-upgrade backup "
        "with the previous app version to roll back username accounts."
    )
