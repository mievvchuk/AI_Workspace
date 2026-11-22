"""File handling: validation, storage, parsing and chunk indexing."""

import asyncio
import io
import logging
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import delete
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
    settings = get_settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    stored_name = new_id() + Path(name).suffix.lower()
    await asyncio.to_thread((settings.upload_dir / stored_name).write_bytes, data)
    record = StoredFile(
        user_id=user_id,
        subject_id=subject_id,
        project_id=project_id,
        original_name=name,
        stored_name=stored_name,
        mime=upload.content_type or "application/octet-stream",
        size=len(data),
        status="uploaded",
    )
    db.add(record)
    await db.commit()
    return record


def extract_text(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    if ext == ".docx":
        import docx

        document = docx.Document(io.BytesIO(path.read_bytes()))
        return "\n".join(p.text for p in document.paragraphs)
    return path.read_text(encoding="utf-8", errors="replace")


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
            text = await asyncio.to_thread(extract_text, get_settings().upload_dir / record.stored_name)
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
