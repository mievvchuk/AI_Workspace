from fastapi.testclient import TestClient

from .conftest import parse_sse


# ---------------- auth ----------------


def test_me_and_csrf(client: TestClient) -> None:
    assert client.get("/api/auth/me").json()["name"] == "Тест"
    token = client.headers.pop("x-csrf-token")
    assert client.post("/api/subjects", json={"name": "X"}).status_code == 403
    client.headers["x-csrf-token"] = token


def test_login_logout(client: TestClient) -> None:
    email = client.get("/api/auth/me").json()["email"]
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "password": "wrong-pass"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "password": "password123"}).status_code == 200


def test_google_disabled_without_credentials(client: TestClient) -> None:
    assert client.get("/api/auth/config").json() == {"google_enabled": False}
    assert client.get("/api/auth/google/start", follow_redirects=False).status_code == 404


def test_google_callback_rejects_bad_state(client: TestClient) -> None:
    r = client.get("/api/auth/google/callback?code=x&state=y", follow_redirects=False)
    assert r.status_code == 302 and "error=google" in r.headers["location"]


# ---------------- subjects & emoji ----------------


def test_subject_auto_and_manual_emoji(client: TestClient) -> None:
    r = client.post("/api/subjects", json={"name": "Машинне навчання", "description": "Нейромережі"})
    assert r.status_code == 201
    subject = r.json()
    assert subject["emoji"] == "🧠" and subject["emoji_source"] == "local"

    r = client.patch(f"/api/subjects/{subject['id']}", json={"emoji": "🤖"})
    assert r.json()["emoji"] == "🤖" and r.json()["emoji_source"] == "manual"

    r = client.patch(f"/api/subjects/{subject['id']}", json={"name": "Глибинне навчання"})
    assert r.json()["emoji"] == "🤖", "renaming must not silently overwrite a manual emoji"

    r = client.post("/api/subjects", json={"name": "Ззззз"})
    assert r.json()["emoji_source"] in {"ai", "fallback"}


def test_emoji_suggest_endpoint(client: TestClient) -> None:
    r = client.post("/api/emoji/suggest", json={"name": "Кібербезпека"})
    assert r.json()["emoji"] == "🔐" and r.json()["source"] == "local"


def test_subject_isolation_between_users(client: TestClient, app_client: TestClient) -> None:
    sid = client.post("/api/subjects", json={"name": "Фізика"}).json()["id"]
    app_client.cookies.clear()
    app_client.post("/api/auth/register", json={"email": "other@example.com", "name": "Інший", "password": "password123"})
    app_client.headers["x-csrf-token"] = app_client.cookies["aw_csrf"]
    assert app_client.get(f"/api/subjects/{sid}").status_code == 404
    assert app_client.delete(f"/api/subjects/{sid}").status_code == 404


def test_validation_error_message(client: TestClient) -> None:
    r = client.post("/api/subjects", json={"name": "   "})
    assert r.status_code == 422 and "detail" in r.json()


# ---------------- files ----------------


def _upload(client: TestClient, url: str, name: str, content: bytes):
    return client.post(url, files={"file": (name, content, "text/plain")})


def test_upload_and_index(client: TestClient) -> None:
    sid = client.post("/api/subjects", json={"name": "Python"}).json()["id"]
    r = _upload(client, f"/api/subjects/{sid}/files", "lab6.md", "# Лабораторна 6\n\nДекоратори у Python дозволяють обгортати функції.".encode())
    assert r.status_code == 201
    files = client.get(f"/api/subjects/{sid}/files").json()
    assert files[0]["status"] == "ready" and files[0]["chunk_count"] == 1

    assert _upload(client, f"/api/subjects/{sid}/files", "virus.exe", b"MZ").status_code == 415
    assert _upload(client, f"/api/subjects/{sid}/files", "empty.txt", b"").status_code == 400


# ---------------- chat streaming ----------------


def _session(client: TestClient, **kw) -> dict:
    r = client.post("/api/sessions", json={"space": "study", **kw})
    assert r.status_code == 201, r.text
    return r.json()


