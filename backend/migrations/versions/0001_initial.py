"""Initial gym video logger schema."""

from alembic import op

from app import models  # noqa: F401 - imports mapped models into Base metadata
from app.database import Base

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
