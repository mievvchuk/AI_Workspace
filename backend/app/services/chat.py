"""Chat orchestration: one streaming request = real, recorded steps."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator

from sqlalchemy import select

from ..config import get_settings
from ..db import SessionLocal, utcnow
from ..models import Chunk, ChatSession, Message, StoredFile
from ..schemas import MessageOut
from . import retrieval
from .ai.events import EventRecorder
from .ai.provider import ProviderError
from .ai.runner import Cancelled, ModelResult, pick_model, stream_model
from .context import build_messages, load_history, material_block, scope_of
from .usage import UsageLimitExceeded, ensure_within_limit

log = logging.getLogger(__name__)
ATTACHMENT_CHUNKS = 6


async def run_chat(user_id: str, session_id: str, file_ids: list[str]) -> AsyncIterator[str]:
    """Generate an assistant reply for the latest user message of ``session_id``."""
    async with SessionLocal() as db:
        session = await db.get(ChatSession, session_id)
        assert session is not None and session.user_id == user_id
        rec = await EventRecorder.start(db, user_id, "chat")
        spec = pick_model(session.model, get_settings().default_model)
        assistant = Message(
            session_id=session.id, role="assistant", status="streaming", model=spec.id, effort=session.effort, request_id=rec.request_id
        )
        db.add(assistant)
        await db.commit()
        yield rec.frame("start", {"message_id": assistant.id})
        yield await rec.emit("request_started", "request", "completed", "Отримано запит", metadata={"model": spec.label})

        result = ModelResult()
        try:
            await ensure_within_limit(db, user_id)

            step, frame = await rec.begin("context_preparation", "context", "Підготовка контексту")
            yield frame
            scope, subject, project = await scope_of(db, session)
            history = await load_history(db, session.id)
            meta: dict = {"history_messages": len(history)}
            if subject:
                meta["subject"] = subject.name
            if project:
                meta["project"] = project.name
            yield await rec.finish(step, scope.split(".")[0] if scope else "Загальна сесія без прив'язки", meta)

            hits: list[retrieval.Hit] = []
            if subject or project:
                step, frame = await rec.begin("document_search", "search", "Пошук у матеріалах")
                yield frame
                query = history[-1].content if history else ""
                hits, searched = await retrieval.search(
                    db, user_id, query, subject_id=session.subject_id, project_id=session.project_id
                )
                if not searched:
                    desc = "Готових до пошуку матеріалів ще немає"
                elif hits:
                    desc = f"Знайдено фрагментів: {len(hits)}"
                else:
                    desc = f"Переглянуто документів: {searched}, релевантних фрагментів немає"
                yield await rec.finish(
                    step, desc, {"documents": searched, "fragments": len(hits), "sources": sorted({h.file_name for h in hits})}
                )

            attachments: list[tuple[str, str]] = []
            if file_ids:
                step, frame = await rec.begin("document_processing", "attachments", "Опрацювання вкладень")
                yield frame
                files = (
                    await db.scalars(select(StoredFile).where(StoredFile.id.in_(file_ids), StoredFile.user_id == user_id))
                ).all()
                for f in files:
                    if f.status != "ready":
                        continue
                    chunks = (
                        await db.scalars(select(Chunk).where(Chunk.file_id == f.id).order_by(Chunk.idx).limit(ATTACHMENT_CHUNKS))
                    ).all()
                    attachments.append((f.original_name, "\n\n".join(c.text for c in chunks)))
                skipped = len(files) - len(attachments)
                yield await rec.finish(
                    step,
                    f"Додано файлів: {len(attachments)}" + (f", ще не оброблено: {skipped}" if skipped else ""),
                    {"files": [n for n, _ in attachments]},
                )

            messages = build_messages(scope, history, material_block(hits, attachments))
            async for frame in stream_model(rec, db, user_id, spec, session.effort, messages, result, emit_deltas=True):
                yield frame

            step, frame = await rec.begin("result_saving", "save", "Збереження результату")
            yield frame
            assistant.content = result.text
            assistant.status = "complete"
            assistant.effort = result.effort
            assistant.prompt_tokens = result.prompt_tokens
            assistant.completion_tokens = result.completion_tokens
            session.prompt_tokens += result.prompt_tokens
            session.completion_tokens += result.completion_tokens
            session.updated_at = utcnow()
            await db.commit()
            yield await rec.finish(step, "Відповідь збережено")
            yield await rec.close("completed", "Готово")
            yield rec.frame("message", {"message": MessageOut.model_validate(assistant).model_dump(mode="json")})
        except asyncio.CancelledError:
            # client disconnected: we can no longer yield, but the log and partial answer are kept
            await asyncio.shield(_on_disconnect(rec, assistant, result))
            raise
        except Cancelled:
            await _finalize(rec, assistant, result, "cancelled", "Генерацію зупинено")
            yield await rec.close("cancelled", "Запит скасовано")
            yield rec.frame("message", {"message": MessageOut.model_validate(assistant).model_dump(mode="json")})
        except (ProviderError, UsageLimitExceeded) as exc:
            message = exc.message if isinstance(exc, ProviderError) else str(exc)
            await _finalize(rec, assistant, result, "error", message)
            yield await rec.close("failed", "Помилка", message, {"code": getattr(exc, "code", "usage_limit")})
            yield rec.frame("message", {"message": MessageOut.model_validate(assistant).model_dump(mode="json")})
        except Exception:
            log.exception("chat request %s failed", rec.request_id)
            await _finalize(rec, assistant, result, "error", "Внутрішня помилка сервера")
            yield await rec.close("failed", "Помилка", "Внутрішня помилка сервера")
            yield rec.frame("message", {"message": MessageOut.model_validate(assistant).model_dump(mode="json")})


async def _finalize(rec: EventRecorder, assistant: Message, result: ModelResult, status: str, error: str) -> None:
    """Keep the partial answer; record why it stopped."""
    assistant.content = result.text
    assistant.status = status
    assistant.error = error
    await rec.db.commit()


async def _on_disconnect(rec: EventRecorder, assistant: Message, result: ModelResult) -> None:
    await _finalize(rec, assistant, result, "cancelled", "З'єднання перервано")
    if rec.request.status == "running":
        await rec.close("cancelled", "З'єднання з клієнтом перервано")