def test_chat_stream_events_and_persistence(client: TestClient) -> None:
    sid = client.post("/api/subjects", json={"name": "Python"}).json()["id"]
    _upload(client, f"/api/subjects/{sid}/files", "notes.txt", "Декоратори Python обгортають функції і змінюють поведінку.".encode())
    session = _session(client, subject_id=sid)

    r = client.post(f"/api/sessions/{session['id']}/messages", json={"content": "Що таке декоратори Python?"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    frames = parse_sse(r.text)

    seqs = [d["seq"] for _, d in frames]
    assert seqs == sorted(seqs) and len(set(seqs)) == len(seqs), "seq must be strictly increasing"
    request_ids = {d["request_id"] for _, d in frames}
    assert len(request_ids) == 1

    types = [d["event_type"] for e, d in frames if e == "ai"]
    for expected in ("request_started", "context_preparation", "document_search", "model_request_started",
                     "response_streaming", "response_completed", "result_saving", "request_completed"):
        assert expected in types, expected
    search = next(d for e, d in frames if e == "ai" and d["event_type"] == "document_search" and d["status"] == "completed")
    assert search["metadata"]["fragments"] >= 1 and "notes.txt" in search["metadata"]["sources"]

    streamed = "".join(d["text"] for e, d in frames if e == "delta")
    final = next(d for e, d in frames if e == "message")["message"]
    assert final["status"] == "complete" and final["content"] == streamed and final["completion_tokens"] > 0

    log = client.get(f"/api/requests/{final['request_id']}").json()
    assert log["status"] == "completed" and len(log["events"]) == len(types)
    assert all("prompt" not in str(ev["metadata"]).lower() or "prompt_tokens" in ev["metadata"] for ev in log["events"])

    messages = client.get(f"/api/sessions/{session['id']}/messages").json()
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert client.get(f"/api/sessions/{session['id']}").json()["title"].startswith("Що таке декоратори")
    # case-insensitive Cyrillic search (SQLite lower() is ASCII-only without our override)
    assert [s["id"] for s in client.get("/api/sessions", params={"q": "ДЕКОРАТОРИ"}).json()] == [session["id"]]


def test_chat_provider_error_keeps_message(client: TestClient) -> None:
    session = _session(client)
    frames = parse_sse(client.post(f"/api/sessions/{session['id']}/messages", json={"content": "FAIL_MOCK please"}).text)
    terminal = [d for e, d in frames if e == "ai"][-1]
    assert terminal["event_type"] == "request_failed" and "Тестова помилка" in terminal["description"]
    final = next(d for e, d in frames if e == "message")["message"]
    assert final["status"] == "error"


def test_regenerate_and_edit(client: TestClient) -> None:
    session = _session(client)
    client.post(f"/api/sessions/{session['id']}/messages", json={"content": "Перше"})
    client.post(f"/api/sessions/{session['id']}/regenerate")
    msgs = client.get(f"/api/sessions/{session['id']}/messages").json()
    assert [m["role"] for m in msgs] == ["user", "assistant"]
    client.post(f"/api/messages/{msgs[0]['id']}/edit", json={"content": "Змінене"})
    msgs = client.get(f"/api/sessions/{session['id']}/messages").json()
    assert msgs[0]["content"] == "Змінене" and len(msgs) == 2


def test_effort_mapping_never_sends_unsupported(client: TestClient) -> None:
    from app.services.ai.registry import MODELS, ModelSpec, resolve_effort

    controllable = ModelSpec(id="x", label="X", provider="p", capabilities=("chat",),
                             effort_params={"low": {"reasoning_effort": "low"}, "medium": {"reasoning_effort": "medium"}})
    assert resolve_effort(controllable, "low") == ("low", {"reasoning_effort": "low"})
    assert resolve_effort(controllable, "ultra") == ("medium", {"reasoning_effort": "medium"})
    assert controllable.supports_reasoning

    # Registered models: effort control is not verified, so only the default level exists.
    model = MODELS[0].id
    s = _session(client, model=model, effort="ultra")
    assert s["effort"] == "medium"
    models = {m["id"]: m for m in client.get("/api/models").json()}
    assert models[model]["efforts"] == ["medium"] and models[model]["supports_reasoning"] is False
    assert client.post("/api/sessions", json={"space": "study", "model": "meta/llama-3.3-70b-instruct"}).status_code == 422


def test_cancel_unknown_request(client: TestClient) -> None:
    assert client.post("/api/requests/doesnotexist/cancel").status_code == 404


# ---------------- labs ----------------


def test_lab_analysis(client: TestClient) -> None:
    sid = client.post("/api/subjects", json={"name": "Алгоритми"}).json()["id"]
    lab = client.post(f"/api/subjects/{sid}/labs", json={"title": "Лабораторна 1", "description": "Сортування"}).json()
    frames = parse_sse(client.post(f"/api/labs/{lab['id']}/analyze").text)
    types = [d["event_type"] for e, d in frames if e == "ai"]
    assert "tool_completed" in types and types[-1] == "request_completed"
    result = next(d for e, d in frames if e == "result")["lab"]
    assert result["analysis"]["execution_difficulty"] == 6
    assert result["analysis_request_id"]
    dash = client.get("/api/study/dashboard").json()
    assert dash["open_labs"][0]["id"] == lab["id"]


# ---------------- diagnostics ----------------


def test_diagnostic_flow(client: TestClient) -> None:
    frames = parse_sse(client.post("/api/diagnostics", json={"topic": "Python", "question_count": 4, "format": "mixed", "difficulty": "adaptive"}).text)
    diag_id = next(d for e, d in frames if e == "result")["diagnostic_id"]
    diag = client.get(f"/api/diagnostics/{diag_id}").json()
    assert diag["status"] == "active" and len(diag["questions"]) == 4
    assert all(q["correct_index"] is None and q["explanation"] is None for q in diag["questions"]), "answer key must not leak"

    choice = next(q for q in diag["questions"] if q["kind"] == "choice")
    r = client.post(f"/api/diagnostics/{diag_id}/questions/{choice['id']}/answer", json={"answer": "1"})
    assert r.json()["score"] == 1.0 and r.json()["correct_index"] == 1
    assert client.post(f"/api/diagnostics/{diag_id}/questions/{choice['id']}/answer", json={"answer": "1"}).status_code == 409

    open_q = next(q for q in diag["questions"] if q["kind"] == "open")
    frames = parse_sse(client.post(f"/api/diagnostics/{diag_id}/questions/{open_q['id']}/grade", json={"answer": "Моя відповідь"}).text)
    assert [d for e, d in frames if e == "ai"][-1]["event_type"] == "request_completed"

    frames = parse_sse(client.post(f"/api/diagnostics/{diag_id}/finish").text)
    assert [d for e, d in frames if e == "ai"][-1]["event_type"] == "request_completed"
    final = client.get(f"/api/diagnostics/{diag_id}").json()
    assert final["status"] == "completed" and final["summary"]["next_step"] and final["score"] is not None


# ---------------- dev workspace ----------------


def test_projects_categories_activity(client: TestClient) -> None:
    cat = client.post("/api/categories", json={"name": "Веб"}).json()
    p = client.post("/api/projects", json={"name": "Портфоліо", "stack": ["React", "react", " TS "], "category_id": cat["id"]}).json()
    assert p["stack"] == ["React", "TS"]
    _upload(client, f"/api/projects/{p['id']}/files", "main.py", b"print('hi')")
    s = client.post("/api/sessions", json={"space": "dev", "project_id": p["id"]}).json()
    client.post(f"/api/sessions/{s['id']}/messages", json={"content": "Огляд коду"})
    kinds = {a["kind"] for a in client.get(f"/api/projects/{p['id']}/activity").json()}
    assert kinds == {"session", "file", "message"}
    assert client.get(f"/api/projects/{p['id']}").json()["session_count"] == 1
    client.delete(f"/api/categories/{cat['id']}")
    assert client.get(f"/api/projects/{p['id']}").json()["category_id"] is None


def test_session_endpoint_is_200_for_guests(client: TestClient, app_client: TestClient) -> None:
    assert client.get("/api/auth/session").json()["user"]["name"] == "Тест"
    app_client.cookies.clear()
    r = app_client.get("/api/auth/session")
    assert r.status_code == 200 and r.json() == {"user": None}
