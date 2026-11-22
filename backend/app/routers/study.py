import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..models import ChatSession, Diagnostic, Lab, StoredFile, Subject, User
from ..schemas import (
    DashboardOut,
    DiagnosticOut,
    EmojiSuggestIn,
    EmojiSuggestOut,
    FileOut,
    LabIn,
    LabOut,
    LabPatch,
    SessionOut,
    SubjectIn,
    SubjectOut,
    SubjectPatch,
)
from ..security import ai_rate_limit, current_user
from ..services import emoji as emoji_service
from ..services.ai.provider import ProviderError, get_provider
from ..services.ai.registry import get_model
from ..services.files import remove_file, schedule_processing, store_upload
from ..services.lab_analysis import analyze_lab
from .common import get_owned, require_ai_configured, sse_response

router = APIRouter(prefix="/api", tags=["study"])


# ---------------- subjects ----------------


async def _subject_counts(db: AsyncSession, user_id: str) -> dict[str, tuple[int, int, int]]:
    files = dict(
        (await db.execute(select(StoredFile.subject_id, func.count()).where(StoredFile.user_id == user_id).group_by(StoredFile.subject_id))).all()
    )
    labs = dict((await db.execute(select(Lab.subject_id, func.count()).where(Lab.user_id == user_id).group_by(Lab.subject_id))).all())
    open_labs = dict(
        (await db.execute(select(Lab.subject_id, func.count()).where(Lab.user_id == user_id, Lab.status != "done").group_by(Lab.subject_id))).all()
    )
    keys = set(files) | set(labs)
    return {k: (files.get(k, 0), labs.get(k, 0), open_labs.get(k, 0)) for k in keys if k}


def _subject_out(subject: Subject, counts: dict[str, tuple[int, int, int]]) -> SubjectOut:
    out = SubjectOut.model_validate(subject)
    out.material_count, out.lab_count, out.labs_open = counts.get(subject.id, (0, 0, 0))
    return out


async def _list_subjects(db: AsyncSession, user_id: str) -> list[SubjectOut]:
    subjects = (await db.scalars(select(Subject).where(Subject.user_id == user_id).order_by(Subject.position, Subject.created_at))).all()
    counts = await _subject_counts(db, user_id)
    return [_subject_out(s, counts) for s in subjects]


