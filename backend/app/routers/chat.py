from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db, utcnow
from ..models import ChatSession, Message, Project, StoredFile, Subject, User
from ..schemas import (
    AIRequestOut,
    EditMessageIn,
    MessageOut,
    ModelOut,
    SendMessageIn,
    SessionIn,
    SessionOut,
    SessionPatch,
    UsageOut,
)
from ..security import ai_rate_limit, current_user
from ..services.ai.events import load_request, request_cancel
from ..services.ai.provider import get_provider
from ..services.ai.registry import MODELS, get_model, resolve_effort
from ..services.chat import run_chat
from ..services.usage import tokens_today
from .common import get_owned, require_ai_configured, sse_response

router = APIRouter(prefix="/api", tags=["chat"])


@router.get("/models", response_model=list[ModelOut])
async def list_models(_: User = Depends(current_user)) -> list[ModelOut]:
    return [
        ModelOut(
            id=m.id,
            label=m.label,
            provider=m.provider,
            capabilities=list(m.capabilities),
            supports_streaming=m.supports_streaming,
            supports_reasoning=m.supports_reasoning,
            efforts=m.efforts,
            context_window=m.context_window,
            verified=m.verified,
            note=m.note,
        )
        for m in MODELS
    ]


@router.get("/usage", response_model=UsageOut)
async def usage(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> UsageOut:
    settings = get_settings()
    return UsageOut(
        today_tokens=await tokens_today(db, user.id),
        daily_limit=settings.user_daily_token_limit,
        ai_configured=settings.ai_configured,
        provider=get_provider().name if settings.ai_configured else "none",
    )


# ---------------- sessions ----------------


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    space: str | None = None,
    subject_id: str | None = None,
    project_id: str | None = None,
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=100, le=300),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ChatSession]:
    stmt = select(ChatSession).where(ChatSession.user_id == user.id)
    if space:
        stmt = stmt.where(ChatSession.space == space)
    if subject_id:
        stmt = stmt.where(ChatSession.subject_id == subject_id)
    if project_id:
        stmt = stmt.where(ChatSession.project_id == project_id)
    if q:
        like = f"%{q}%"
        matching = select(Message.session_id).where(Message.content.ilike(like))
        stmt = stmt.where(or_(ChatSession.title.ilike(like), ChatSession.id.in_(matching)))
    stmt = stmt.order_by(ChatSession.pinned.desc(), ChatSession.updated_at.desc()).limit(limit)
    return list((await db.scalars(stmt)).all())


def _validated_model_effort(model_id: str | None, effort: str) -> tuple[str, str]:
    spec = get_model(model_id or get_settings().default_model)
    if spec is None:
        raise HTTPException(422, "Невідома модель")
    used, _ = resolve_effort(spec, effort)
    return spec.id, used


@router.post("/sessions", response_model=SessionOut, status_code=201)
async def create_session(body: SessionIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> ChatSession:
    if body.subject_id:
        await get_owned(db, Subject, body.subject_id, user.id, "Предмет")
    if body.project_id:
        await get_owned(db, Project, body.project_id, user.id, "Проєкт")
    model, effort = _validated_model_effort(body.model, body.effort)
    session = ChatSession(
        user_id=user.id, space=body.space, subject_id=body.subject_id, project_id=body.project_id,
        title=(body.title or "Нова сесія").strip(), model=model, effort=effort,
    )
    db.add(session)
    await db.commit()
    return session


@router.get("/sessions/{session_id}", response_model=SessionOut)
async def get_session(session_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> ChatSession:
    return await get_owned(db, ChatSession, session_id, user.id, "Сесію")


@router.patch("/sessions/{session_id}", response_model=SessionOut)
async def update_session(session_id: str, body: SessionPatch, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> ChatSession:
    session = await get_owned(db, ChatSession, session_id, user.id, "Сесію")
    if body.title is not None:
        session.title = body.title.strip()
    if body.pinned is not None:
        session.pinned = body.pinned
    if body.model is not None or body.effort is not None:
        session.model, session.effort = _validated_model_effort(body.model or session.model, body.effort or session.effort)
    await db.commit()
    return session


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> None:
    await db.delete(await get_owned(db, ChatSession, session_id, user.id, "Сесію"))
    await db.commit()


@router.get("/sessions/{session_id}/messages", response_model=list[MessageOut])
async def list_messages(session_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> list[Message]:
    await get_owned(db, ChatSession, session_id, user.id, "Сесію")
    return list((await db.scalars(select(Message).where(Message.session_id == session_id).order_by(Message.created_at))).all())


async def _ensure_idle(db: AsyncSession, session_id: str) -> None:
    busy = await db.scalar(select(Message.id).where(Message.session_id == session_id, Message.status == "streaming"))
    if busy:
        raise HTTPException(status.HTTP_409_CONFLICT, "У цій сесії вже генерується відповідь")


@router.post("/sessions/{session_id}/messages")
async def send_message(session_id: str, body: SendMessageIn, user: User = Depends(ai_rate_limit), db: AsyncSession = Depends(get_db)):
    require_ai_configured(get_settings())
    session = await get_owned(db, ChatSession, session_id, user.id, "Сесію")
    await _ensure_idle(db, session.id)
    for file_id in body.file_ids:
        await get_owned(db, StoredFile, file_id, user.id, "Файл")
    content = body.content.strip()
    if not content:
        raise HTTPException(422, "Повідомлення порожнє")
    db.add(Message(session_id=session.id, role="user", content=content))
    if session.title == "Нова сесія":
        session.title = content.splitlines()[0][:60]
    session.updated_at = utcnow()
    await db.commit()
    return sse_response(run_chat(user.id, session.id, body.file_ids))


@router.post("/sessions/{session_id}/regenerate")
async def regenerate(session_id: str, user: User = Depends(ai_rate_limit), db: AsyncSession = Depends(get_db)):
    """Replace the last assistant reply with a new one."""
    require_ai_configured(get_settings())
    session = await get_owned(db, ChatSession, session_id, user.id, "Сесію")
    await _ensure_idle(db, session.id)
    last = await db.scalar(select(Message).where(Message.session_id == session.id).order_by(Message.created_at.desc()).limit(1))
    if last is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Немає що генерувати повторно")
    if last.role == "assistant":
        await db.delete(last)
        await db.commit()
    return sse_response(run_chat(user.id, session.id, []))


@router.post("/messages/{message_id}/edit")
async def edit_message(message_id: str, body: EditMessageIn, user: User = Depends(ai_rate_limit), db: AsyncSession = Depends(get_db)):
    """Edit a user message, drop everything after it and regenerate."""
    require_ai_configured(get_settings())
    message = await db.get(Message, message_id)
    session = await get_owned(db, ChatSession, message.session_id if message else None, user.id, "Повідомлення")
    assert message is not None
    if message.role != "user":
        raise HTTPException(422, "Редагувати можна лише власні повідомлення")
    await _ensure_idle(db, session.id)
    message.content = body.content.strip()
    await db.execute(delete(Message).where(Message.session_id == session.id, Message.created_at > message.created_at))
    await db.commit()
    return sse_response(run_chat(user.id, session.id, []))


# ---------------- AI requests ----------------


@router.post("/requests/{request_id}/cancel", status_code=202)
async def cancel_request(request_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict[str, bool]:
    request = await load_request(db, request_id, user.id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Запит не знайдено")
    return {"cancelled": request_cancel(request_id)}


@router.get("/requests/{request_id}", response_model=AIRequestOut)
async def get_request(request_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    request = await load_request(db, request_id, user.id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Журнал не знайдено або видалено за терміном зберігання")
    return request
