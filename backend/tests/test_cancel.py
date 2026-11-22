from fastapi.testclient import TestClient

from app.services.ai import events
from app.services.ai.provider import MockProvider, StreamChunk, set_provider_override

from .conftest import parse_sse


class CancellingProvider:
    """Simulates the user pressing Stop after the first streamed chunks."""

    name = "mock"

    async def stream_chat(self, model, messages, params):
        yield StreamChunk("text", text="Частина ")
        yield StreamChunk("text", text="відповіді")
        for request_id in list(events._cancel_flags):
            events.request_cancel(request_id)
        yield StreamChunk("text", text=" яку не побачать")


class ReasoningProvider:
    """Emits reasoning chunks before the answer, like the current NVIDIA models."""

    name = "mock"

    async def stream_chat(self, model, messages, params):
        for _ in range(3):
            yield StreamChunk("reasoning", text="секретні роздуми ")
        yield StreamChunk("text", text="Відповідь")
        yield StreamChunk("usage", prompt_tokens=10, completion_tokens=5)


def test_reasoning_stage_is_recorded_but_content_hidden(client: TestClient) -> None:
    session = client.post("/api/sessions", json={"space": "study"}).json()
    set_provider_override(ReasoningProvider())
    try:
        r = client.post(f"/api/sessions/{session['id']}/messages", json={"content": "Привіт"})
    finally:
        set_provider_override(MockProvider(delay=0))
    assert "секретні" not in r.text, "raw reasoning must never reach the client"
    frames = parse_sse(r.text)
    reasoning = [d for e, d in frames if e == "ai" and d["stage"] == "reasoning"]
    assert [d["status"] for d in reasoning] == ["running", "completed"]
    assert reasoning[-1]["metadata"]["reasoning_chars"] == len("секретні роздуми ") * 3
    final = next(d for e, d in frames if e == "message")["message"]
    assert final["content"] == "Відповідь"


class ExhaustedProvider:
    name = "mock"

    async def stream_chat(self, model, messages, params):
        yield StreamChunk("reasoning", text="...")
        yield StreamChunk("finish", text="length")


def test_reasoning_that_exhausts_tokens_is_reported_clearly(client: TestClient) -> None:
    set_provider_override(ExhaustedProvider())
    try:
        frames = parse_sse(client.post("/api/diagnostics", json={"topic": "ML", "question_count": 10, "format": "mixed", "difficulty": "adaptive"}).text)
    finally:
        set_provider_override(MockProvider(delay=0))
    terminal = [d for e, d in frames if e == "ai"][-1]
    assert terminal["event_type"] == "request_failed" and terminal["metadata"]["code"] == "length"
    assert "ліміт токенів" in terminal["description"]


def test_structured_output_wrapper_key_is_tolerated() -> None:
    import pytest
    from pydantic import ValidationError

    from app.services.ai.tasks import validate_structured
    from app.services.assessment import Grade

    assert validate_structured(Grade, {"grade": {"score": 0.5, "feedback": "ok"}}).score == 0.5
    with pytest.raises(ValidationError):
        validate_structured(Grade, {"a": {"x": 1}})


def test_one_malformed_question_does_not_discard_the_rest() -> None:
    from app.services.assessment import GenQuestions

    good = {"kind": "open", "prompt": "Що таке ML?"}
    bad = {"kind": "choice", "prompt": "?", "options": ["a"], "correct_index": 5}
    parsed = GenQuestions.model_validate({"questions": [good, bad, good]})
    assert len(parsed.questions) == 2 and parsed.dropped == 1

    # real-model variations seen with NVIDIA Nemotron: null / list fields, string index, kind synonyms
    variant = {"kind": "тест", "prompt": "?", "options": ["a", "b"], "correct_index": "B", "criteria": None, "explanation": ["x", "y"], "topic": None}
    q = GenQuestions.model_validate({"questions": [variant]}).questions[0]
    assert (q.kind, q.correct_index, q.criteria, q.explanation) == ("choice", 1, "", "x; y")


def test_cancel_keeps_partial_answer(client: TestClient) -> None:
    session = client.post("/api/sessions", json={"space": "study"}).json()
    set_provider_override(CancellingProvider())
    try:
        frames = parse_sse(client.post(f"/api/sessions/{session['id']}/messages", json={"content": "Привіт"}).text)
    finally:
        set_provider_override(MockProvider(delay=0))
    terminal = [d for e, d in frames if e == "ai"][-1]
    assert terminal["event_type"] == "request_cancelled" and terminal["status"] == "cancelled"
    final = next(d for e, d in frames if e == "message")["message"]
    assert final["status"] == "cancelled" and final["content"] == "Частина відповіді"
    assert client.get(f"/api/requests/{final['request_id']}").json()["status"] == "cancelled"
