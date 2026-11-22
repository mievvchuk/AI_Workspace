"""AI Model Registry: what each model is known to support and how UI effort maps to real API params.

Entries reflect the NVIDIA NIM catalog as checked on 2026-11-21 with a live key: each model below
answered streaming chat requests. All of them emit reasoning before the answer. ``reasoning_effort``
was accepted without error, but had no measurable effect on the amount of reasoning, so no model is
registered with controllable effort: the UI offers only the default level for them instead of
pretending low/high/ultra do something. Context windows are not published by the catalog for these
models, so they are left unknown rather than guessed.
"""

from dataclasses import dataclass, field
from typing import Any, Literal

Effort = Literal["low", "medium", "high", "ultra"]


@dataclass(frozen=True)
class ModelSpec:
    id: str
    label: str
    provider: str
    capabilities: tuple[str, ...]
    supports_streaming: bool = True
    context_window: int | None = None
    verified: bool = True
    note: str | None = None
    # UI effort -> extra request params. Missing key = effort unsupported for this model.
    effort_params: dict[str, dict[str, Any]] = field(default_factory=dict)

    @property
    def supports_reasoning(self) -> bool:
        """True only when the reasoning level is actually controllable via the API."""
        return any("reasoning_effort" in p for p in self.effort_params.values())

    @property
    def efforts(self) -> list[Effort]:
        return [e for e in ("low", "medium", "high", "ultra") if e in self.effort_params]  # type: ignore[misc]


_DEFAULT_ONLY = {"medium": {}}
_ALWAYS_REASONS = "Міркує перед кожною відповіддю; керування рівнем зусиль через API не підтверджено"

MODELS: tuple[ModelSpec, ...] = (
    ModelSpec(
        id="nvidia/nemotron-3.5-super-vl-120b-a12b",
        label="Nemotron 3.5 Super VL",
        provider="NVIDIA NIM",
        capabilities=("chat", "reasoning", "fast"),
        note=_ALWAYS_REASONS,
        effort_params=_DEFAULT_ONLY,
    ),
    ModelSpec(
        id="nvidia/nemotron-3-ultra-550b-a55b",
        label="Nemotron 3 Ultra",
        provider="NVIDIA NIM",
        capabilities=("chat", "reasoning"),
        note=_ALWAYS_REASONS,
        effort_params=_DEFAULT_ONLY,
    ),
    ModelSpec(
        id="mistralai/mistral-large-4-1t-a52b",
        label="Mistral Large 4",
        provider="Mistral AI · NVIDIA NIM",
        capabilities=("chat", "reasoning", "multilingual"),
        note=_ALWAYS_REASONS,
        effort_params=_DEFAULT_ONLY,
    ),
    ModelSpec(
        id="nvidia/nemotron-3.5-lightning-30b-a3b",
        label="Nemotron 3.5 Lightning",
        provider="NVIDIA NIM",
        capabilities=("chat", "reasoning", "fast"),
        note=_ALWAYS_REASONS,
        effort_params=_DEFAULT_ONLY,
    ),
    ModelSpec(
        id="nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        label="Nemotron 3 Nano Omni",
        provider="NVIDIA NIM",
        capabilities=("chat", "reasoning", "fast"),
        note=_ALWAYS_REASONS,
        effort_params=_DEFAULT_ONLY,
    ),
)

_BY_ID = {m.id: m for m in MODELS}


def get_model(model_id: str) -> ModelSpec | None:
    return _BY_ID.get(model_id)


def resolve_effort(spec: ModelSpec, effort: str) -> tuple[str, dict[str, Any]]:
    """Return a supported effort and its params, never sending unsupported values."""
    if effort in spec.effort_params:
        return effort, dict(spec.effort_params[effort])
    fallback = "medium" if "medium" in spec.effort_params else spec.efforts[0]
    return fallback, dict(spec.effort_params[fallback])
