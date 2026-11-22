"""Structured (JSON) AI tasks with a recorded processing log, shared by labs and diagnostics."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import get_settings
from ...db import SessionLocal
from ..usage import UsageLimitExceeded, ensure_within_limit
from .events import EventRecorder
from .provider import ChatMessage, ProviderError
from .runner import Cancelled, ModelResult, parse_json, pick_model, stream_model

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

# A task body receives the recorder + db and yields SSE frames. It may store its final payload in ``out``.
TaskBody = Callable[[EventRecorder, AsyncSession, dict[str, Any]], AsyncIterator[str]]


async def run_task(
    user_id: str,
    kind: str,
    body: TaskBody,
    *,
    on_start: Callable[[AsyncSession, str], Awaitable[None]] | None = None,
    on_failure: Callable[[AsyncSession], Awaitable[None]] | None = None,
) -> AsyncIterator[str]:
    """Wrap a task body with request lifecycle, terminal events and error mapping."""
    async with SessionLocal() as db:
        rec = await EventRecorder.start(db, user_id, kind)
        if on_start:
            await on_start(db, rec.request_id)
        yield rec.frame("start", {})
        out: dict[str, Any] = {}
        try:
            await ensure_within_limit(db, user_id)
            async for frame in body(rec, db, out):
                yield frame
            yield await rec.close("completed", "Готово")
            yield rec.frame("result", out)
        except asyncio.CancelledError:
            await asyncio.shield(_fail(rec, db, on_failure, "cancelled", "З'єднання перервано"))
            raise
        except Cancelled:
            yield await _fail(rec, db, on_failure, "cancelled", "Запит скасовано")
        except ProviderError as exc:
            yield await _fail(rec, db, on_failure, "failed", exc.message, exc.code)
        except UsageLimitExceeded as exc:
            yield await _fail(rec, db, on_failure, "failed", str(exc), "usage_limit")
        except (ValueError, ValidationError):
            yield await _fail(rec, db, on_failure, "failed", "Модель повернула відповідь у неочікуваному форматі", "bad_output")
        except Exception:
            log.exception("%s request %s failed", kind, rec.request_id)
            yield await _fail(rec, db, on_failure, "failed", "Внутрішня помилка сервера", "internal")


async def _fail(
    rec: EventRecorder, db: AsyncSession, on_failure: Callable[[AsyncSession], Awaitable[None]] | None, status: str, message: str, code: str | None = None
) -> str:
    await db.rollback()
    if on_failure:
        await on_failure(db)
    title = "Запит скасовано" if status == "cancelled" else "Помилка"
    return await rec.close(status, title, message, {"code": code} if code else None)


def validate_structured(schema: type[T], data: Any) -> T:
    """Validate model JSON, tolerating one wrapper key that models sometimes add,
    e.g. {"diagnostic_questions": {"questions": [...]}} instead of {"questions": [...]}."""
    def without_nulls(d: Any) -> Any:
        # models emit null for "nothing here"; dropping the key lets the schema default apply
        return {k: v for k, v in d.items() if v is not None} if isinstance(d, dict) else d

    try:
        return schema.model_validate(without_nulls(data))
    except ValidationError:
        if isinstance(data, dict) and len(data) == 1:
            inner = next(iter(data.values()))
            if isinstance(inner, dict):
                return schema.model_validate(without_nulls(inner))
        raise


async def model_json(
    rec: EventRecorder,
    db: AsyncSession,
    user_id: str,
    messages: list[ChatMessage],
    schema: type[T],
    title: str,
    holder: dict[str, Any],
    *,
    model_id: str | None = None,
    effort: str = "medium",
) -> AsyncIterator[str]:
    """Call the model, then validate JSON against ``schema`` as a recorded step. Result -> holder['value']."""
    spec = pick_model(model_id, get_settings().default_model)
    result = ModelResult()
    # Reasoning models spend a large share of the budget before answering; structured outputs
    # (e.g. 15 questions as JSON) need room after that.
    async for frame in stream_model(rec, db, user_id, spec, effort, messages, result, emit_deltas=False, title=title, max_tokens=16_384):
        yield frame
    step, frame = await rec.begin("tool_started", "validate", "Перевірка структури результату")
    yield frame
    try:
        holder["value"] = validate_structured(schema, parse_json(result.text))
    except (ValueError, ValidationError) as exc:
        # log the reason (not the content) so format problems with a model can be diagnosed
        log.warning("structured output rejected (%s, %d chars): %s", schema.__name__, len(result.text), str(exc)[:500])
        yield await rec.finish(step, "Відповідь моделі не відповідає очікуваній схемі", status="failed", event_type="tool_failed")
        raise
    yield await rec.finish(step, "Структуру перевірено", event_type="tool_completed")
