from __future__ import annotations

import re

from smart_customer_service.models import ActionDecision, Intent, ReviewOutcome, ToolCall, WorkflowState
from smart_customer_service.skills import SkillProfile
from smart_customer_service.tools import BusinessToolRegistry


ORDER_ID_PATTERN = re.compile(r"#?[A-Za-z]{3,}\d{4,}")


class RouterAgent:
    intent_keywords = {
        "refund": {"refund", "money back", "return", "cancel"},
        "exchange": {"exchange", "replace", "replacement"},
        "logistics": {"tracking", "where is", "not received", "delivered", "shipment", "package"},
        "consultation": {"compatible", "bluetooth", "feature", "recommend", "work with", "support"},
        "complaint": {"complaint", "unhappy", "angry", "terrible", "upset"},
    }

    def route(self, state: WorkflowState) -> WorkflowState:
        body = state.body.strip()
        state.detected_language = self._detect_language(body)
        order_ids = ORDER_ID_PATTERN.findall(body)
        segments = re.split(r"[.!?\n]+", body)
        intents: list[Intent] = []

        for segment in segments:
            normalized = segment.strip().lower()
            if not normalized:
                continue
            matched = False
            for intent_type, keywords in self.intent_keywords.items():
                if intent_type == "exchange" and any(keyword in normalized for keyword in {"nib", "compatible", "works with"}):
                    continue
                if any(keyword in normalized for keyword in keywords):
                    intents.append(
                        Intent(
                            intent_type=intent_type,
                            summary=segment.strip(),
                            order_id=order_ids[0].replace("#", "").upper() if order_ids else None,
                            confidence=0.85,
                        )
                    )
                    matched = True
            if not matched and len(normalized.split()) >= 4:
                intents.append(
                    Intent(
                        intent_type="consultation",
                        summary=segment.strip(),
                        order_id=order_ids[0].replace("#", "").upper() if order_ids else None,
                        confidence=0.5,
                    )
                )

        if not intents:
            intents.append(Intent(intent_type="consultation", summary=body, confidence=0.3))

        deduplicated: dict[tuple[str, str | None], Intent] = {}
        for intent in intents:
            key = (intent.intent_type, intent.order_id)
            deduplicated.setdefault(key, intent)

        state.intents = list(deduplicated.values())
        return state

    def _detect_language(self, text: str) -> str:
        if re.search(r"[\u3040-\u30ff]", text):
            return "ja"
        if re.search(r"\b(der|die|und|nicht)\b", text.lower()):
            return "de"
        if re.search(r"\b(bonjour|merci|commande)\b", text.lower()):
            return "fr"
        return "en"


class RetrieverAgent:
    def __init__(self, knowledge_store) -> None:
        self.knowledge_store = knowledge_store

    def retrieve(self, state: WorkflowState) -> WorkflowState:
        merged = []
        for intent in state.intents:
            query = f"{state.subject} {intent.summary} {state.body}"
            merged.extend(self.knowledge_store.hybrid_search(state.brand, query, top_k=3))

        unique = {}
        for item in merged:
            current = unique.get(item.item_id)
            if current is None or item.score > current.score:
                unique[item.item_id] = item
        state.retrieved_items = sorted(unique.values(), key=lambda item: item.score, reverse=True)[:5]
        return state


