"""Conditional edge functions for the LangGraph workflow."""

from __future__ import annotations

from smart_customer_service.graph.state import CustomerServiceState


def decide_solver_next(state: CustomerServiceState) -> str:
    """After solver runs, decide: call_tool, generate_reply, or need_human."""
    iteration = state.get("react_iteration", 0)
    max_iter = state.get("max_react_iterations", 7)
    if iteration >= max_iter:
        return "need_human"
    decision = state.get("solver_decision", "need_human")
    # Also check pending_tool_calls as a fallback signal
    if decision == "call_tool" and not state.get("pending_tool_calls"):
        return "need_human"
    return decision


def decide_review_result(state: CustomerServiceState) -> str:
    """After reviewer runs, decide: approved, rejected, or max_reflections."""
    if state.get("review_passed", False):
        return "approved"
    reflection_count = state.get("reflection_count", 0)
    max_reflections = state.get("max_reflections", 2)
    if reflection_count >= max_reflections:
        return "max_reflections"
    return "rejected"
