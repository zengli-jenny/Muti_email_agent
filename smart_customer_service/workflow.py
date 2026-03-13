from __future__ import annotations

from smart_customer_service.agents import ExecutorAgent, RetrieverAgent, ReviewerAgent, RouterAgent, SolverAgent
from smart_customer_service.models import WorkflowState
from smart_customer_service.skills import SkillProfile


class CustomerServiceWorkflow:
    def __init__(
        self,
        router: RouterAgent,
        retriever: RetrieverAgent,
        solver: SolverAgent,
        executor: ExecutorAgent,
        reviewer: ReviewerAgent,
    ) -> None:
        self.router = router
        self.retriever = retriever
        self.solver = solver
        self.executor = executor
        self.reviewer = reviewer

    def run(self, state: WorkflowState, skill: SkillProfile) -> WorkflowState:
        state = self.router.route(state)
        state = self.retriever.retrieve(state)
        state = self.solver.solve(state, skill)
        state = self.executor.execute(state)

        review = self.reviewer.review(state, skill)
        state.review_passed = review.passed
        state.review_feedback = review.feedback
        state.final_reply = review.revised_reply

        if not review.passed and state.reflection_count < 1:
            state.reflection_count += 1
            state = self.solver.solve(state, skill)
            state = self.executor.execute(state)
            review = self.reviewer.review(state, skill)
            state.review_passed = review.passed
            state.review_feedback = review.feedback
            state.final_reply = review.revised_reply

        state.metrics = {
            "intent_count": len(state.intents),
            "retrieval_count": len(state.retrieved_items),
            "tool_call_count": len(state.tool_calls),
            "action_count": len(state.actions),
            "iterations": state.iterations,
            "reflection_count": state.reflection_count,
        }
        return state
