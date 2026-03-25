"""Build and compile the LangGraph StateGraph for customer service.

Router node has been removed. The workflow is now:
  load_context → solver ←→ tool_executor
                    ↓
            reply_generator → reviewer → END
                                ↓ (rejected)
                              solver (with feedback)
                                ↓ (max_reflections)
                              finalize → END

Skill selection happens inside the solver via load_skill tool calls.
"""

from __future__ import annotations

from typing import Any

from langgraph.graph import END, StateGraph

from smart_customer_service.graph.edges import decide_review_result, decide_solver_next
from smart_customer_service.graph.nodes import NodeFactory
from smart_customer_service.graph.state import CustomerServiceState


def build_graph(node_factory: NodeFactory, *, checkpointer: Any = None) -> StateGraph:
    graph = StateGraph(CustomerServiceState)

    graph.add_node("load_context", node_factory.load_context)
    graph.add_node("solver", node_factory.solver)
    graph.add_node("tool_executor", node_factory.tool_executor)
    graph.add_node("reply_generator", node_factory.reply_generator)
    graph.add_node("reviewer", node_factory.reviewer)
    graph.add_node("finalize", node_factory.finalize)

    graph.set_entry_point("load_context")
    graph.add_edge("load_context", "solver")

    graph.add_conditional_edges(
        "solver",
        decide_solver_next,
        {
            "call_tool": "tool_executor",
            "generate_reply": "reply_generator",
            "need_human": "finalize",
        },
    )

    graph.add_edge("tool_executor", "solver")
    graph.add_edge("reply_generator", "reviewer")

    graph.add_conditional_edges(
        "reviewer",
        decide_review_result,
        {
            "approved": END,
            "rejected": "solver",
            "max_reflections": "finalize",
        },
    )

    graph.add_edge("finalize", END)

    return graph.compile(checkpointer=checkpointer)


def build_resume_graph(node_factory: NodeFactory, *, checkpointer: Any = None) -> StateGraph:
    """Build a subgraph that starts from solver — used after human intervention."""
    graph = StateGraph(CustomerServiceState)

    graph.add_node("solver", node_factory.solver)
    graph.add_node("tool_executor", node_factory.tool_executor)
    graph.add_node("reply_generator", node_factory.reply_generator)
    graph.add_node("reviewer", node_factory.reviewer)
    graph.add_node("finalize", node_factory.finalize)

    graph.set_entry_point("solver")

    graph.add_conditional_edges(
        "solver",
        decide_solver_next,
        {
            "call_tool": "tool_executor",
            "generate_reply": "reply_generator",
            "need_human": "finalize",
        },
    )
    graph.add_edge("tool_executor", "solver")
    graph.add_edge("reply_generator", "reviewer")
    graph.add_conditional_edges(
        "reviewer",
        decide_review_result,
        {
            "approved": END,
            "rejected": "solver",
            "max_reflections": "finalize",
        },
    )
    graph.add_edge("finalize", END)

    return graph.compile(checkpointer=checkpointer)
