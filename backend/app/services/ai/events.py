"""AI Event Service: records real execution steps and turns them into SSE frames.

Every frame carries ``request_id`` and a strictly increasing ``seq`` so the client can drop
duplicates, late and out-of-order frames. Events are persisted (bounded) so the processing log
can be reopened after reload. Only safe metadata is stored: no prompts, keys or provider internals.
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db import utcnow
from ...models import AIEvent, AIRequest, new_id

MAX_META_STR = 200
MAX_META_ITEMS = 12

EVENT_TYPES = {
    "request_started",
    "context_preparation",
    "document_search",
    "document_processing",
    "tool_started",
    "tool_completed",
    "tool_failed",
    "model_request_started",
    "model_reasoning",
    "response_streaming",
    "response_completed",
    "result_saving",
    "request_completed",
    "request_failed",
    "request_cancelled",
}


def _safe_meta(meta: dict[str, Any] | None) -> dict[str, Any]:
    if not meta:
        return {}
    out: dict[str, Any] = {}
    for key, value in list(meta.items())[:MAX_META_ITEMS]:
        if isinstance(value, str):
            out[key] = value[:MAX_META_STR]
        elif isinstance(value, (int, float, bool)) or value is None:
            out[key] = value
        elif isinstance(value, (list, tuple)):
            out[key] = [str(v)[:MAX_META_STR] for v in value[:MAX_META_ITEMS]]
        else:
            out[key] = str(value)[:MAX_META_STR]
    return out


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# Active requests that can be cancelled by id.
_cancel_flags: dict[str, asyncio.Event] = {}


def request_cancel(request_id: str) -> bool:
    flag = _cancel_flags.get(request_id)
    if flag is None:
        return False
    flag.set()
    return True


@dataclass
class Step:
    stage: str
    event_type: str
    title: str
    started: float


class EventRecorder:
    def __init__(self, db: AsyncSession, request: AIRequest) -> None:
        self.db = db
        self.request = request
        self.request_id = request.id
        self._seq = 0
        self._t0 = time.monotonic()
        self.cancel_flag = asyncio.Event()
        _cancel_flags[request.id] = self.cancel_flag

    @classmethod
    async def start(cls, db: AsyncSession, user_id: str, kind: str) -> EventRecorder:
        request = AIRequest(id=new_id(), user_id=user_id, kind=kind)
        db.add(request)
        await db.commit()
        return cls(db, request)

    @property
    def cancelled(self) -> bool:
        return self.cancel_flag.is_set()

    def next_seq(self) -> int:
        self._seq += 1
        return self._seq

    async def emit(
        self,
        event_type: str,
        stage: str,
        status: str,
        title: str,
        description: str = "",
        duration_ms: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        assert event_type in EVENT_TYPES, event_type
        event = AIEvent(
            id=new_id(),
            request_id=self.request_id,
            seq=self.next_seq(),
            event_type=event_type,
            stage=stage,
            status=status,
            title=title[:200],
            description=description[:500],
            timestamp=utcnow(),
            duration_ms=duration_ms,
            meta=_safe_meta(metadata),
        )
        self.db.add(event)
        await self.db.commit()
        return sse("ai", serialize_event(event))

    async def begin(self, event_type: str, stage: str, title: str, description: str = "", metadata: dict[str, Any] | None = None) -> tuple[Step, str]:
        step = Step(stage, event_type, title, time.monotonic())
        return step, await self.emit(event_type, stage, "running", title, description, metadata=metadata)

    async def finish(
        self,
        step: Step,
        description: str = "",
        metadata: dict[str, Any] | None = None,
        *,
        status: str = "completed",
        title: str | None = None,
        event_type: str | None = None,
    ) -> str:
        ms = int((time.monotonic() - step.started) * 1000)
        return await self.emit(event_type or step.event_type, step.stage, status, title or step.title, description, ms, metadata)

    def delta(self, text: str) -> str:
        return sse("delta", {"request_id": self.request_id, "seq": self.next_seq(), "text": text})

    def frame(self, event: str, data: dict[str, Any]) -> str:
        return sse(event, {"request_id": self.request_id, "seq": self.next_seq(), **data})

    async def close(self, status: str, title: str, description: str = "", metadata: dict[str, Any] | None = None) -> str:
        """Emit the terminal event and finalize the request. Safe to call once."""
        _cancel_flags.pop(self.request_id, None)
        event_type = {"completed": "request_completed", "failed": "request_failed", "cancelled": "request_cancelled"}[status]
        ms = int((time.monotonic() - self._t0) * 1000)
        frame = await self.emit(event_type, "request", status, title, description, ms, metadata)
        self.request.status = status
        self.request.finished_at = utcnow()
        self.request.duration_ms = ms
        await self.db.commit()
        return frame


def serialize_event(event: AIEvent) -> dict[str, Any]:
    ts = event.timestamp
    return {
        "request_id": event.request_id,
        "event_id": event.id,
        "seq": event.seq,
        "event_type": event.event_type,
        "stage": event.stage,
        "status": event.status,
        "title": event.title,
        "description": event.description,
        "timestamp": ts.isoformat() if ts.tzinfo else ts.isoformat() + "+00:00",
        "duration_ms": event.duration_ms,
        "metadata": event.meta or {},
    }


async def load_request(db: AsyncSession, request_id: str, user_id: str) -> AIRequest | None:
    from sqlalchemy.orm import selectinload

    return await db.scalar(
        select(AIRequest)
        .where(AIRequest.id == request_id, AIRequest.user_id == user_id)
        .options(selectinload(AIRequest.events))
    )


async def purge_old_events(db: AsyncSession, days: int) -> None:
    await db.execute(delete(AIRequest).where(AIRequest.started_at < utcnow() - timedelta(days=days)))
    # Requests left "running" by a crash/restart can never finish; mark them failed.
    running = (await db.scalars(select(AIRequest).where(AIRequest.status == "running"))).all()
    for req in running:
        req.status = "failed"
        req.finished_at = utcnow()
    await db.commit()
