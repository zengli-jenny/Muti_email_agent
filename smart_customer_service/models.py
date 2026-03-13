from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(slots=True)
class Intent:
    intent_type: str
    summary: str
    order_id: str | None = None
    confidence: float = 0.0


@dataclass(slots=True)
class RetrievedItem:
    item_id: str
    source: str
    title: str
    content: str
    score: float
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ToolCall:
    name: str
    payload: dict[str, Any]
    result: dict[str, Any]


@dataclass(slots=True)
class ActionDecision:
    action_type: str
    status: str
    description: str
    payload: dict[str, Any] = field(default_factory=dict)
    requires_human: bool = False


@dataclass(slots=True)
class ReviewOutcome:
    passed: bool
    feedback: list[str] = field(default_factory=list)
    revised_reply: str = ""


@dataclass(slots=True)
class WorkflowState:
    customer_email: str
    brand: str
    subject: str
    body: str
    auto_execute: bool = False
    conversation_history: list[dict[str, str]] = field(default_factory=list)
    detected_language: str = "en"
    memory_facts: list[str] = field(default_factory=list)
    intents: list[Intent] = field(default_factory=list)
    retrieved_items: list[RetrievedItem] = field(default_factory=list)
    tool_calls: list[ToolCall] = field(default_factory=list)
    actions: list[ActionDecision] = field(default_factory=list)
    draft_reply: str = ""
    final_reply: str = ""
    review_feedback: list[str] = field(default_factory=list)
    review_passed: bool = False
    requires_human: bool = False
    reflection_count: int = 0
    iterations: int = 0
    metrics: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)
