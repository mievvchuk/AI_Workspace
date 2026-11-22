from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..models import Diagnostic, DiagnosticQuestion, Subject, User
from ..schemas import AnswerIn, DiagnosticIn, DiagnosticOut, QuestionOut
from ..security import ai_rate_limit, current_user
from ..services import assessment
from ..services.ai.events import load_request
from .common import get_owned, require_ai_configured, sse_response

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])


def question_out(q: DiagnosticQuestion) -> QuestionOut:
    out = QuestionOut.model_validate(q)
    if q.answered_at is None:  # never leak the answer key before the user answers
        out.correct_index = None
        out.explanation = None
    return out


def diagnostic_out(d: Diagnostic) -> DiagnosticOut:
    out = DiagnosticOut.model_validate(d)
    out.questions = [question_out(q) for q in d.questions]
    return out


@router.get("", response_model=list[DiagnosticOut])
async def list_diagnostics(subject_id: str | None = None, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> list[DiagnosticOut]:
    stmt = select(Diagnostic).where(Diagnostic.user_id == user.id)
    if subject_id:
        stmt = stmt.where(Diagnostic.subject_id == subject_id)
    rows = (await db.scalars(stmt.order_by(Diagnostic.created_at.desc()).limit(50))).all()
    return [diagnostic_out(d).model_copy(update={"questions": []}) for d in rows]


@router.post("")
async def create_diagnostic(body: DiagnosticIn, user: User = Depends(ai_rate_limit), db: AsyncSession = Depends(get_db)):
    require_ai_configured(get_settings())
    if body.subject_id:
        await get_owned(db, Subject, body.subject_id, user.id, "РџСЂРµРґРјРµС‚")
    diag = Diagnostic(user_id=user.id, **body.model_dump())
    db.add(diag)
    await db.commit()
    return sse_response(assessment.generate(user.id, diag.id))


@router.get("/{diagnostic_id}", response_model=DiagnosticOut)
async def get_diagnostic(diagnostic_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> DiagnosticOut:
    return diagnostic_out(await get_owned(db, Diagnostic, diagnostic_id, user.id, "Р”С–Р°РіРЅРѕСЃС‚РёРєСѓ"))


@router.delete("/{diagnostic_id}", status_code=204)
async def delete_diagnostic(diagnostic_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> None:
    await db.delete(await get_owned(db, Diagnostic, diagnostic_id, user.id, "Р”С–Р°РіРЅРѕСЃС‚РёРєСѓ"))
    await db.commit()


async def _question(db: AsyncSession, diagnostic_id: str, question_id: str, user_id: str) -> DiagnosticQuestion:
    diag = await get_owned(db, Diagnostic, diagnostic_id, user_id, "Р”С–Р°РіРЅРѕСЃС‚РёРєСѓ")
    if diag.status != "active":
        raise HTTPException(status.HTTP_409_CONFLICT, "Р”С–Р°РіРЅРѕСЃС‚РёРєР° РЅРµ Р°РєС‚РёРІРЅР°")
    q = next((q for q in diag.questions if q.id == question_id), None)
    if q is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Р—Р°РїРёС‚Р°РЅРЅСЏ РЅРµ Р·РЅР°Р№РґРµРЅРѕ")
    if q.answered_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "РќР° С†Рµ Р·Р°РїРёС‚Р°РЅРЅСЏ РІР¶Рµ РІС–РґРїРѕРІС–Р»Рё")
    return q


@router.post("/{diagnostic_id}/questions/{question_id}/answer", response_model=QuestionOut)
async def answer_choice(diagnostic_id: str, question_id: str, body: AnswerIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> QuestionOut:
    q = await _question(db, diagnostic_id, question_id, user.id)
    if q.kind != "choice":
        raise HTTPException(422, "Р’С–РґРєСЂРёС‚С– РІС–РґРїРѕРІС–РґС– РѕС†С–РЅСЋСЋС‚СЊСЃСЏ С‡РµСЂРµР· /grade")
    try:
        assessment.grade_choice(q, body.answer)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    await db.commit()
    return question_out(q)


@router.post("/{diagnostic_id}/questions/{question_id}/grade")
async def grade_open(diagnostic_id: str, question_id: str, body: AnswerIn, user: User = Depends(ai_rate_limit), db: AsyncSession = Depends(get_db)):
    require_ai_configured(get_settings())
    q = await _question(db, diagnostic_id, question_id, user.id)
    if q.kind != "open":
        raise HTTPException(422, "РўРµСЃС‚РѕРІС– РІС–РґРїРѕРІС–РґС– РѕС†С–РЅСЋСЋС‚СЊСЃСЏ С‡РµСЂРµР· /answer")
    if q.grading_request_id:
        # one grading attempt in flight per question; protects from double submit
        prev = await load_request(db, q.grading_request_id, user.id)
        if prev and prev.status == "running":
            raise HTTPException(status.HTTP_409_CONFLICT, "Р’С–РґРїРѕРІС–РґСЊ СѓР¶Рµ РѕС†С–РЅСЋС”С‚СЊСЃСЏ")
    return sse_response(assessment.grade_open(user.id, q.id, body.answer.strip()))


@router.post("/{diagnostic_id}/finish")
async def finish(diagnostic_id: str, user: User = Depends(ai_rate_limit), db: AsyncSession = Depends(get_db)):
    require_ai_configured(get_settings())
    diag = await get_owned(db, Diagnostic, diagnostic_id, user.id, "Р”С–Р°РіРЅРѕСЃС‚РёРєСѓ")
    if diag.status != "active":
        raise HTTPException(status.HTTP_409_CONFLICT, "Р”С–Р°РіРЅРѕСЃС‚РёРєР° РЅРµ Р°РєС‚РёРІРЅР°")
    return sse_response(assessment.summarize(user.id, diag.id))
