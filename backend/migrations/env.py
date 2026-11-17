from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from alembic.script import ScriptDirectory
from sqlalchemy import engine_from_config, inspect, pool

from app import models  # noqa: F401 - imports mapped models into Base metadata
from app.config import get_settings
from app.database import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
settings = get_settings()
config.set_main_option("sqlalchemy.url", f"sqlite:///{settings.database_path.resolve().as_posix()}")
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        script = ScriptDirectory.from_config(config)
        head = script.get_current_head()
        if not inspect(connection).get_table_names() and context.get_revision_argument() == head:
            # Revision 0001 builds the *current* models rather than the historical schema, so the
            # step-by-step history cannot replay on an empty database. Build the current schema
            # directly and record it as up to date.
            with context.begin_transaction():
                Base.metadata.create_all(connection)
                context.get_context().stamp(script, head)
            connection.commit()
            return
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
