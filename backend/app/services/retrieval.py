"""Retrieval Service: lightweight lexical search over indexed chunks (uk + en).

Deliberately simple (no vector DB): token overlap with prefix stemming and IDF weighting.
"""

import math
import re
from collections import Counter
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Chunk, StoredFile

_WORD = re.compile(r"[\w'’]+", re.UNICODE)
_STOP = {
    "і", "й", "та", "в", "у", "на", "з", "із", "до", "що", "як", "це", "не", "для", "по", "за", "від", "а", "або",
    "the", "a", "an", "of", "to", "in", "and", "or", "is", "are", "for", "on", "with", "what", "how",
}


def tokenize(text: str) -> list[str]:
    words = (w.lower().replace("’", "'") for w in _WORD.findall(text))
    # crude stemming: first 6 chars is enough to merge most uk inflections
    return [w[:6] for w in words if len(w) > 1 and w not in _STOP]


@dataclass
class Hit:
    file_id: str
    file_name: str
    chunk_idx: int
    text: str
    score: float


async def search(
    db: AsyncSession, user_id: str, query: str, *, subject_id: str | None = None, project_id: str | None = None, limit: int = 4
) -> tuple[list[Hit], int]:
    """Return top chunks and number of ready documents searched."""
    stmt = select(StoredFile).where(StoredFile.user_id == user_id, StoredFile.status == "ready")
    if subject_id:
        stmt = stmt.where(StoredFile.subject_id == subject_id)
    elif project_id:
        stmt = stmt.where(StoredFile.project_id == project_id)
    else:
        return [], 0
    files = {f.id: f for f in (await db.scalars(stmt)).all()}
    if not files:
        return [], 0
    chunks = (await db.scalars(select(Chunk).where(Chunk.file_id.in_(files)))).all()
    q_terms = set(tokenize(query))
    if not q_terms or not chunks:
        return [], len(files)

    docs = [(c, Counter(tokenize(c.text))) for c in chunks]
    df = Counter(t for _, tf in docs for t in q_terms if t in tf)
    n = len(docs)
    hits: list[Hit] = []
    for chunk, tf in docs:
        score = sum((1 + math.log(tf[t])) * math.log(1 + n / df[t]) for t in q_terms if tf.get(t))
        if score > 0:
            f = files[chunk.file_id]
            hits.append(Hit(f.id, f.original_name, chunk.idx, chunk.text, score))
    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:limit], len(files)
