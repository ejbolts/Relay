"""Replace one-way follows with mutual friendships.

Revision ID: 0040_friendships
Revises: 0039_profile_blocks

Each pair of members becomes one friendship row, stored with the lower account id first. An
accepted follow in either direction makes the pair friends; pairs with only pending follows keep
the earliest request, waiting for the other member. Accepted friendships are not new
notifications. Downgrading turns each friendship back into follows in both directions and each
request into one pending follow.
"""

import sqlalchemy as sa
from alembic import op

revision = "0040_friendships"
down_revision = "0039_profile_blocks"
branch_labels = None
depends_on = None


def member_column(name: str, primary_key: bool = True) -> sa.Column:
    return sa.Column(
        name,
        sa.String(36),
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=primary_key,
        nullable=False,
    )


def upgrade() -> None:
    op.create_table(
        "friendships",
        member_column("member_a_id"),
        member_column("member_b_id"),
        member_column("requested_by_id", primary_key=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notification_seen", sa.Boolean(), server_default="0", nullable=False),
        sa.CheckConstraint("member_a_id < member_b_id", name="friendship_ordered_pair"),
        sa.CheckConstraint(
            "requested_by_id IN (member_a_id, member_b_id)", name="friendship_requester_member"
        ),
        sa.CheckConstraint("status IN ('pending', 'accepted')", name="friendship_status_known"),
    )
    op.create_index("ix_friendships_member_b_id", "friendships", ["member_b_id"])

    connection = op.get_bind()
    follows = connection.execute(
        sa.text(
            "SELECT follower_id, followee_id, status, created_at, accepted_at, notification_seen "
            "FROM profile_follows ORDER BY created_at, follower_id"
        )
    ).all()
    pairs: dict[tuple[str, str], list] = {}
    for follow in follows:
        if follow.follower_id == follow.followee_id:
            continue
        pairs.setdefault(tuple(sorted((follow.follower_id, follow.followee_id))), []).append(follow)
    for (member_a, member_b), rows in pairs.items():
        first = rows[0]
        accepted = [row for row in rows if row.status == "accepted"]
        connection.execute(
            sa.text(
                "INSERT INTO friendships (member_a_id, member_b_id, requested_by_id, status, "
                "created_at, accepted_at, notification_seen) VALUES (:member_a, :member_b, "
                ":requested_by, :status, :created_at, :accepted_at, :seen)"
            ),
            {
                "member_a": member_a,
                "member_b": member_b,
                "requested_by": first.follower_id,
                "status": "accepted" if accepted else "pending",
                "created_at": first.created_at,
                "accepted_at": (
                    min(row.accepted_at or row.created_at for row in accepted) if accepted else None
                ),
                # Existing friends are not news; a waiting request stays as its recipient left it.
                "seen": True if accepted else bool(first.notification_seen),
            },
        )
    op.drop_index("ix_profile_follows_followee_id", table_name="profile_follows")
    op.drop_table("profile_follows")


def downgrade() -> None:
    op.create_table(
        "profile_follows",
        member_column("follower_id"),
        member_column("followee_id"),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notification_seen", sa.Boolean(), nullable=False, server_default="0"),
        sa.CheckConstraint("follower_id != followee_id", name="profile_follow_not_self"),
        sa.CheckConstraint("status IN ('pending', 'accepted')", name="profile_follow_status_known"),
    )
    op.create_index("ix_profile_follows_followee_id", "profile_follows", ["followee_id"])

    connection = op.get_bind()
    insert = sa.text(
        "INSERT INTO profile_follows (follower_id, followee_id, status, created_at, accepted_at, "
        "notification_seen) VALUES (:follower, :followee, :status, :created_at, :accepted_at, "
        ":seen)"
    )
    for friendship in connection.execute(
        sa.text(
            "SELECT member_a_id, member_b_id, requested_by_id, status, created_at, accepted_at, "
            "notification_seen FROM friendships"
        )
    ).all():
        requester = friendship.requested_by_id
        other = (
            friendship.member_b_id
            if requester == friendship.member_a_id
            else friendship.member_a_id
        )
        directions = [(requester, other)]
        if friendship.status == "accepted":
            directions.append((other, requester))
        for follower, followee in directions:
            connection.execute(
                insert,
                {
                    "follower": follower,
                    "followee": followee,
                    "status": friendship.status,
                    "created_at": friendship.created_at,
                    "accepted_at": friendship.accepted_at,
                    "seen": friendship.status == "accepted" or friendship.notification_seen,
                },
            )
    op.drop_index("ix_friendships_member_b_id", table_name="friendships")
    op.drop_table("friendships")
