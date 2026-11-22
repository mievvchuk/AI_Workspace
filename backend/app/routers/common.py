from collections.abc import AsyncIterator
from typing import Any, TypeVar

from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

M = TypeVar("M")


async def get_owned(db: AsyncSession, model: type[M], obj_id: str | None, user_id: str, label: str = "Об'єкт") -> M:
    obj = await db.get(model, obj_id) if obj_id else None
    if obj is None or getattr(obj, "user_id", None) != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} не знайдено")
    return obj


def sse_response(stream: AsyncIterator[str]) -> StreamingResponse:
    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def require_ai_configured(settings: Any) -> None:
    if not settings.ai_configured:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI-провайдер не налаштовано на сервері")
