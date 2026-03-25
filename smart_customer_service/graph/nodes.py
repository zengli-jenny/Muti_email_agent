"""All graph node implementations for the LangGraph customer service workflow.

Solver handles skill selection via the L1 skill table + load_skill tool calls
(progressive disclosure). Brand-specific skill profiles have been removed.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any, Callable, Awaitable

from smart_customer_service.graph.state import CustomerServiceState
from smart_customer_service.llm.base import BaseLLM
from smart_customer_service.knowledge_retriever import KnowledgeRetriever
from smart_customer_service.memory import MemoryStore
from smart_customer_service.skill_registry import SkillRegistry
from smart_customer_service.tool_registry import ToolRegistry
from smart_customer_service.prompt_templates import (
    REVIEWER_SYSTEM,
    REPLY_GENERATOR_SYSTEM,
    build_solver_system,
    build_solver_user_prompt,
    _safe_json,
)

logger = logging.getLogger(__name__)

# Token callback type: async fn(node_name, token_type, token_text)
TokenCallback = Callable[[str, str, str], Awaitable[None]]


def _trace(node_name: str, detail: str = "", reasoning: str = "") -> dict:
    d = {"node": node_name, "time": time.time(), "detail": detail}
    if reasoning:
        d["reasoning"] = reasoning
    return d


def _parse_json_from_llm(text: str) -> dict:
    """Extract JSON from LLM output, handling markdown code fences."""
    def _normalize(s: str) -> str:
        s = re.sub(r'\bTrue\b', 'true', s)
        s = re.sub(r'\bFalse\b', 'false', s)
        s = re.sub(r'\bNone\b', 'null', s)
        return s

    m = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    candidate = m.group(1).strip() if m else text.strip()
    candidate = _normalize(candidate)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass
    depth = 0
    start = None
    for i, ch in enumerate(candidate):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    return json.loads(candidate[start : i + 1])
                except json.JSONDecodeError:
                    start = None
    return {}


# ─────────────────────────────────────────────
# Node factory
# ─────────────────────────────────────────────

class NodeFactory:
    """Creates node functions with shared dependencies injected."""

    def __init__(
        self,
        llm: BaseLLM,
        memory_store: MemoryStore,
        skill_registry: SkillRegistry,
        knowledge_retriever: KnowledgeRetriever,
        tool_registry: ToolRegistry,
    ) -> None:
        self.llm = llm
        self.memory_store = memory_store
        self.skill_registry = skill_registry
        self.knowledge_retriever = knowledge_retriever
        self.tool_registry = tool_registry
        # Token streaming callback — set by the SSE layer before graph execution
        self.token_callback: TokenCallback | None = None

    def _make_node_token_cb(self, node_name: str):
        cb = self.token_callback
        if cb is None:
            return None

        async def _cb(token_type: str, token_text: str) -> None:
            await cb(node_name, token_type, token_text)

        return _cb

    def _get_node_thinking(self, state: CustomerServiceState, node_name: str) -> bool:
        cfg = state.get("node_config", {})
        return cfg.get(node_name, {}).get("enable_thinking", False)

    def _get_thinking_budget(self, state: CustomerServiceState, node_name: str) -> int:
        cfg = state.get("node_config", {})
        return cfg.get(node_name, {}).get("thinking_budget", 600)

    def _get_temperature(self, state: CustomerServiceState) -> float:
        return state.get("llm_temperature", 0.1) or 0.1

    def _get_custom_prompt(self, state: CustomerServiceState, node_name: str) -> str:
        cfg = state.get("node_config", {})
        return cfg.get(node_name, {}).get("custom_prompt", "")

    # ── Node 1: load_context ──

    async def load_context(self, state: CustomerServiceState) -> dict[str, Any]:
        """Load customer memory and detect language. No LLM call."""
        customer_email = state.get("customer_email", "")
        body = state.get("body", "")

        mem = self.memory_store.get(customer_email)
        memory_facts = mem.get("facts", [])

        detected_language = _detect_language(body)

        # Build L1 skill table for injection into solver
        skill_table = self.skill_registry.build_l1_table()

        return {
            "memory_facts": memory_facts,
            "detected_language": detected_language,
            "skill_table": skill_table,
            "trace_log": [_trace("load_context", f"lang={detected_language} memory={len(memory_facts)} facts skills={len(self.skill_registry.list_skills())}")],
        }

    # ── Node 2: solver (ReAct core) ──

    async def solver(self, state: CustomerServiceState) -> dict[str, Any]:
        """One ReAct iteration: think → decide (call_tool / generate_reply / need_human).

        The solver owns skill selection via load_skill tool calls.
        policy_content accumulates as skills are loaded progressively.
        """
        policy_content = state.get("policy_content", "")
        max_iter = state.get("max_react_iterations", 7)
        skill_table = state.get("skill_table", self.skill_registry.build_l1_table())

        custom_solver = self._get_custom_prompt(state, "solver")
        system_msg = custom_solver if custom_solver else build_solver_system(
            policy_content=policy_content,
            max_iterations=max_iter,
            skill_table=skill_table,
        )
        user_msg = build_solver_user_prompt(
            body=state.get("body", ""),
            old_emails=state.get("old_emails", ""),
            subject=state.get("subject", ""),
            retrieved_knowledge=state.get("retrieved_knowledge", ""),
            tool_results=state.get("tool_results", {}),
            thought_history=state.get("thought_history", []),
            review_feedback=state.get("review_feedback", ""),
            memory_facts=state.get("memory_facts", []),
        )

        raw, reasoning = await self.llm.chat_with_thinking_stream(
            [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            temperature=self._get_temperature(state),
            enable_thinking=self._get_node_thinking(state, "solver"),
            token_callback=self._make_node_token_cb("solver"),
            thinking_budget=self._get_thinking_budget(state, "solver"),
        )

        parsed = _parse_json_from_llm(raw)
        thought = parsed.get("thought", raw[:200])
        decision = parsed.get("decision", "need_human")
        iteration = state.get("react_iteration", 0) + 1

        # If human instructions were already provided, force generate_reply
        has_human_instruction = "[人工客服指令]" in state.get("old_emails", "") or "[人工客服指令]" in state.get("body", "")
        if decision == "need_human" and has_human_instruction:
            decision = "generate_reply"
            if not parsed.get("reply_content"):
                parsed["reply_content"] = thought

        result: dict[str, Any] = {
            "react_iteration": iteration,
            "solver_decision": decision,
            "trace_log": [_trace("solver", f"iter={iteration} decision={decision}", reasoning=reasoning)],
        }

        if decision == "call_tool":
            # Normalize: support both tool_calls array and legacy tool_call object
            tool_calls = parsed.get("tool_calls", [])
            if not tool_calls:
                legacy = parsed.get("tool_call", {})
                if legacy:
                    tool_calls = [legacy]
            result["pending_tool_calls"] = tool_calls
            result["thought_history"] = [{
                "thought": thought,
                "action": "调用工具: " + ", ".join(
                    f"{tc.get('name', '')}({_safe_json(tc.get('params', {}))})"
                    for tc in tool_calls
                ),
                "observation": "",
            }]
            # Track which skill was selected (for SSE display)
            for tc in tool_calls:
                if tc.get("name") == "load_skill":
                    skill_id = tc.get("params", {}).get("skill_id", "")
                    if skill_id:
                        result["selected_policy"] = skill_id
                        break
        elif decision == "generate_reply":
            result["draft_reply"] = parsed.get("reply_content", "")
            result["reply_type"] = parsed.get("reply_type", "NewEmail")
            result["thought_history"] = [{
                "thought": thought,
                "action": "生成回复",
                "observation": "回复已生成",
            }]
        else:  # need_human
            result["human_tasks"] = parsed.get("human_tasks", [{"task": "需要人工介入"}])
            result["requires_human"] = True
            result["thought_history"] = [{
                "thought": thought,
                "action": "标记人工处理",
                "observation": "已标记需要人工介入",
            }]

        return result

    # ── Node 3: tool_executor (parallel) ──

    async def tool_executor(self, state: CustomerServiceState) -> dict[str, Any]:
        """Execute pending tool calls in parallel via asyncio.gather. No LLM call."""
        pending_list = state.get("pending_tool_calls", [])
        if not pending_list:
            return {
                "pending_tool_calls": [],
                "trace_log": [_trace("tool_executor", "no pending tools")],
            }

        # Execute all tool calls concurrently
        async def _exec_one(tc: dict) -> tuple[str, dict, dict]:
            name = tc.get("name", "")
            params = tc.get("params", {})
            logger.info("Executing tool: %s params=%s", name, params)
            res = await self.tool_registry.call(name, params)
            return name, params, res

        results = await asyncio.gather(*[_exec_one(tc) for tc in pending_list])

        # Merge all results
        tool_results: dict[str, Any] = {}
        thought_updates: list[dict] = []
        extra: dict[str, Any] = {}
        policy_content = state.get("policy_content", "")
        trace_parts: list[str] = []

        for tool_name, tool_params, result in results:
            tool_results[tool_name] = result
            thought_updates.append({
                "thought": "",
                "action": "",
                "observation": _safe_json(result),
            })
            trace_parts.append(f"{tool_name}={result.get('status', '?')}")

            # If this was a load_skill call, accumulate policy_content
            if tool_name in ("load_skill", "load_skill_section"):
                data = result.get("data", result)
                if isinstance(data, dict) and "content" in data:
                    skill_name = data.get("name", tool_params.get("skill_id", ""))
                    section = data.get("section", "")
                    level = data.get("level", 2)
                    header = f"\n\n---\n## 已加载流程: {skill_name}"
                    if section:
                        header += f" / {section}"
                    elif level == 3:
                        header += " (完整流程)"
                    policy_content = policy_content + header + "\n\n" + data["content"]
                    skill_entry = self.skill_registry._skills.get(tool_params.get("skill_id", ""))
                    if skill_entry:
                        extra["selected_policy"] = skill_entry.file

        if policy_content != state.get("policy_content", ""):
            extra["policy_content"] = policy_content

        return {
            "tool_results": tool_results,
            "pending_tool_calls": [],
            "thought_history": thought_updates,
            "trace_log": [_trace("tool_executor", f"parallel({len(results)}): {', '.join(trace_parts)}")],
            **extra,
        }

    # ── Node 4: reply_generator ──

    async def reply_generator(self, state: CustomerServiceState) -> dict[str, Any]:
        """Format the draft reply into a proper email. 1 LLM call."""
        draft = state.get("draft_reply", "")
        lang = state.get("detected_language", "en")

        if _looks_like_complete_email(draft):
            return {
                "draft_reply": draft,
                "trace_log": [_trace("reply_generator", "draft already formatted, skipped LLM")],
            }

        custom_gen = self._get_custom_prompt(state, "reply_generator")
        prompt = custom_gen if custom_gen else REPLY_GENERATOR_SYSTEM.format(
            detected_language=lang,
            reply_content=draft,
        )

        formatted, gen_reasoning = await self.llm.chat_with_thinking_stream(
            [{"role": "user", "content": prompt}],
            temperature=self._get_temperature(state),
            enable_thinking=self._get_node_thinking(state, "reply_generator"),
            token_callback=self._make_node_token_cb("reply_generator"),
            thinking_budget=self._get_thinking_budget(state, "reply_generator"),
        )

        return {
            "draft_reply": formatted.strip(),
            "trace_log": [_trace("reply_generator", "formatted via LLM", reasoning=gen_reasoning)],
        }

    # ── Node 5: reviewer ──

    async def reviewer(self, state: CustomerServiceState) -> dict[str, Any]:
        """Review the draft reply for factual accuracy, compliance, and tone. 1 LLM call."""
        custom_rev = self._get_custom_prompt(state, "reviewer")
        prompt = custom_rev if custom_rev else REVIEWER_SYSTEM.format(
            policy_content=state.get("policy_content", "（无）"),
            tool_results=_safe_json(state.get("tool_results", {})),
            draft_reply=state.get("draft_reply", ""),
        )

        raw, rev_reasoning = await self.llm.chat_with_thinking_stream(
            [{"role": "user", "content": prompt}],
            temperature=self._get_temperature(state),
            enable_thinking=self._get_node_thinking(state, "reviewer"),
            token_callback=self._make_node_token_cb("reviewer"),
            thinking_budget=self._get_thinking_budget(state, "reviewer"),
        )

        parsed = _parse_json_from_llm(raw)
        passed = parsed.get("passed", False)
        feedback = parsed.get("feedback", "")

        result: dict[str, Any] = {
            "review_passed": passed,
            "review_feedback": feedback,
            "trace_log": [_trace("reviewer", f"passed={passed}", reasoning=rev_reasoning)],
        }

        if passed:
            result["final_reply"] = state.get("draft_reply", "")
        else:
            result["reflection_count"] = state.get("reflection_count", 0) + 1
            result["solver_decision"] = ""
            result["react_iteration"] = 0

        return result

    # ── Node 6: finalize ──

    async def finalize(self, state: CustomerServiceState) -> dict[str, Any]:
        """Handle need_human and max_reflections scenarios. Save memory. No LLM call."""
        customer_email = state.get("customer_email", "")
        draft = state.get("draft_reply", "")
        final = state.get("final_reply", "")

        result: dict[str, Any] = {
            "trace_log": [_trace("finalize")],
        }

        if not final and draft:
            result["final_reply"] = draft
            result["requires_human"] = True

        if state.get("solver_decision") == "need_human":
            result["requires_human"] = True
            if not final and not draft:
                result["final_reply"] = "此邮件需要人工客服处理。"

        if customer_email:
            facts = []
            basic_info = state.get("basic_info", {})
            if basic_info.get("order_id"):
                facts.append(f"订单号: {basic_info['order_id']}")
            if basic_info.get("product_model"):
                facts.append(f"产品型号: {basic_info['product_model']}")
            summary = f"处理了关于 {state.get('selected_policy', '未知')} 的问题"
            try:
                self.memory_store.update(customer_email, facts, summary)
            except Exception:
                logger.exception("Failed to save memory for %s", customer_email)

        return result


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _detect_language(text: str) -> str:
    if not text:
        return "en"
    cjk_count = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    if cjk_count > len(text) * 0.1:
        return "zh"
    text_lower = text.lower()
    if any(w in text_lower for w in ["bonjour", "merci", "cordialement"]):
        return "fr"
    if any(w in text_lower for w in ["hola", "gracias", "saludos"]):
        return "es"
    if any(w in text_lower for w in ["hallo", "danke", "grüße"]):
        return "de"
    return "en"


def _looks_like_complete_email(text: str) -> bool:
    """Simple heuristic: check if text has greeting + closing structure."""
    if not text or len(text) < 50:
        return False
    text_lower = text.lower()
    greetings = ["hi ", "hello", "dear ", "hey "]
    closings = ["regards", "sincerely", "best,", "thanks,", "thank you"]
    has_greeting = any(text_lower[:100].startswith(g) or g in text_lower[:100] for g in greetings)
    has_closing = any(c in text_lower[-200:] for c in closings)
    return has_greeting and has_closing
