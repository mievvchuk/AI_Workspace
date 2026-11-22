import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import timedelta

import bcrypt
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import get_db, utcnow
from .models import AuthSession, User

SESSION_COOKIE = "aw_session"
CSRF_COOKIE = "aw_csrf"
CSRF_HEADER = "x-csrf-token"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_session(db: AsyncSession, response: Response, user: User) -> None:
    settings = get_settings()
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=_hash_token(token),
            csrf_token=csrf,
            expires_at=utcnow() + timedelta(days=settings.session_ttl_days),
        )
    )
    await db.commit()
    max_age = settings.session_ttl_days * 86400
    response.set_cookie(
        SESSION_COOKIE, token, max_age=max_age, httponly=True, samesite="lax", secure=settings.cookie_secure, path="/"
    )
    # Readable by JS on purpose: double-submit CSRF token, validated against the server-side session value.
    response.set_cookie(
        CSRF_COOKIE, csrf, max_age=max_age, httponly=False, samesite="lax", secure=settings.cookie_secure, path="/"
    )


async def destroy_session(db: AsyncSession, request: Request, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        session = await db.scalar(select(AuthSession).where(AuthSession.token_hash == _hash_token(token)))
        if session:
            await db.delete(session)
            await db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")


async def get_auth_session(request: Request, db: AsyncSession = Depends(get_db)) -> AuthSession:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Потрібно увійти")
    session = await db.scalar(select(AuthSession).where(AuthSession.token_hash == _hash_token(token)))
    expires = session.expires_at.replace(tzinfo=utcnow().tzinfo) if session else None
    if not session or expires is None or expires < utcnow():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Сесія завершилася. Увійдіть знову")
    if request.method not in SAFE_METHODS:
        header = request.headers.get(CSRF_HEADER, "")
        if not hmac.compare_digest(header, session.csrf_token):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Недійсний CSRF-токен")
    return session


async def optional_user(request: Request, db: AsyncSession = Depends(get_db)) -> User | None:
    """The signed-in user, or None for guests. Used where a guest is a normal state, not an error."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    session = await db.scalar(select(AuthSession).where(AuthSession.token_hash == _hash_token(token)))
    if not session or session.expires_at.replace(tzinfo=utcnow().tzinfo) < utcnow():
        return None
    return session.user


async def current_user(session: AuthSession = Depends(get_auth_session)) -> User:
    return session.user


class RateLimiter:
    """Small in-process sliding-window limiter. Good enough for a single-node deployment."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window: float = 60.0) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > window:
            hits.popleft()
        if len(hits) >= limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Забагато запитів. Спробуйте за хвилину")
        hits.append(now)

    def reset(self) -> None:
        self._hits.clear()


rate_limiter = RateLimiter()


def ai_rate_limit(user: User = Depends(current_user)) -> User:
    rate_limiter.check(f"ai:{user.id}", get_settings().rate_limit_per_minute)
    return user