class SolverAgent:
    def __init__(self, tool_registry: BusinessToolRegistry) -> None:
        self.tool_registry = tool_registry

    def solve(self, state: WorkflowState, skill: SkillProfile) -> WorkflowState:
        state.actions = []
        state.tool_calls = []
        state.iterations = 0
        sections: list[str] = []

        if state.review_feedback:
            sections.append("I reviewed the previous draft and corrected the internal issues.")

        for intent in state.intents:
            if intent.intent_type == "refund":
                sections.append(self._handle_refund(state, intent, skill))
            elif intent.intent_type == "exchange":
                sections.append(self._handle_exchange(state, intent))
            elif intent.intent_type == "logistics":
                sections.append(self._handle_logistics(state, intent))
            elif intent.intent_type == "complaint":
                sections.append(self._handle_complaint(state))
            else:
                sections.append(self._handle_consultation(state))

        continuity = self._memory_context(state)
        state.draft_reply = "\n\n".join(
            part for part in [skill.greeting, continuity, *sections, skill.closing] if part
        )
        return state

    def _handle_refund(self, state: WorkflowState, intent: Intent, skill: SkillProfile) -> str:
        state.iterations += 1
        if not intent.order_id:
            state.requires_human = True
            return "I can help with the refund, but I need the order number first."

        order = self._call_tool(state, "query_order", {"order_id": intent.order_id})
        if order["status"] != "ok":
            state.requires_human = True
            return f"I could not find order {intent.order_id}. Please confirm the order number."

        amount = float(order.get("refund_amount", 0.0))
        action = ActionDecision(
            action_type="refund",
            status="planned",
            description=f"Refund {amount:.2f} {order.get('currency', 'USD')} for order {intent.order_id}",
            payload={"order_id": intent.order_id, "amount": amount, "reason": "customer_requested_refund"},
            requires_human=amount > skill.approval_threshold_usd,
        )
        state.actions.append(action)

        if action.requires_human:
            state.requires_human = True
            return (
                f"I checked order {intent.order_id}. The refund amount is {amount:.2f} {order.get('currency', 'USD')}, "
                "which requires manual approval before it can be processed."
            )
        return (
            f"I checked order {intent.order_id}. It is eligible for a refund of {amount:.2f} {order.get('currency', 'USD')}. "
            "If auto-processing is enabled, I can submit that refund directly."
        )

    def _handle_exchange(self, state: WorkflowState, intent: Intent) -> str:
        state.iterations += 1
        if not intent.order_id:
            state.requires_human = True
            return "I can help with the exchange, but I need the order number and target SKU."

        requested_sku = self._extract_requested_sku(state.body)
        if not requested_sku:
            state.requires_human = True
            return "Please tell me the target SKU so I can check stock for the exchange."

        inventory = self._call_tool(state, "check_inventory", {"sku": requested_sku})
        if inventory["status"] != "ok" or inventory.get("available", 0) <= 0:
            state.requires_human = True
            return f"I checked stock for {requested_sku}, and it is currently unavailable."

        state.actions.append(
            ActionDecision(
                action_type="exchange",
                status="planned",
                description=f"Create exchange for order {intent.order_id} to SKU {requested_sku}",
                payload={"order_id": intent.order_id, "new_sku": requested_sku},
            )
        )
        return f"I confirmed that SKU {requested_sku} is in stock and the exchange can be created for order {intent.order_id}."

    def _handle_logistics(self, state: WorkflowState, intent: Intent) -> str:
        state.iterations += 1
        if not intent.order_id:
            return "Please share the order number so I can check shipping."

        order = self._call_tool(state, "query_order", {"order_id": intent.order_id})
        if order["status"] != "ok":
            return f"I could not locate order {intent.order_id}. Please verify the order number."

        logistics = self._call_tool(state, "track_logistics", {"order_id": intent.order_id})
        if logistics["status"] != "ok":
            return f"I found order {intent.order_id}, but there is no tracking update available yet."

        if logistics.get("delivery_status") == "delivered":
            proof = self._call_tool(state, "get_delivery_proof", {"tracking_number": logistics["tracking_number"]})
            return (
                f"I checked order {intent.order_id}. The package shows delivered on {logistics.get('delivered_at')}. "
                f"Delivery proof is available: {proof.get('delivery_proof')}. Please check the address, mailbox, neighbors, "
                "and building reception first. If it is still missing after that, we can continue with a claim or refund path."
            )

        return (
            f"I checked order {intent.order_id}. The latest tracking status is {logistics.get('delivery_status')} "
            f"at {logistics.get('last_update')}."
        )

    def _handle_consultation(self, state: WorkflowState) -> str:
        if not state.retrieved_items:
            return "I could not find a precise answer yet. Please share the product model or SKU."
        top_items = state.retrieved_items[:2]
        facts = "; ".join(f"{item.title}: {item.content}" for item in top_items)
        return f"Based on our knowledge base, here is the most relevant information: {facts}"

    def _handle_complaint(self, state: WorkflowState) -> str:
        state.requires_human = True
        return (
            "I am sorry about the experience. I have captured this as a complaint case and recommend manual review if the issue "
            "is not resolved by the checks below."
        )

    def _extract_requested_sku(self, body: str) -> str | None:
        match = re.search(r"\b([A-Z]{2,}-[A-Z0-9-]{2,})\b", body)
        return match.group(1).upper() if match else None

    def _memory_context(self, state: WorkflowState) -> str:
        if not state.memory_facts:
            return ""
        return f"For continuity, I also checked your previous case details: {'; '.join(state.memory_facts[-3:])}."

    def _call_tool(self, state: WorkflowState, name: str, payload: dict) -> dict:
        result = self.tool_registry.call(name, payload)
        state.tool_calls.append(ToolCall(name=name, payload=payload, result=result))
        return result


