"""FastAPI backend for the Smart CS LangGraph customer service system."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from sse_starlette.sse import EventSourceResponse

load_dotenv()

from smart_customer_service.config import AppConfig
from smart_customer_service.graph.builder import build_graph
from smart_customer_service.graph.nodes import NodeFactory
from smart_customer_service.graph.state import CustomerServiceState
from smart_customer_service.knowledge_retriever import KnowledgeRetriever
from smart_customer_service.llm.openai_provider import OpenAICompatibleLLM
from smart_customer_service.memory import MemoryStore
from smart_customer_service.policy_loader import PolicyLoader
from smart_customer_service.router_agent import RouterAgent
from smart_customer_service.skills import SkillLoader
from smart_customer_service.tcs_client import TCSClient
from smart_customer_service.tool_registry import ToolRegistry

from api.models import ReplyRequest, HealthResponse, InfoResponse, PromptsResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent


# ─── Bootstrap ───────────────────────────────

def create_dependencies():
    """Wire up all dependencies."""
    cfg = AppConfig.from_base_dir()

    llm = OpenAICompatibleLLM(
        base_url=cfg.llm_base_url,
        api_key=cfg.llm_api_key,
        model=cfg.llm_model,
    )

    tcs_client = TCSClient(base_url=cfg.tcs_base_url, token=cfg.tcs_token)
    tool_registry = ToolRegistry(tcs_client)

    knowledge_retriever = KnowledgeRetriever(cfg.knowledge_full_file)
    tool_registry.set_knowledge_search(knowledge_retriever.search)

    policy_loader = PolicyLoader(cfg.policy_dir)
    memory_store = MemoryStore(cfg.memory_file)
    skill_loader = SkillLoader(cfg.skills_dir)
    rule_router = RouterAgent(cfg.policy_routing_file)

    policy_routing_text = ""
    if cfg.policy_routing_file.exists():
        policy_routing_text = cfg.policy_routing_file.read_text(encoding="utf-8")

    node_factory = NodeFactory(
        llm=llm,
        memory_store=memory_store,
        skill_loader=skill_loader,
        policy_loader=policy_loader,
        knowledge_retriever=knowledge_retriever,
        tool_registry=tool_registry,
        rule_router=rule_router,
        policy_routing_text=policy_routing_text,
    )

    compiled_graph = build_graph(node_factory)
    return compiled_graph, cfg, llm, tcs_client, policy_loader


graph, cfg, llm, tcs_client, policy_loader = create_dependencies()


# ─── FastAPI App ─────────────────────────────

app = FastAPI(
    title="Smart CS API",
    version="4.0",
    description="LangGraph-powered intelligent customer service API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── API Routes ──────────────────────────────

@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/web/index.html")


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse()


@app.get("/info", response_model=InfoResponse)
async def info():
    return InfoResponse(
        llm_model=cfg.llm_model,
        policies=policy_loader.list_policies(),
    )


@app.get("/prompts", response_model=PromptsResponse)
async def prompts():
    from smart_customer_service.prompt_templates import (
        ROUTER_SYSTEM, SOLVER_SYSTEM, REPLY_GENERATOR_SYSTEM, REVIEWER_SYSTEM,
    )
    return PromptsResponse(
        router=ROUTER_SYSTEM,
        solver=SOLVER_SYSTEM,
        reply_generator=REPLY_GENERATOR_SYSTEM,
        reviewer=REVIEWER_SYSTEM,
    )


def _build_initial_state(req: ReplyRequest) -> CustomerServiceState:
    """Build LangGraph initial state from request."""
    return {
        "customer_email": req.customer_email,
        "brand": req.brand,
        "subject": req.subject,
        "body": req.body,
        "old_emails": req.old_emails,
        "auto_execute": req.auto_execute,
        "max_react_iterations": req.max_react_iterations,
        "max_reflections": req.max_reflections,
        "react_iteration": 0,
        "reflection_count": 0,
        "thought_history": [],
        "tool_results": {},
        "trace_log": [],
        "requires_human": False,
        "review_passed": False,
        "node_config": req.node_config,
        "llm_temperature": req.llm_temperature,
    }


@app.post("/api/reply")
async def reply(req: ReplyRequest):
    """Process customer email (non-streaming)."""
    initial_state = _build_initial_state(req)

    try:
        final_state = await graph.ainvoke(initial_state)
    except Exception as exc:
        logger.exception("Error processing request")
        raise HTTPException(status_code=500, detail=str(exc))

    return {
        "final_reply": final_state.get("final_reply", ""),
        "reply_type": final_state.get("reply_type", "NewEmail"),
        "selected_policy": final_state.get("selected_policy", ""),
        "requires_human": final_state.get("requires_human", False),
        "human_tasks": final_state.get("human_tasks", []),
        "tool_results": final_state.get("tool_results", {}),
        "thought_history": final_state.get("thought_history", []),
        "trace_log": final_state.get("trace_log", []),
        "review_passed": final_state.get("review_passed", False),
        "basic_info": final_state.get("basic_info", {}),
        "detected_language": final_state.get("detected_language", "en"),
        "retrieved_knowledge": final_state.get("retrieved_knowledge", "")[:500],
    }


@app.post("/api/reply/stream")
async def reply_stream(req: ReplyRequest):
    """Process customer email with SSE streaming."""
    initial_state = _build_initial_state(req)

    async def event_generator():
        prev_node = None
        try:
            async for chunk in graph.astream(initial_state):
                for node_name, update in chunk.items():
                    if node_name != prev_node:
                        yield {
                            "event": "node",
                            "data": json.dumps({"node": node_name, "status": "start"}, ensure_ascii=False),
                        }
                        prev_node = node_name

                    trace_entries = update.get("trace_log", [])
                    event_data = {
                        "node": node_name,
                        "status": "done",
                        "trace": trace_entries,
                    }
                    for key in (
                        "selected_policy", "basic_info", "retrieved_knowledge",
                        "thought_history", "tool_results", "draft_reply",
                        "review_passed", "review_feedback", "final_reply",
                        "requires_human", "human_tasks", "detected_language",
                        "reply_type", "solver_decision",
                    ):
                        if key in update:
                            event_data[key] = update[key]

                    yield {
                        "event": "node",
                        "data": json.dumps(event_data, ensure_ascii=False),
                    }
        except Exception as exc:
            yield {
                "event": "error",
                "data": json.dumps({"node": "__error__", "error": str(exc)}, ensure_ascii=False),
            }

        yield {
            "event": "done",
            "data": json.dumps({"node": "__done__"}, ensure_ascii=False),
        }

    return EventSourceResponse(event_generator())


# ─── Backward compatibility: also support /reply/stream ──
@app.post("/reply/stream")
async def reply_stream_compat(req: ReplyRequest):
    """Backward-compatible SSE streaming endpoint."""
    return await reply_stream(req)


@app.post("/reply")
async def reply_compat(req: ReplyRequest):
    """Backward-compatible reply endpoint."""
    return await reply(req)


# ─── Static Files ────────────────────────────

# Serve old frontend for backward compatibility
if (BASE_DIR / "frontend").is_dir():
    app.mount("/frontend", StaticFiles(directory=str(BASE_DIR / "frontend")), name="frontend")

# Serve new React frontend
web_dist = BASE_DIR / "web" / "dist"
if web_dist.is_dir():
    app.mount("/web", StaticFiles(directory=str(web_dist), html=True), name="web")


# ─── Shutdown ────────────────────────────────

@app.on_event("shutdown")
async def shutdown():
    await llm.close()
    await tcs_client.close()


# ─── Entry point ─────────────────────────────

def main():
    import uvicorn

    print("=" * 60)
    print("  Smart CS v4.0 — FastAPI + LangGraph")
    print("=" * 60)
    print(f"  LLM Model:  {cfg.llm_model}")
    print(f"  TCS API:    {cfg.tcs_base_url}")
    print(f"  Listening:   http://{cfg.service_host}:{cfg.service_port}")
    print("=" * 60)
    print()
    print("  API Docs:    http://localhost:8001/docs")
    print("  Frontend:    http://localhost:8001/web/index.html")
    print()
    print("  Press Ctrl+C to stop")
    print("=" * 60)

    uvicorn.run(
        app,
        host=cfg.service_host,
        port=cfg.service_port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
