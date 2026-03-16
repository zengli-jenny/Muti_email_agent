"""All graph node implementations for the LangGraph customer service workflow."""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Callable, Awaitable

from smart_customer_service.graph.state import CustomerServiceState
from smart_customer_service.llm.base import BaseLLM
from smart_customer_service.knowledge_retriever import KnowledgeRetriever
from smart_customer_service.memory import MemoryStore
from smart_customer_service.policy_loader import PolicyLoader
from smart_customer_service.skills import SkillLoader
from smart_customer_service.tool_registry import ToolRegistry
from smart_customer_service.router_agent import RouterAgent
from smart_customer_service.prompt_templates import (
    ROUTER_SYSTEM,
    REVIEWER_SYSTEM,
    REPLY_GENERATOR_SYSTEM,
    build_router_user_prompt,
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
    # Normalize common LLM quirks before parsing
    def _normalize(s: str) -> str:
        # Replace Python-style True/False/None with JSON true/false/null
        s = re.sub(r'\bTrue\b', 'true', s)
        s = re.sub(r'\bFalse\b', 'false', s)
        s = re.sub(r'\bNone\b', 'null', s)
        return s

    # Try to find JSON in code fences first
    m = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    candidate = m.group(1).strip() if m else text.strip()
    candidate = _normalize(candidate)
    # Try parsing directly
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass
    # Try finding the first { ... } block
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
# Node factory — creates closures that capture shared dependencies
# ─────────────────────────────────────────────

class NodeFactory:
    """Creates node functions with shared dependencies injected."""

    def __init__(
        self,
        llm: BaseLLM,
        memory_store: MemoryStore,
        skill_loader: SkillLoader,
        policy_loader: PolicyLoader,
        knowledge_retriever: KnowledgeRetriever,
        tool_registry: ToolRegistry,
        rule_router: RouterAgent,
        policy_routing_text: str,
    ) -> None:
        self.llm = llm
        self.memory_store = memory_store
        self.skill_loader = skill_loader
        self.policy_loader = policy_loader
        self.knowledge_retriever = knowledge_retriever
        self.tool_registry = tool_registry
        self.rule_router = rule_router
        self.policy_routing_text = policy_routing_text
        # Token streaming callback — set by the SSE layer before graph execution
        self.token_callback: TokenCallback | None = None

    def _make_node_token_cb(self, node_name: str):
        """Create a per-node LLM token callback that delegates to self.token_callback."""
        cb = self.token_callback
        if cb is None:
            return None

        async def _cb(token_type: str, token_text: str) -> None:
            await cb(node_name, token_type, token_text)

        return _cb

    # ── Node 1: load_context ──

    async def load_context(self, state: CustomerServiceState) -> dict[str, Any]:
        """Load customer memory, brand skill, detect language. No LLM call."""
        customer_email = state.get("customer_email", "")
        brand = state.get("brand", "")
        body = state.get("body", "")

        # Customer memory
        mem = self.memory_store.get(customer_email)
        memory_facts = mem.get("facts", [])

        # Brand skill
        skill = self.skill_loader.load(brand)
        skill_dict = {
            "brand": skill.brand,
            "tone": skill.tone,
            "greeting": skill.greeting,
            "closing": skill.closing,
            "approval_threshold_usd": skill.approval_threshold_usd,
            "rules": skill.rules,
            "reply_style": skill.reply_style,
            "raw_markdown": skill.raw_markdown,
        }

        # Language detection (simple heuristic)
        detected_language = _detect_language(body)

        return {
            "memory_facts": memory_facts,
            "skill_profile": skill_dict,
            "detected_language": detected_language,
            "trace_log": [_trace("load_context", f"lang={detected_language} memory={len(memory_facts)} facts")],
        }

    # ── Node 2: router ──

    def _get_node_thinking(self, state: CustomerServiceState, node_name: str) -> bool:
        """Get enable_thinking setting for a specific node."""
        cfg = state.get("node_config", {})
        return cfg.get(node_name, {}).get("enable_thinking", False)

    def _get_thinking_budget(self, state: CustomerServiceState, node_name: str) -> int:
        """Get thinking_budget setting for a specific node. Default 600."""
        cfg = state.get("node_config", {})
        return cfg.get(node_name, {}).get("thinking_budget", 600)

    def _get_temperature(self, state: CustomerServiceState) -> float:
        """Get temperature from state or default."""
        return state.get("llm_temperature", 0.1) or 0.1

    def _get_custom_prompt(self, state: CustomerServiceState, node_name: str) -> str:
        """Get custom prompt override for a specific node, or empty string."""
        cfg = state.get("node_config", {})
        return cfg.get(node_name, {}).get("custom_prompt", "")

    async def router(self, state: CustomerServiceState) -> dict[str, Any]:
        """Route the email to the correct standard process. 1 LLM call with rule fallback."""
        body = state.get("body", "")
        old_emails = state.get("old_emails", "")
        subject = state.get("subject", "")

        # Try LLM routing
        custom = self._get_custom_prompt(state, "router")
        system_msg = custom if custom else ROUTER_SYSTEM.format(policy_routing_rules=self.policy_routing_text)
        user_msg = build_router_user_prompt(body, old_emails, subject)

        basic_info = {}
        selected_policy = ""

        try:
            raw, reasoning = await self.llm.chat_with_thinking_stream(
                [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                ],
                temperature=self._get_temperature(state),
                enable_thinking=self._get_node_thinking(state, "router"),
                token_callback=self._make_node_token_cb("router"),
                thinking_budget=self._get_thinking_budget(state, "router"),
            )
            parsed = _parse_json_from_llm(raw)
            basic_info = parsed.get("basic_info", {})
            selected_policy = parsed.get("selected_policy", "")
            logger.info("LLM router selected: %s", selected_policy)
        except Exception:
            logger.exception("LLM router failed, falling back to rule-based routing")

        # Fallback to rule-based router if LLM failed
        if not selected_policy:
            from smart_customer_service.router_agent import BasicInfo as BI
            bi = BI(
                order_id=basic_info.get("order_id"),
                has_order=basic_info.get("has_order", False),
                is_pre_sales=basic_info.get("is_pre_sales", False),
                is_after_sales=basic_info.get("is_after_sales", False),
            )
            policies = self.rule_router.route(body, bi)
            selected_policy = policies[0] if policies else "售后咨询处理流程.md"
            logger.info("Rule router fallback selected: %s", selected_policy)

        # Load the full policy content
        policy_content = self.policy_loader.get_policy(selected_policy)

        return {
            "basic_info": basic_info,
            "selected_policy": selected_policy,
            "policy_content": policy_content,
            "trace_log": [_trace("router", f"policy={selected_policy}", reasoning=reasoning if reasoning else "")],
        }

    # ── Node 3: retriever ──

    async def retriever(self, state: CustomerServiceState) -> dict[str, Any]:
        """Search the knowledge base. No LLM call."""
        body = state.get("body", "")
        brand = state.get("brand", "")
        basic_info = state.get("basic_info", {})
        product_model = basic_info.get("product_model")

        retrieved = self.knowledge_retriever.search_as_text(
            query=body, brand=brand, product_model=product_model, top_k=5
        )

        return {
            "retrieved_knowledge": retrieved,
            "trace_log": [_trace("retriever", f"retrieved {len(retrieved)} chars")],
        }

    # ── Node 4: solver (ReAct core) ──

    async def solver(self, state: CustomerServiceState) -> dict[str, Any]:
        """One ReAct iteration: think → decide (call_tool / generate_reply / need_human)."""
        skill = state.get("skill_profile", {})
        policy_content = state.get("policy_content", "")
        max_iter = state.get("max_react_iterations", 7)

        custom_solver = self._get_custom_prompt(state, "solver")
        system_msg = custom_solver if custom_solver else build_solver_system(
            skill_raw_markdown=skill.get("raw_markdown", ""),
            policy_content=policy_content,
            max_iterations=max_iter,
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

        # If human instructions were already provided (retry after human input),
        # do NOT request human intervention again — force generate_reply instead
        has_human_instruction = "[人工客服指令]" in state.get("old_emails", "") or "[人工客服指令]" in state.get("body", "")
        if decision == "need_human" and has_human_instruction:
            decision = "generate_reply"
            # Use existing reply_content if available, or synthesize from thought
            if not parsed.get("reply_content"):
                parsed["reply_content"] = thought

        result: dict[str, Any] = {
            "react_iteration": iteration,
            "solver_decision": decision,
            "trace_log": [_trace("solver", f"iter={iteration} decision={decision}", reasoning=reasoning)],
        }

        if decision == "call_tool":
            tool_call = parsed.get("tool_call", {})
            result["pending_tool_call"] = tool_call
            result["thought_history"] = [{
                "thought": thought,
                "action": f"调用工具: {tool_call.get('name', '?')}({_safe_json(tool_call.get('params', {}))})",
                "observation": "",
            }]
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

    # ── Node 5: tool_executor ──

    async def tool_executor(self, state: CustomerServiceState) -> dict[str, Any]:
        """Execute the pending tool call via the tool registry. No LLM call."""
        pending = state.get("pending_tool_call", {})
        tool_name = pending.get("name", "")
        tool_params = pending.get("params", {})

        logger.info("Executing tool: %s params=%s", tool_name, tool_params)
        result = await self.tool_registry.call(tool_name, tool_params)

        # Update the last thought_history entry with the observation
        observation = _safe_json(result)
        thought_update = [{
            "thought": "",
            "action": "",
            "observation": observation,
        }]

        # Merge tool result into accumulated results
        tool_results = {tool_name: result}

        return {
            "tool_results": tool_results,
            "pending_tool_call": {},
            "thought_history": thought_update,
            "trace_log": [_trace("tool_executor", f"tool={tool_name} status={result.get('status', '?')}")],
        }

    # ── Node 6: reply_generator ──

    async def reply_generator(self, state: CustomerServiceState) -> dict[str, Any]:
        """Format the draft reply into a proper email. 1 LLM call."""
        draft = state.get("draft_reply", "")
        skill = state.get("skill_profile", {})
        lang = state.get("detected_language", "en")

        # If draft is already well-formatted, skip LLM call
        if _looks_like_complete_email(draft, skill):
            return {
                "draft_reply": draft,
                "trace_log": [_trace("reply_generator", "draft already formatted, skipped LLM")],
            }

        custom_gen = self._get_custom_prompt(state, "reply_generator")
        prompt = custom_gen if custom_gen else REPLY_GENERATOR_SYSTEM.format(
            detected_language=lang,
            tone=skill.get("tone", "professional"),
            greeting=skill.get("greeting", "Hello,"),
            closing=skill.get("closing", "Best regards,"),
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

    # ── Node 7: reviewer ──

    async def reviewer(self, state: CustomerServiceState) -> dict[str, Any]:
        """Review the draft reply for factual accuracy, compliance, and tone. 1 LLM call."""
        skill = state.get("skill_profile", {})
        custom_rev = self._get_custom_prompt(state, "reviewer")
        prompt = custom_rev if custom_rev else REVIEWER_SYSTEM.format(
            policy_content=state.get("policy_content", "（无）"),
            skill_profile=skill.get("raw_markdown", "（无）"),
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
            # Reset solver state for re-entry
            result["solver_decision"] = ""
            result["react_iteration"] = 0

        return result

    # ── Node 8: finalize ──

    async def finalize(self, state: CustomerServiceState) -> dict[str, Any]:
        """Handle need_human and max_reflections scenarios. Save memory. No LLM call."""
        customer_email = state.get("customer_email", "")
        draft = state.get("draft_reply", "")
        final = state.get("final_reply", "")

        result: dict[str, Any] = {
            "trace_log": [_trace("finalize")],
        }

        # If we got here via max_reflections, use the draft as-is
        if not final and draft:
            result["final_reply"] = draft
            result["requires_human"] = True

        # If we got here via need_human, ensure flag is set
        if state.get("solver_decision") == "need_human":
            result["requires_human"] = True
            if not final and not draft:
                result["final_reply"] = "此邮件需要人工客服处理。"

        # Save customer memory
        if customer_email:
            body = state.get("body", "")
            summary = f"处理了关于 {state.get('selected_policy', '未知')} 的问题"
            facts = []
            basic_info = state.get("basic_info", {})
            if basic_info.get("order_id"):
                facts.append(f"订单号: {basic_info['order_id']}")
            if basic_info.get("product_model"):
                facts.append(f"产品型号: {basic_info['product_model']}")
            try:
                self.memory_store.update(customer_email, facts, summary)
            except Exception:
                logger.exception("Failed to save memory for %s", customer_email)

        return result


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _detect_language(text: str) -> str:
    """Simple heuristic language detection."""
    if not text:
        return "en"
    # Count CJK characters
    cjk_count = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    if cjk_count > len(text) * 0.1:
        return "zh"
    # Check for common non-English patterns
    text_lower = text.lower()
    if any(w in text_lower for w in ["bonjour", "merci", "cordialement"]):
        return "fr"
    if any(w in text_lower for w in ["hola", "gracias", "saludos"]):
        return "es"
    if any(w in text_lower for w in ["hallo", "danke", "grüße"]):
        return "de"
    return "en"


def _looks_like_complete_email(text: str, skill: dict) -> bool:
    """Check if the text already looks like a formatted email."""
    if not text or len(text) < 20:
        return False
    greeting = skill.get("greeting", "").lower()
    closing = skill.get("closing", "").lower()
    text_lower = text.lower()
    has_greeting = greeting and greeting.rstrip(",").rstrip() in text_lower[:100]
    has_closing = closing and closing.rstrip(",").rstrip() in text_lower[-200:]
    return has_greeting and has_closing
