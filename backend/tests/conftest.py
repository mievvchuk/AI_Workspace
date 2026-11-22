import json
import os
import shutil
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="aiw-test-"))
os.environ.update(
    {
        "ENVIRONMENT": "test",
        "DATABASE_URL": f"sqlite+aiosqlite:///{(_tmp / 'test.db').as_posix()}",
        "UPLOAD_DIR": str(_tmp / "uploads"),
        "AI_PROVIDER": "mock",
        "NVIDIA_API_KEY": "",
        "GOOGLE_CLIENT_ID": "",
        "RATE_LIMIT_PER_MINUTE": "1000",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.security import rate_limiter  # noqa: E402
from app.services.ai.provider import MockProvider, set_provider_override  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _fast_mock():
    set_provider_override(MockProvider(delay=0))
    yield
    set_provider_override(None)
    shutil.rmtree(_tmp, ignore_errors=True)


@pytest.fixture(scope="session")
def app_client():
    with TestClient(app) as c:
        yield c


_counter = 0


@pytest.fixture
def client(app_client: TestClient) -> TestClient:
    """A fresh registered user per test (cookies + CSRF header)."""
    global _counter
    _counter += 1
    rate_limiter.reset()
    app_client.cookies.clear()
    app_client.headers.pop("x-csrf-token", None)
    r = app_client.post("/api/auth/register", json={"email": f"user{_counter}@example.com", "name": "Тест", "password": "password123"})
    assert r.status_code == 201, r.text
    app_client.headers["x-csrf-token"] = app_client.cookies["aw_csrf"]
    return app_client


def parse_sse(text: str) -> list[tuple[str, dict]]:
    frames = []
    for block in text.strip().split("\n\n"):
        event, data = "message", ""
        for line in block.splitlines():
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                data += line[5:].strip()
        if data:
            frames.append((event, json.loads(data)))
    return frames
