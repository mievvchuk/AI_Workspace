"""File handling: validation, storage, parsing and chunk indexing."""

import asyncio
import io
import logging
from pathlib import Path

from fastapi import BackgroundTasks, HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import SessionLocal
from ..models import Chunk, StoredFile, new_id

log = logging.getLogger(__name__)

TEXT_EXT = {".txt", ".md", ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".c", ".cpp", ".cs", ".go", ".rs", ".sql", ".json", ".yaml", ".yml", ".html", ".css", ".csv"}
DOC_EXT = {".pdf", ".docx"}
ALLOWED_EXT = TEXT_EXT | DOC_EXT
CHUNK_CHARS = 1200


def validate_upload(upload: UploadFile, size: int) -> str:
    name = Path(upload.filename or "file").name
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f"Формат {ext or 'без розширення'} не підтримується")
    if size > get_settings().max_upload_mb * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Файл більший за {get_settings().max_upload_mb} МБ")
    if size == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Файл порожній")
    return name


async def store_upload(
    db: AsyncSession, user_id: str, upload: UploadFile, *, subject_id: str | None = None, project_id: str | None = None
) -> StoredFile:
    data = await upload.read()
    name = validate_upload(upload, len(data))
    record = StoredFile(
        user_id=user_id,
        subject_id=subject_id,
        project_id=project_id,
        original_name=name,
        stored_name=new_id() + Path(name).suffix.lower(),
        mime=upload.content_type or "application/octet-stream",
        size=len(data),
        status="uploaded",
        content=data,
    )
    db.add(record)
    await db.commit()
    return record


async def schedule_processing(background: BackgroundTasks, db: AsyncSession, record: StoredFile) -> None:
    """Parse and index after the response where the host allows it; on serverless, before it,
    since an instance may be frozen as soon as the response is sent."""
    if get_settings().serverless:
        await process_file(record.id)
        await db.refresh(record)
    else:
        background.add_task(process_file, record.id)


def extract_text(name: str, data: bytes) -> str:
    ext = Path(name).suffix.lower()
    if ext == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    if ext == ".docx":
        import docx

        document = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in document.paragraphs)
    return data.decode("utf-8", errors="replace")


async def _file_bytes(db: AsyncSession, record: StoredFile) -> bytes:
    data = await db.scalar(select(StoredFile.content).where(StoredFile.id == record.id))
    if data is not None:
        return data
    # files uploaded before content moved into the database
    return await asyncio.to_thread((get_settings().upload_dir / record.stored_name).read_bytes)


def chunk_text(text: str, size: int = CHUNK_CHARS) -> list[str]:
    paragraphs = [p.strip() for p in text.replace("\r\n", "\n").split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        while len(para) > size:
            if current:
                chunks.append(current)
                current = ""
            chunks.append(para[:size])
            para = para[size:]
        if len(current) + len(para) + 2 > size and current:
            chunks.append(current)
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current:
        chunks.append(current)
    return chunks


async def process_file(file_id: str) -> None:
    """Background job: uploaded -> parsing -> indexing -> ready | failed."""
    async with SessionLocal() as db:
        record = await db.get(StoredFile, file_id)
        if record is None:
            return
        try:
            record.status = "parsing"
            await db.commit()
            data = await _file_bytes(db, record)
            text = await asyncio.to_thread(extract_text, record.stored_name, data)
            if not text.strip():
                raise ValueError("Не вдалося видобути текст із файлу")
            record.status = "indexing"
            await db.commit()
            chunks = chunk_text(text)
            await db.execute(delete(Chunk).where(Chunk.file_id == file_id))
            db.add_all(Chunk(file_id=file_id, idx=i, text=c) for i, c in enumerate(chunks))
            record.chunk_count = len(chunks)
            record.status = "ready"
            await db.commit()
        except Exception as exc:  # parsing libraries raise many types; record and surface it
            log.warning("file %s failed: %s", file_id, exc)
            await db.rollback()
            record = await db.get(StoredFile, file_id)
            if record:
                record.status = "failed"
                record.error = str(exc)[:300] if isinstance(exc, ValueError) else "Не вдалося обробити файл"
                await db.commit()


async def remove_file(db: AsyncSession, record: StoredFile) -> None:
    path = get_settings().upload_dir / record.stored_name
    await db.delete(record)
    await db.commit()
    path.unlink(missing_ok=True)
