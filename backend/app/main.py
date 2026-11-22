import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import update

from .config import get_settings
from .db import SessionLocal, init_db
from .models import Message
from .routers import auth, chat, dev, diagnostics, study
from .services.ai.events import purge_old_events
from .services.ai.provider import close_provider

log = logging.getLogger("ai_workspace")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    await init_db()
    async with SessionLocal() as db:
        await purge_old_events(db, settings.ai_event_retention_days)
        # replies that were streaming when the server stopped can never finish
        await db.execute(update(Message).where(Message.status == "streaming").values(status="error", error="Генерацію перервано перезапуском сервера"))
        await db.commit()
    yield
    await close_provider()


app = FastAPI(title="AI Workspace API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", [])[1:])
    known = {
        "email": "Невірний формат email",
        "password": "Пароль має містити щонайменше 8 символів",
        "name": "Вкажіть назву",
    }
    detail = known.get(field) or f"Перевірте поле {field}: {first.get('msg', '')}".strip()
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled error", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Внутрішня помилка сервера"})


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


for router in (auth.router, study.router, dev.router, chat.router, diagnostics.router):
    app.include_router(router)


# Production: the same service serves the built frontend, so cookies, CSRF and the
# Google callback all live on one origin. Registered last so /api routes win.
_dist = get_settings().static_dir
if _dist and _dist.is_dir():
    _root = _dist.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
        target = (_root / path).resolve()
        if path and target.is_file() and _root in target.parents:
            return FileResponse(target)
        return FileResponse(_root / "index.html")
