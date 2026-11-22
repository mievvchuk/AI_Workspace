import base64
import hashlib
import json
import secrets
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..models import User
from ..schemas import AuthConfigOut, AuthStateOut, LoginIn, RegisterIn, UserOut
from ..security import create_session, current_user, destroy_session, hash_password, optional_user, rate_limiter, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
OAUTH_COOKIE = "aw_oauth"


def user_out(user: User) -> UserOut:
    out = UserOut.model_validate(user)
    out.has_password = bool(user.password_hash)
    out.google_linked = bool(user.google_sub)
    return out


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.get("/config", response_model=AuthConfigOut)
async def auth_config() -> AuthConfigOut:
    return AuthConfigOut(google_enabled=get_settings().google_enabled)


@router.post("/register", response_model=UserOut, status_code=201)
async def register(body: RegisterIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> UserOut:
    rate_limiter.check(f"auth:{_client_key(request)}", 10)
    email = body.email.lower()
    if await db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Користувач з таким email уже існує")
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password))
    db.add(user)
    await db.commit()
    await create_session(db, response, user)
    return user_out(user)


@router.post("/login", response_model=UserOut)
async def login(body: LoginIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> UserOut:
    rate_limiter.check(f"auth:{_client_key(request)}", 10)
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Невірний email або пароль")
    await create_session(db, response, user)
    return user_out(user)


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db), _: User = Depends(current_user)) -> None:
    await destroy_session(db, request, response)


@router.get("/session", response_model=AuthStateOut)
async def session(user: User | None = Depends(optional_user)) -> AuthStateOut:
    """Always 200: lets the client tell "guest" from "signed in" without a 401 in the console."""
    return AuthStateOut(user=user_out(user) if user else None)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user)) -> UserOut:
    return user_out(user)


# ---------------- Google OAuth 2.0 (authorization code + PKCE) ----------------


def _redirect_uri() -> str:
    return f"{get_settings().public_api_url}/api/auth/google/callback"


@router.get("/google/start")
async def google_start(request: Request) -> RedirectResponse:
    settings = get_settings()
    if not settings.google_enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Вхід через Google не налаштовано")
    rate_limiter.check(f"auth:{_client_key(request)}", 20)
    state = secrets.token_urlsafe(24)
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    resp = RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}", status_code=302)
    resp.set_cookie(OAUTH_COOKIE, f"{state}.{verifier}", max_age=600, httponly=True, samesite="lax", secure=settings.cookie_secure, path="/api/auth/google")
    return resp


def _decode_id_token(id_token: str) -> dict:
    # The token comes straight from Google's token endpoint over TLS (server-to-server), which
    # OpenID Connect Core §3.1.3.7 allows to trust without signature verification. Claims still checked.
    payload = id_token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))


@router.get("/google/callback")
async def google_callback(request: Request, code: str = "", state: str = "", error: str = "", db: AsyncSession = Depends(get_db)) -> RedirectResponse:
    settings = get_settings()
    fail = RedirectResponse(f"{settings.frontend_origin}/login?error=google", status_code=302)
    fail.delete_cookie(OAUTH_COOKIE, path="/api/auth/google")
    cookie = request.cookies.get(OAUTH_COOKIE, "")
    if error or not code or "." not in cookie or not settings.google_enabled:
        return fail
    expected_state, verifier = cookie.split(".", 1)
    if not secrets.compare_digest(expected_state, state):
        return fail
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token_resp = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": _redirect_uri(),
                    "grant_type": "authorization_code",
                    "code_verifier": verifier,
                },
            )
        token_resp.raise_for_status()
        claims = _decode_id_token(token_resp.json()["id_token"])
    except (httpx.HTTPError, KeyError, ValueError, IndexError):
        return fail
    if (
        claims.get("aud") != settings.google_client_id
        or claims.get("iss") not in GOOGLE_ISSUERS
        or int(claims.get("exp", 0)) < time.time()
        or not claims.get("email_verified")
    ):
        return fail

    sub, email = str(claims["sub"]), str(claims["email"]).lower()
    user = await db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = await db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, name=claims.get("name") or email.split("@")[0])
            db.add(user)
        user.google_sub = sub
    user.avatar_url = claims.get("picture") or user.avatar_url
    await db.commit()
    ok = RedirectResponse(f"{settings.frontend_origin}/", status_code=302)
    ok.delete_cookie(OAUTH_COOKIE, path="/api/auth/google")
    await create_session(db, ok, user)
    return ok
