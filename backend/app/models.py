from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, utcnow


def new_id() -> str:
    return uuid.uuid4().hex


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str | None] = mapped_column(String(200))
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500))


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    user: Mapped[User] = relationship(lazy="joined")


class Subject(TimestampMixin, Base):
    __tablename__ = "subjects"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    emoji: Mapped[str] = mapped_column(String(16))
    emoji_source: Mapped[str] = mapped_column(String(16), default="local")
    position: Mapped[int] = mapped_column(Integer, default=0)


class DevCategory(TimestampMixin, Base):
    __tablename__ = "dev_categories"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer, default=0)


class Project(TimestampMixin, Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[str | None] = mapped_column(ForeignKey("dev_categories.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    stack: Mapped[list[str]] = mapped_column(JSON, default=list)


class StoredFile(Base):
    __tablename__ = "files"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    subject_id: Mapped[str | None] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    original_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(80))
    mime: Mapped[str] = mapped_column(String(120))
    size: Mapped[int] = mapped_column(Integer)
    # uploaded -> parsing -> indexing -> ready | failed
    status: Mapped[str] = mapped_column(String(16), default="uploaded")
    error: Mapped[str | None] = mapped_column(String(300))
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Chunk(Base):
    __tablename__ = "chunks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_id: Mapped[str] = mapped_column(ForeignKey("files.id", ondelete="CASCADE"), index=True)
    idx: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)


class Lab(TimestampMixin, Base):
    __tablename__ = "labs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    subject_id: Mapped[str] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="todo")  # todo | in_progress | done
    file_id: Mapped[str | None] = mapped_column(ForeignKey("files.id", ondelete="SET NULL"))
    analysis: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    analysis_request_id: Mapped[str | None] = mapped_column(String(32))
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ChatSession(TimestampMixin, Base):
    __tablename__ = "chat_sessions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    space: Mapped[str] = mapped_column(String(8))  # study | dev
    subject_id: Mapped[str | None] = mapped_column(ForeignKey("subjects.id", ondelete="SET NULL"))
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(200), default="Нова сесія")
    model: Mapped[str] = mapped_column(String(120))
    effort: Mapped[str] = mapped_column(String(8), default="medium")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(12))  # user | assistant
    content: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(12), default="complete")  # streaming | complete | error | cancelled
    error: Mapped[str | None] = mapped_column(String(300))
    model: Mapped[str | None] = mapped_column(String(120))
    effort: Mapped[str | None] = mapped_column(String(8))
    request_id: Mapped[str | None] = mapped_column(String(32), index=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AIRequest(Base):
    __tablename__ = "ai_requests"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(12), default="running")  # running | completed | failed | cancelled
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    events: Mapped[list[AIEvent]] = relationship(order_by="AIEvent.seq", cascade="all, delete-orphan")


class AIEvent(Base):
    __tablename__ = "ai_events"
    __table_args__ = (UniqueConstraint("request_id", "seq"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    request_id: Mapped[str] = mapped_column(ForeignKey("ai_requests.id", ondelete="CASCADE"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(32))
    stage: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(12))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(String(500), default="")
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    meta: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)


class UsageRecord(Base):
    __tablename__ = "usage_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    request_id: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(String(120))
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Diagnostic(TimestampMixin, Base):
    __tablename__ = "diagnostics"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    subject_id: Mapped[str | None] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    topic: Mapped[str] = mapped_column(String(200))
    question_count: Mapped[int] = mapped_column(Integer)
    format: Mapped[str] = mapped_column(String(12))  # choice | open | mixed
    difficulty: Mapped[str] = mapped_column(String(12))  # easy | medium | hard | adaptive
    status: Mapped[str] = mapped_column(String(12), default="generating")  # generating | active | completed | failed
    score: Mapped[float | None] = mapped_column(Float)
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    request_id: Mapped[str | None] = mapped_column(String(32))
    questions: Mapped[list[DiagnosticQuestion]] = relationship(
        order_by="DiagnosticQuestion.idx", cascade="all, delete-orphan", lazy="selectin"
    )


class DiagnosticQuestion(Base):
    __tablename__ = "diagnostic_questions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    diagnostic_id: Mapped[str] = mapped_column(ForeignKey("diagnostics.id", ondelete="CASCADE"), index=True)
    idx: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(8))  # choice | open
    topic: Mapped[str] = mapped_column(String(160), default="")
    difficulty: Mapped[str] = mapped_column(String(12), default="medium")
    prompt: Mapped[str] = mapped_column(Text)
    options: Mapped[list[str] | None] = mapped_column(JSON)
    correct_index: Mapped[int | None] = mapped_column(Integer)
    criteria: Mapped[str] = mapped_column(Text, default="")
    explanation: Mapped[str] = mapped_column(Text, default="")
    user_answer: Mapped[str | None] = mapped_column(Text)
    score: Mapped[float | None] = mapped_column(Float)
    feedback: Mapped[str | None] = mapped_column(Text)
    grading_request_id: Mapped[str | None] = mapped_column(String(32))
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
