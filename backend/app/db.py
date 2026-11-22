from collections.abc import AsyncIterator
from datetime import datetime, timezone

from sqlalchemy import event, inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from .config import get_settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


settings = get_settings()

if settings.is_postgres:
    # Neon's pooled endpoint is PgBouncer in transaction mode: no server-side prepared statements.
    # On serverless, connections must not outlive a request (instances freeze between calls),
    # so pooling is left to Neon and SQLAlchemy opens one connection per session.
    pool_args = {"poolclass": NullPool} if settings.serverless else {"pool_pre_ping": True}
    engine = create_async_engine(
        settings.database_url,
        future=True,
        connect_args={"ssl": "require", "statement_cache_size": 0, "prepared_statement_cache_size": 0},
        **pool_args,
    )
else:
    engine = create_async_engine(settings.database_url, future=True)

    @event.listens_for(engine.sync_engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record) -> None:  # pragma: no cover - driver hook
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()
        # SQLite's built-in lower() only folds ASCII; ILIKE search must be case-insensitive for Cyrillic too.
        dbapi_conn.create_function("lower", 1, lambda s: s.lower() if isinstance(s, str) else s, deterministic=True)


SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


def _add_missing_columns(sync_conn) -> None:
    """create_all never alters existing tables; add columns introduced after a local database was made."""
    existing = {c["name"] for c in inspect(sync_conn).get_columns("files")}
    if "content" not in existing:
        sync_conn.execute(text("ALTER TABLE files ADD COLUMN content BLOB"))


async def init_db() -> None:
    from . import models  # noqa: F401  register tables

    async with engine.begin() as conn:
        if settings.is_postgres:
            # Several cold-starting instances may run this at once; one creates, the others wait.
            await conn.execute(text("SELECT pg_advisory_xact_lock(724_101)"))
        await conn.run_sync(Base.metadata.create_all)
        if not settings.is_postgres:
            await conn.run_sync(_add_missing_columns)
