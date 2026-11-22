from datetime import datetime, timezone
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, PlainSerializer, field_validator


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


UtcDatetime = Annotated[datetime, PlainSerializer(_iso, return_type=str)]
Effort = Literal["low", "medium", "high", "ultra"]
Space = Literal["study", "dev"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth ----------
class RegisterIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(ORM):
    id: str
    email: str
    name: str
    avatar_url: str | None
    has_password: bool = False
    google_linked: bool = False


class AuthStateOut(BaseModel):
    user: UserOut | None


class AuthConfigOut(BaseModel):
    google_enabled: bool


# ---------- subjects ----------
class SubjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)
    emoji: str | None = Field(default=None, max_length=16)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Назва не може бути порожньою")
        return v


class SubjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    emoji: str | None = Field(default=None, max_length=16)


class SubjectOut(ORM):
    id: str
    name: str
    description: str
    emoji: str
    emoji_source: str
    material_count: int = 0
    lab_count: int = 0
    labs_open: int = 0
    created_at: UtcDatetime
    updated_at: UtcDatetime


class EmojiSuggestIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)
    allow_ai: bool = False


class EmojiSuggestOut(BaseModel):
    emoji: str
    source: Literal["local", "ai", "fallback"]
    category: str | None
    alternatives: list[str]


# ---------- files ----------
class FileOut(ORM):
    id: str
    original_name: str
    mime: str
    size: int
    status: str
    error: str | None
    chunk_count: int
    subject_id: str | None
    project_id: str | None
    created_at: UtcDatetime


# ---------- labs ----------
class LabIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=8000)
    file_id: str | None = None


class LabPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=8000)
    status: Literal["todo", "in_progress", "done"] | None = None
    file_id: str | None = None


class LabAnalysis(BaseModel):
    execution_difficulty: int = Field(ge=1, le=10)
    theory_difficulty: int = Field(ge=1, le=10)
    defense_difficulty: int = Field(ge=1, le=10)
    estimated_hours: float = Field(ge=0, le=200)
    summary: str = ""
    required_knowledge: list[str] = []
    gaps: list[str] = []
    recommendations: list[str] = []
    defense_questions: list[str] = []


class LabOut(ORM):
    id: str
    subject_id: str
    title: str
    description: str
    status: str
    file_id: str | None
    analysis: dict[str, Any] | None
    analysis_request_id: str | None
    analyzed_at: UtcDatetime | None
    created_at: UtcDatetime


# ---------- projects ----------
class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class CategoryOut(ORM):
    id: str
    name: str
    position: int


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)
    stack: list[Annotated[str, Field(max_length=40)]] = Field(default_factory=list, max_length=20)
    category_id: str | None = None


class ProjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    stack: list[Annotated[str, Field(max_length=40)]] | None = None
    category_id: str | None = None


class ProjectOut(ORM):
    id: str
    name: str
    description: str
    stack: list[str]
    category_id: str | None
    file_count: int = 0
    session_count: int = 0
    created_at: UtcDatetime
    updated_at: UtcDatetime


class ActivityItem(BaseModel):
    kind: Literal["session", "file", "message"]
    title: str
    at: UtcDatetime
    ref_id: str


# ---------- chat ----------
class SessionIn(BaseModel):
    space: Space
    subject_id: str | None = None
    project_id: str | None = None
    title: str | None = Field(default=None, max_length=200)
    model: str | None = None
    effort: Effort = "medium"


class SessionPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    model: str | None = None
    effort: Effort | None = None
    pinned: bool | None = None


class SessionOut(ORM):
    id: str
    space: str
    subject_id: str | None
    project_id: str | None
    title: str
    model: str
    effort: str
    pinned: bool
    prompt_tokens: int
    completion_tokens: int
    created_at: UtcDatetime
    updated_at: UtcDatetime


class MessageOut(ORM):
    id: str
    role: str
    content: str
    status: str
    error: str | None
    model: str | None
    effort: str | None
    request_id: str | None
    prompt_tokens: int
    completion_tokens: int
    created_at: UtcDatetime


class SendMessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=40_000)
    file_ids: list[str] = Field(default_factory=list, max_length=10)


class EditMessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=40_000)


# ---------- AI events ----------
class AIEventOut(ORM):
    request_id: str
    event_id: str = Field(validation_alias="id")
    seq: int
    event_type: str
    stage: str
    status: str
    title: str
    description: str
    timestamp: UtcDatetime
    duration_ms: int | None
    metadata: dict[str, Any] = Field(validation_alias="meta")


class AIRequestOut(ORM):
    id: str
    kind: str
    status: str
    started_at: UtcDatetime
    finished_at: UtcDatetime | None
    duration_ms: int | None
    events: list[AIEventOut]


class ModelOut(BaseModel):
    id: str
    label: str
    provider: str
    capabilities: list[str]
    supports_streaming: bool
    supports_reasoning: bool
    efforts: list[Effort]
    context_window: int | None
    verified: bool
    note: str | None = None


class UsageOut(BaseModel):
    today_tokens: int
    daily_limit: int
    ai_configured: bool
    provider: str


# ---------- diagnostics ----------
class DiagnosticIn(BaseModel):
    subject_id: str | None = None
    topic: str = Field(min_length=1, max_length=200)
    question_count: int = Field(ge=3, le=20)
    format: Literal["choice", "open", "mixed"]
    difficulty: Literal["easy", "medium", "hard", "adaptive"]


class QuestionOut(ORM):
    id: str
    idx: int
    kind: str
    topic: str
    difficulty: str
    prompt: str
    options: list[str] | None
    user_answer: str | None
    score: float | None
    feedback: str | None
    grading_request_id: str | None
    # revealed only after answering
    correct_index: int | None = None
    explanation: str | None = None
    answered_at: UtcDatetime | None


class DiagnosticOut(ORM):
    id: str
    subject_id: str | None
    topic: str
    question_count: int
    format: str
    difficulty: str
    status: str
    score: float | None
    summary: dict[str, Any] | None
    request_id: str | None
    created_at: UtcDatetime
    questions: list[QuestionOut] = []


class AnswerIn(BaseModel):
    answer: str = Field(min_length=1, max_length=8000)


class DashboardOut(BaseModel):
    subjects: list[SubjectOut]
    recent_sessions: list[SessionOut]
    open_labs: list[LabOut]
    recent_diagnostics: list[DiagnosticOut]