@router.get("/subjects", response_model=list[SubjectOut])
async def list_subjects(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> list[SubjectOut]:
    return await _list_subjects(db, user.id)


async def _ai_emoji(name: str, description: str) -> str | None:
    """Optional AI fallback: one small, time-boxed call, only when saving."""
    settings = get_settings()
    if not settings.ai_configured or get_model(settings.default_model) is None:
        return None
    allowed = " ".join(emoji_service.ALLOWED_AI_EMOJI)
    messages = [
        {"role": "system", "content": f'Обери одне емодзі для навчального предмета. Поверни ЛИШЕ JSON-об’єкт {{"emoji": "…"}} без обгортки [schema=emoji]. Дозволені: {allowed}'},
        {"role": "user", "content": f"Назва: {name}\nОпис: {description[:300]}"},
    ]
    text = ""

    async def collect() -> None:
        nonlocal text
        async for chunk in get_provider().stream_chat(settings.default_model, messages, {"max_tokens": 20, "temperature": 0}):
            if chunk.kind == "text":
                text += chunk.text

    try:
        await asyncio.wait_for(collect(), timeout=8)
    except (ProviderError, asyncio.TimeoutError):
        return None
    return emoji_service.parse_ai_emoji(text)


async def suggest(name: str, description: str, allow_ai: bool) -> EmojiSuggestOut:
    local = emoji_service.suggest_local(name, description)
    if local:
        return EmojiSuggestOut(emoji=local.emoji, source="local", category=local.category, alternatives=local.alternatives)
    if allow_ai and (ai := await _ai_emoji(name, description)):
        return EmojiSuggestOut(emoji=ai, source="ai", category=None, alternatives=[emoji_service.FALLBACK_EMOJI])
    fb = emoji_service.fallback()
    return EmojiSuggestOut(emoji=fb.emoji, source="fallback", category=None, alternatives=fb.alternatives)


@router.post("/emoji/suggest", response_model=EmojiSuggestOut)
async def suggest_emoji(body: EmojiSuggestIn, user: User = Depends(current_user)) -> EmojiSuggestOut:
    # Preview requests are local-only; AI is allowed only when explicitly asked (e.g. on save).
    return await suggest(body.name, body.description, body.allow_ai)


@router.post("/subjects", response_model=SubjectOut, status_code=201)
async def create_subject(body: SubjectIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> SubjectOut:
    if body.emoji:
        emoji, source = body.emoji, "manual"
    else:
        s = await suggest(body.name, body.description, allow_ai=True)
        emoji, source = s.emoji, s.source
    position = (await db.scalar(select(func.coalesce(func.max(Subject.position), -1)).where(Subject.user_id == user.id))) + 1
    subject = Subject(user_id=user.id, name=body.name, description=body.description.strip(), emoji=emoji, emoji_source=source, position=position)
    db.add(subject)
    await db.commit()
    return _subject_out(subject, {})


@router.get("/subjects/{subject_id}", response_model=SubjectOut)
async def get_subject(subject_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> SubjectOut:
    subject = await get_owned(db, Subject, subject_id, user.id, "Предмет")
    return _subject_out(subject, await _subject_counts(db, user.id))


@router.patch("/subjects/{subject_id}", response_model=SubjectOut)
async def update_subject(subject_id: str, body: SubjectPatch, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> SubjectOut:
    subject = await get_owned(db, Subject, subject_id, user.id, "Предмет")
    if body.name is not None:
        subject.name = body.name.strip()
    if body.description is not None:
        subject.description = body.description.strip()
    if body.emoji is not None:
        subject.emoji, subject.emoji_source = body.emoji, "manual"
    await db.commit()
    return _subject_out(subject, await _subject_counts(db, user.id))


@router.delete("/subjects/{subject_id}", status_code=204)
async def delete_subject(subject_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> None:
    subject = await get_owned(db, Subject, subject_id, user.id, "Предмет")
    files = (await db.scalars(select(StoredFile).where(StoredFile.subject_id == subject.id))).all()
    for f in files:
        await remove_file(db, f)
    await db.delete(subject)
    await db.commit()


# ---------------- files ----------------


@router.get("/subjects/{subject_id}/files", response_model=list[FileOut])
async def list_subject_files(subject_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> list[StoredFile]:
    await get_owned(db, Subject, subject_id, user.id, "Предмет")
    return list((await db.scalars(select(StoredFile).where(StoredFile.subject_id == subject_id).order_by(StoredFile.created_at.desc()))).all())


@router.post("/subjects/{subject_id}/files", response_model=FileOut, status_code=201)
async def upload_subject_file(
    subject_id: str, background: BackgroundTasks, file: UploadFile = File(...), user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> StoredFile:
    await get_owned(db, Subject, subject_id, user.id, "Предмет")
    record = await store_upload(db, user.id, file, subject_id=subject_id)
    await schedule_processing(background, db, record)
    return record


@router.post("/files", response_model=FileOut, status_code=201)
async def upload_loose_file(background: BackgroundTasks, file: UploadFile = File(...), user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> StoredFile:
    """Chat attachments not bound to a subject/project."""
    record = await store_upload(db, user.id, file)
    await schedule_processing(background, db, record)
    return record


@router.get("/files/{file_id}", response_model=FileOut)
async def get_file(file_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> StoredFile:
    return await get_owned(db, StoredFile, file_id, user.id, "Файл")


@router.delete("/files/{file_id}", status_code=204)
async def delete_file(file_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> None:
    await remove_file(db, await get_owned(db, StoredFile, file_id, user.id, "Файл"))


# ---------------- labs ----------------


@router.get("/subjects/{subject_id}/labs", response_model=list[LabOut])
async def list_labs(subject_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> list[Lab]:
    await get_owned(db, Subject, subject_id, user.id, "Предмет")
    return list((await db.scalars(select(Lab).where(Lab.subject_id == subject_id).order_by(Lab.created_at))).all())


async def _check_file(db: AsyncSession, file_id: str | None, user_id: str) -> None:
    if file_id:
        await get_owned(db, StoredFile, file_id, user_id, "Файл")


@router.post("/subjects/{subject_id}/labs", response_model=LabOut, status_code=201)
async def create_lab(subject_id: str, body: LabIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> Lab:
    await get_owned(db, Subject, subject_id, user.id, "Предмет")
    await _check_file(db, body.file_id, user.id)
    lab = Lab(user_id=user.id, subject_id=subject_id, title=body.title.strip(), description=body.description, file_id=body.file_id)
    db.add(lab)
    await db.commit()
    return lab


@router.patch("/labs/{lab_id}", response_model=LabOut)
async def update_lab(lab_id: str, body: LabPatch, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> Lab:
    lab = await get_owned(db, Lab, lab_id, user.id, "Лабораторну")
    data = body.model_dump(exclude_unset=True)
    if "file_id" in data:
        await _check_file(db, data["file_id"], user.id)
    for key, value in data.items():
        setattr(lab, key, value)
    await db.commit()
    return lab


@router.delete("/labs/{lab_id}", status_code=204)
async def delete_lab(lab_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> None:
    await db.delete(await get_owned(db, Lab, lab_id, user.id, "Лабораторну"))
    await db.commit()


@router.post("/labs/{lab_id}/analyze")
async def analyze(lab_id: str, user: User = Depends(ai_rate_limit), db: AsyncSession = Depends(get_db)):
    require_ai_configured(get_settings())
    await get_owned(db, Lab, lab_id, user.id, "Лабораторну")
    return sse_response(analyze_lab(user.id, lab_id))


# ---------------- dashboard ----------------


@router.get("/study/dashboard", response_model=DashboardOut)
async def dashboard(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> DashboardOut:
    sessions = (
        await db.scalars(select(ChatSession).where(ChatSession.user_id == user.id, ChatSession.space == "study").order_by(ChatSession.updated_at.desc()).limit(6))
    ).all()
    labs = (await db.scalars(select(Lab).where(Lab.user_id == user.id, Lab.status != "done").order_by(Lab.updated_at.desc()).limit(6))).all()
    diags = (
        await db.scalars(select(Diagnostic).where(Diagnostic.user_id == user.id, Diagnostic.status == "completed").order_by(Diagnostic.updated_at.desc()).limit(4))
    ).all()
    return DashboardOut(
        subjects=await _list_subjects(db, user.id),
        recent_sessions=[SessionOut.model_validate(s) for s in sessions],
        open_labs=[LabOut.model_validate(lab) for lab in labs],
        recent_diagnostics=[DiagnosticOut.model_validate(d).model_copy(update={"questions": []}) for d in diags],
    )