class ExecutorAgent:
    def __init__(self, tool_registry: BusinessToolRegistry) -> None:
        self.tool_registry = tool_registry

    def execute(self, state: WorkflowState) -> WorkflowState:
        notes: list[str] = []
        for action in state.actions:
            if action.requires_human:
                action.status = "pending_manual_approval"
                state.requires_human = True
                continue
            if not state.auto_execute:
                action.status = "awaiting_auto_execute"
                continue

            if action.action_type == "refund":
                result = self.tool_registry.call("execute_refund", action.payload)
                state.tool_calls.append(ToolCall(name="execute_refund", payload=action.payload, result=result))
                action.status = "executed" if result["status"] == "ok" else "failed"
                if result["status"] == "ok":
                    notes.append(f"The refund for order {result['order_id']} has now been submitted.")
            elif action.action_type == "exchange":
                result = self.tool_registry.call("create_exchange", action.payload)
                state.tool_calls.append(ToolCall(name="create_exchange", payload=action.payload, result=result))
                action.status = "executed" if result["status"] == "ok" else "failed"
                if result["status"] == "ok":
                    notes.append(f"The exchange for order {result['order_id']} has now been created.")

        if notes:
            state.draft_reply = f"{state.draft_reply}\n\n{' '.join(notes)}"
        return state


class ReviewerAgent:
    def review(self, state: WorkflowState, skill: SkillProfile) -> ReviewOutcome:
        blocking_feedback: list[str] = []
        reply = state.draft_reply

        if not reply.startswith(skill.greeting):
            blocking_feedback.append("Reply is missing the brand greeting.")
            reply = f"{skill.greeting}\n\n{reply}"

        for intent in state.intents:
            if intent.order_id and intent.order_id not in reply:
                blocking_feedback.append(f"Reply should mention order {intent.order_id}.")
                reply = reply.replace(skill.closing, f"Order reference: {intent.order_id}.\n\n{skill.closing}")

        for action in state.actions:
            amount = float(action.payload.get("amount", 0.0))
            if action.action_type == "refund" and action.status == "executed" and amount > skill.approval_threshold_usd:
                blocking_feedback.append("Refund exceeded approval threshold and should not have been auto-executed.")

        if skill.tone.lower().startswith("warm") and "sorry" not in reply.lower():
            reply = reply.replace(skill.greeting, f"{skill.greeting}\n\nI am sorry for the inconvenience.")

        return ReviewOutcome(passed=not blocking_feedback, feedback=blocking_feedback, revised_reply=reply)
