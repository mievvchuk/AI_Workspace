"""Shared model-call helpers used by chat, lab analysis and diagnostics."""

from __future__ import annotations

import json
import re
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..usage import record_usage
from .events import EventRecorder
from .provider import ChatMessage, ProviderError, get_provider
from .registry import ModelSpec, get_model, resolve_effort


class Cancelled(Exception):
    pass


@dataclass
class ModelResult:
    text: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    reasoning_chars: int = 0
    truncated: bool = False
    effort: str = "medium"
    frames: list[str] = field(default_factory=list)


def pick_model(model_id: str | None, default: str) -> ModelSpec:
    spec = get_model(model_id or "") or get_model(default)
    if spec is None:  # misconfigured default
        raise ProviderError("model_not_found", "Модель за замовчуванням не зареєстрована")
    return spec


async def stream_model(
    rec: EventRecorder,
    db: AsyncSession,
    user_id: str,
    spec: ModelSpec,
    effort: str,
    messages: list[ChatMessage],
    result: ModelResult,
    *,
    emit_deltas: bool,
    title: str = "Генерація відповіді",
    max_tokens: int | None = None,
) -> AsyncIterator[str]:
    """Run one model call, yielding SSE frames. Fills ``result``; raises Cancelled/ProviderError."""
    used_effort, params = resolve_effort(spec, effort)
    if max_tokens:
        params.setdefault("max_tokens", max_tokens)
    result.effort = used_effort
    step, frame = await rec.begin(
        "model_request_started",
        "model",
        "Запит до моделі",
        spec.label,
        {"model": spec.id, "effort": used_effort, "provider": get_provider().name},
    )
    yield frame
    t_first: float | None = None
    t0 = time.monotonic()
    streaming_step = None
    reasoning_step = None
    last_progress = 0.0
    finish_reason = ""
    async for chunk in get_provider().stream_chat(spec.id, messages, params):
        if rec.cancelled:
            raise Cancelled()
        if chunk.kind == "usage":
            result.prompt_tokens, result.completion_tokens = chunk.prompt_tokens, chunk.completion_tokens
            continue
        if chunk.kind == "finish":
            finish_reason = chunk.text
            continue
        if chunk.kind == "reasoning":
            # Raw reasoning text is never shown or stored; we record that the stage happened and its size.
            if reasoning_step is None and t_first is None:
                yield await rec.finish(step, "Модель прийняла запит", {"first_token_ms": int((time.monotonic() - t0) * 1000)})
                reasoning_step, frame = await rec.begin("model_reasoning", "reasoning", "Модель міркує")
                yield frame
            result.reasoning_chars += len(chunk.text)
            now = time.monotonic()
            if now - last_progress > 1.5:  # real liveness signal, so the client doesn't report silence
                last_progress = now
                yield rec.frame("progress", {"stage": "reasoning", "reasoning_chars": result.reasoning_chars})
            continue
        if t_first is None:
            t_first = time.monotonic()
            if reasoning_step is not None:
                yield await rec.finish(
                    reasoning_step,
                    "Етап міркування завершено (вміст не відображається)",
                    {"reasoning_chars": result.reasoning_chars},
                )
            else:
                yield await rec.finish(step, "Модель почала відповідати", {"first_token_ms": int((t_first - t0) * 1000)})
            streaming_step, frame = await rec.begin("response_streaming", "streaming", title)
            yield frame
        result.text += chunk.text
        if emit_deltas:
            yield rec.delta(chunk.text)
    if t_first is None:
        if finish_reason == "length":
            raise ProviderError("length", "Модель вичерпала ліміт токенів на міркування й не встигла відповісти. Спробуйте менше запитань або іншу модель")
        raise ProviderError("empty", "Модель повернула порожню відповідь")
    if finish_reason == "length":
        result.truncated = True
    meta: dict[str, Any] = {"completion_tokens": result.completion_tokens, "prompt_tokens": result.prompt_tokens}
    if result.truncated:
        meta["truncated"] = "відповідь обрізано лімітом токенів"
    assert streaming_step is not None
    yield await rec.finish(streaming_step, "Відповідь отримано", meta, event_type="response_completed")
    record_usage(db, user_id, rec.request_id, spec.id, result.prompt_tokens, result.completion_tokens)


_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


def parse_json(text: str) -> Any:
    """Parse a JSON object from model output that may be wrapped in a code fence or prose."""
    match = _FENCE.search(text)
    candidate = match.group(1) if match else text
    start, end = candidate.find("{"), candidate.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("Модель не повернула JSON")
    return json.loads(candidate[start : end + 1])
