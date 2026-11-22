from datetime import datetime, time, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models import UsageRecord


class UsageLimitExceeded(Exception):
    pass


async def tokens_today(db: AsyncSession, user_id: str) -> int:
    start = datetime.combine(datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc)
    total = await db.scalar(
        select(func.coalesce(func.sum(UsageRecord.prompt_tokens + UsageRecord.completion_tokens), 0)).where(
            UsageRecord.user_id == user_id, UsageRecord.created_at >= start
        )
    )
    return int(total or 0)


async def ensure_within_limit(db: AsyncSession, user_id: str) -> None:
    if await tokens_today(db, user_id) >= get_settings().user_daily_token_limit:
        raise UsageLimitExceeded("Перевищено ваш денний ліміт токенів")


def record_usage(db: AsyncSession, user_id: str, request_id: str, model: str, prompt: int, completion: int) -> None:
    db.add(UsageRecord(user_id=user_id, request_id=request_id, model=model, prompt_tokens=prompt, completion_tokens=completion))
