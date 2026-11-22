from collections.abc import AsyncIterator
from datetime import datetime, timezone

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import get_settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


settings = get_settings()
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


async def init_db() -> None:
    from . import models  # noqa: F401  register tables

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
