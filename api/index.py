"""Vercel Function entrypoint: the FastAPI app in backend/app, served for every /api/* request."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402

__all__ = ["app"]
