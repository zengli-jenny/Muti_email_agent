"""Build and compile the LangGraph StateGraph for customer service."""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from smart_customer_service.graph.edges import decide_review_result, decide_solver_next
from smart_customer_service.graph.nodes import NodeFactory
from smart_customer_service.graph.state import CustomerServiceState


def build_graph(node_factory: NodeFactory) -> StateGraph:
    """Construct the full workflow graph and return the compiled graph.

    Topology:
        load_context → router → solver ←→ tool_executor
                                    ↓
                            reply_generator → reviewer → END
                                                ↓ (rejected)
                                              solver (with feedback)
                                                ↓ (max_reflections)
                                              finalize → END

    Knowledge retrieval is no longer a fixed node — the solver calls
    the 知识检索工具 tool on demand via tool_executor.
    """
    graph = StateGraph(CustomerServiceState)

    # ── Add nodes ──
    graph.add_node("load_context", node_factory.load_context)
    graph.add_node("router", node_factory.router)
    graph.add_node("solver", node_factory.solver)
    graph.add_node("tool_executor", node_factory.tool_executor)
    graph.add_node("reply_generator", node_factory.reply_generator)
    graph.add_node("reviewer", node_factory.reviewer)
    graph.add_node("finalize", node_factory.finalize)

    # ── Linear edges ──
    graph.set_entry_point("load_context")
    graph.add_edge("load_context", "router")
    graph.add_edge("router", "solver")

    # ── Solver conditional: call_tool / generate_reply / need_human ──
    graph.add_conditional_edges(
        "solver",
        decide_solver_next,
        {
            "call_tool": "tool_executor",
            "generate_reply": "reply_generator",
            "need_human": "finalize",
        },
    )

    # tool_executor always loops back to solver
    graph.add_edge("tool_executor", "solver")

    # reply_generator → reviewer
    graph.add_edge("reply_generator", "reviewer")

    # ── Reviewer conditional: approved / rejected / max_reflections ──
    graph.add_conditional_edges(
        "reviewer",
        decide_review_result,
        {
            "approved": END,
            "rejected": "solver",
            "max_reflections": "finalize",
        },
    )

    # finalize → END
    graph.add_edge("finalize", END)

    return graph.compile()


def build_resume_graph(node_factory: NodeFactory) -> StateGraph:
    """Build a subgraph that starts from solver — used after human intervention.

    Skips load_context and router since those results are already in state.

    Topology:
        solver ←→ tool_executor
          ↓
        reply_generator → reviewer → END
                            ↓ (rejected)
                          solver
                            ↓ (max_reflections)
                          finalize → END
    """
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

    return graph.compile()
