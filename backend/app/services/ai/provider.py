"""AI Provider: the only place that talks to model APIs.

NVIDIA NIM exposes an OpenAI-compatible ``/chat/completions`` endpoint with SSE streaming.
The provider knows nothing about subjects, projects or labs.
"""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Literal, Protocol

import httpx

from ...config import get_settings


@dataclass
class StreamChunk:
    kind: Literal["text", "reasoning", "usage", "finish"]
    text: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0


class ProviderError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


ChatMessage = dict[str, str]


class AIProvider(Protocol):
    name: str

    def stream_chat(
        self, model: str, messages: list[ChatMessage], params: dict[str, Any]
    ) -> AsyncIterator[StreamChunk]: ...


class NvidiaProvider:
    name = "nvidia"

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def stream_chat(
        self, model: str, messages: list[ChatMessage], params: dict[str, Any]
    ) -> AsyncIterator[StreamChunk]:
        settings = get_settings()
        if not settings.nvidia_api_key:
            raise ProviderError("not_configured", "NVIDIA API не налаштовано на сервері")
        body = {
            "model": model,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
            "max_tokens": 8192,
            "temperature": 0.4,
            **params,
        }
        headers = {"Authorization": f"Bearer {settings.nvidia_api_key}", "Accept": "text/event-stream"}
        try:
            async with self._client.stream(
                "POST", f"{settings.nvidia_base_url}/chat/completions", json=body, headers=headers
            ) as resp:
                if resp.status_code != 200:
                    await resp.aread()
                    raise _map_status(resp.status_code)
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    for chunk in _parse_openai_chunk(data):
                        yield chunk
        except httpx.TimeoutException as exc:
            raise ProviderError("timeout", "Модель не відповіла вчасно") from exc
        except httpx.HTTPError as exc:
            raise ProviderError("unavailable", "NVIDIA API недоступний") from exc


def _map_status(code: int) -> ProviderError:
    if code in (401, 403):
        return ProviderError("auth", "Ключ NVIDIA API недійсний або не має доступу до моделі")
    if code == 404:
        return ProviderError("model_not_found", "Модель недоступна у NVIDIA API")
    if code == 410:
        return ProviderError("model_retired", "Модель знято з підтримки в NVIDIA API — оберіть іншу")
    if code == 429:
        return ProviderError("rate_limited", "Перевищено ліміт запитів NVIDIA API")
    if code == 400:
        return ProviderError("bad_request", "NVIDIA API відхилив параметри запиту")
    return ProviderError("unavailable", f"NVIDIA API повернув помилку {code}")


def _parse_openai_chunk(data: str) -> list[StreamChunk]:
    try:
        payload = json.loads(data)
    except json.JSONDecodeError:
        return []
    out: list[StreamChunk] = []
    for choice in payload.get("choices") or []:
        delta = choice.get("delta") or {}
        reasoning = delta.get("reasoning_content") or delta.get("reasoning")
        if reasoning:
            out.append(StreamChunk("reasoning", text=reasoning))
        if delta.get("content"):
            out.append(StreamChunk("text", text=delta["content"]))
        if choice.get("finish_reason"):
            out.append(StreamChunk("finish", text=str(choice["finish_reason"])))
    usage = payload.get("usage")
    if usage:
        out.append(
            StreamChunk(
                "usage",
                prompt_tokens=int(usage.get("prompt_tokens") or 0),
                completion_tokens=int(usage.get("completion_tokens") or 0),
            )
        )
    return out


