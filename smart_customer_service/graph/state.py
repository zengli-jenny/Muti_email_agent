"""LangGraph State definition for the customer service workflow."""

from __future__ import annotations

from typing import Annotated, TypedDict

from langgraph.graph.message import add_messages


def _merge_dicts(old: dict, new: dict) -> dict:
    """Merge two dicts, new values overwrite old."""
    merged = dict(old) if old else {}
    merged.update(new or {})
    return merged


def _append_list(old: list, new: list) -> list:
    """Append new items to old list."""
    return (old or []) + (new or [])


class CustomerServiceState(TypedDict, total=False):
    # ── Input ──
    customer_email: str
    brand: str
    subject: str
    body: str
    old_emails: str
    auto_execute: bool

    # ── Context loading ──
    memory_facts: list[str]
    skill_profile: dict
    detected_language: str

    # ── Routing ──
    basic_info: dict
    selected_policy: str
    policy_content: str

    # ── Knowledge retrieval ──
    retrieved_knowledge: str

    # ── ReAct loop ──
    thought_history: Annotated[list[dict], _append_list]
    react_iteration: int
    max_react_iterations: int
    solver_decision: str          # "call_tool" | "generate_reply" | "need_human"
    pending_tool_call: dict       # {name, params}
    tool_results: Annotated[dict, _merge_dicts]

    # ── Reply generation ──
    draft_reply: str
    reply_type: str               # "NewEmail" | "FaqList"
    human_tasks: list[dict]

    # ── Reflection ──
    review_feedback: str
    review_passed: bool
    reflection_count: int
    max_reflections: int

    # ── Output ──
    final_reply: str
    requires_human: bool

    # ── Tracing ──
    trace_log: Annotated[list[dict], _append_list]

    # ── Per-node configuration (from frontend) ──
    node_config: dict  # {router: {enable_thinking}, solver: {...}, ...}
    llm_temperature: float
    max_react_iterations_override: int
