"""Delete the settings rows left behind by the removed FFMI calculator.

The calculator kept each account's inputs in a ``ffmi_profile`` row of ``user_settings``. Nothing
reads those rows since the calculator was removed, yet they stayed in the database and in account
backups. Body measurements and weigh-ins live in their own rows and are untouched. The deleted
values cannot be recovered, so downgrading restores nothing.
"""

import sqlalchemy as sa
from alembic import op

revision = "0055_remove_ffmi_profiles"
down_revision = "0054_set_machine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("DELETE FROM user_settings WHERE key = 'ffmi_profile'"))


def downgrade() -> None:
    pass