class MockProvider:
    """Deterministic provider for automated tests and the explicitly labelled demo mode."""

    name = "mock"

    def __init__(self, delay: float = 0.07) -> None:
        self.delay = delay

    async def stream_chat(
        self, model: str, messages: list[ChatMessage], params: dict[str, Any]
    ) -> AsyncIterator[StreamChunk]:
        system = messages[0]["content"] if messages and messages[0]["role"] == "system" else ""
        last = messages[-1]["content"] if messages else ""
        if "FAIL_MOCK" in last:
            raise ProviderError("unavailable", "Тестова помилка провайдера")
        schema = re.search(r"\[schema=(\w+)\]", system)
        text = _mock_json(schema.group(1), last) if schema else _mock_answer(last)
        for piece in re.findall(r".{1,24}", text, flags=re.S):
            await asyncio.sleep(self.delay)
            yield StreamChunk("text", text=piece)
        yield StreamChunk("usage", prompt_tokens=sum(len(m["content"]) for m in messages) // 4, completion_tokens=len(text) // 4)


def _mock_answer(prompt: str) -> str:
    return (
        "**Тестова відповідь** (mock-провайдер).\n\n"
        f"Ви запитали: _{prompt[:120]}_\n\n"
        "| Пункт | Значення |\n|---|---|\n| Стрімінг | працює |\n| Markdown | працює |\n\n"
        "```python\ndef hello():\n    return 'AI Workspace'\n```\n"
    )


def _mock_json(schema: str, prompt: str) -> str:
    if schema == "lab_analysis":
        return json.dumps(
            {
                "execution_difficulty": 6,
                "theory_difficulty": 5,
                "defense_difficulty": 7,
                "estimated_hours": 4.5,
                "summary": "Лабораторна вимагає реалізації алгоритму та пояснення результатів.",
                "required_knowledge": ["Основи Python", "Структури даних", "Аналіз складності"],
                "gaps": ["Аналіз складності алгоритмів"],
                "recommendations": ["Повторіть нотацію O-велике", "Підготуйте приклади запуску"],
                "defense_questions": ["Яка складність вашого рішення?", "Чому обрано саме цю структуру даних?"],
            },
            ensure_ascii=False,
        )
    if schema == "diagnostic_questions":
        count = int(re.search(r"COUNT:(\d+)", prompt).group(1)) if "COUNT:" in prompt else 3
        fmt = re.search(r"FORMAT:(\w+)", prompt)
        kinds = {"choice": ["choice"], "open": ["open"]}.get(fmt.group(1) if fmt else "mixed", ["choice", "open"])
        questions = []
        for i in range(count):
            kind = kinds[i % len(kinds)]
            q: dict[str, Any] = {"kind": kind, "topic": f"Тема {i + 1}", "difficulty": "medium", "prompt": f"Запитання {i + 1}?"}
            if kind == "choice":
                q |= {"options": ["Варіант A", "Варіант B", "Варіант C", "Варіант D"], "correct_index": 1, "explanation": "Правильний варіант B."}
            else:
                q |= {"criteria": "Повна і коректна відповідь з прикладом.", "explanation": "Еталон: пояснення з прикладом."}
            questions.append(q)
        return json.dumps({"questions": questions}, ensure_ascii=False)
    if schema == "grade":
        return json.dumps({"score": 0.7, "feedback": "Відповідь загалом правильна, бракує прикладу."}, ensure_ascii=False)
    if schema == "diagnostic_summary":
        return json.dumps(
            {
                "strengths": ["Базові поняття"],
                "gaps": ["Практичне застосування"],
                "review_topics": ["Тема 2"],
                "next_step": "Пройдіть повторну діагностику за темою 2.",
            },
            ensure_ascii=False,
        )
    if schema == "emoji":
        return json.dumps({"emoji": "🧪"})
    return "{}"


_http_client: httpx.AsyncClient | None = None
_provider_override: AIProvider | None = None


def set_provider_override(provider: AIProvider | None) -> None:
    global _provider_override
    _provider_override = provider


def get_provider() -> AIProvider:
    global _http_client
    if _provider_override is not None:
        return _provider_override
    settings = get_settings()
    if settings.ai_provider == "mock":
        return MockProvider()
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=httpx.Timeout(settings.ai_timeout_seconds, connect=10.0))
    return NvidiaProvider(_http_client)


async def close_provider() -> None:
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None
