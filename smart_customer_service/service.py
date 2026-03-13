from __future__ import annotations

from pathlib import Path

from smart_customer_service.agents import ExecutorAgent, RetrieverAgent, ReviewerAgent, RouterAgent, SolverAgent
from smart_customer_service.config import AppConfig
from smart_customer_service.knowledge import KnowledgeStore
from smart_customer_service.memory import MemoryStore
from smart_customer_service.models import WorkflowState
from smart_customer_service.skills import SkillLoader
from smart_customer_service.tools import BusinessToolRegistry
from smart_customer_service.workflow import CustomerServiceWorkflow


class CustomerServiceApp:
    def __init__(self, base_dir: Path | None = None) -> None:
        self.config = AppConfig.from_base_dir(base_dir)
        self.skill_loader = SkillLoader(self.config.skills_dir)
        self.knowledge_store = KnowledgeStore(self.config.knowledge_file, self.config.graph_file)
        self.memory_store = MemoryStore(self.config.memory_file)
        self.tool_registry = BusinessToolRegistry(self.config.business_data_file)
        self.workflow = CustomerServiceWorkflow(
            router=RouterAgent(),
            retriever=RetrieverAgent(self.knowledge_store),
            solver=SolverAgent(self.tool_registry),
            executor=ExecutorAgent(self.tool_registry),
            reviewer=ReviewerAgent(),
        )

    def handle_request(self, payload: dict) -> dict:
        self._validate(payload)
        memory = self.memory_store.get(payload["customer_email"])
        state = WorkflowState(
            customer_email=payload["customer_email"],
            brand=payload["brand"].lower(),
            subject=payload["subject"],
            body=payload["body"],
            auto_execute=bool(payload.get("auto_execute", False)),
            conversation_history=payload.get("conversation_history", []),
            memory_facts=memory.get("facts", []),
        )
        skill = self.skill_loader.load(state.brand)
        final_state = self.workflow.run(state, skill)

        facts = self._extract_facts(final_state)
        summary = f"{final_state.subject}: intents={','.join(intent.intent_type for intent in final_state.intents)}"
        self.memory_store.update(final_state.customer_email, facts, summary)
        return final_state.as_dict()

    def _validate(self, payload: dict) -> None:
        required = {"customer_email", "brand", "subject", "body"}
        missing = sorted(field for field in required if not payload.get(field))
        if missing:
            raise ValueError(f"Missing required fields: {', '.join(missing)}")

    def _extract_facts(self, state: WorkflowState) -> list[str]:
        facts = [f"preferred_language={state.detected_language}"]
        for intent in state.intents:
            if intent.order_id:
                facts.append(f"order_id={intent.order_id}")
        for action in state.actions:
            facts.append(f"action={action.action_type}:{action.status}")
        return facts
