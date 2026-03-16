"""FastAPI backend for the Smart CS LangGraph customer service system."""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from sse_starlette.sse import EventSourceResponse

from smart_customer_service.config import AppConfig
from smart_customer_service.graph.builder import build_graph, build_resume_graph
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

from api.models import ReplyRequest, ResumeRequest, HealthResponse, InfoResponse, PromptsResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent


# ─── Bootstrap ───────────────────────────────

def _create_dependencies():
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
    tool_registry.set_knowledge_search(knowledge_retriever.search_as_text)

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
    compiled_resume_graph = build_resume_graph(node_factory)
    return compiled_graph, compiled_resume_graph, cfg, llm, tcs_client, policy_loader, skill_loader, node_factory


# Module-level references populated in lifespan
graph = None
resume_graph = None
cfg = None
llm = None
tcs_client = None
policy_loader = None
skill_loader_ref = None
node_factory_ref = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize dependencies on startup, cleanup on shutdown."""
    global graph, resume_graph, cfg, llm, tcs_client, policy_loader, skill_loader_ref, node_factory_ref
    graph, resume_graph, cfg, llm, tcs_client, policy_loader, skill_loader_ref, node_factory_ref = _create_dependencies()
    logger.info("Smart CS dependencies initialized (model=%s)", cfg.llm_model)
    yield
    # Cleanup
    if llm:
        await llm.close()
    if tcs_client:
        await tcs_client.close()
    logger.info("Smart CS shutdown complete")


# ─── FastAPI App ─────────────────────────────

app = FastAPI(
    title="Smart CS API",
    version="4.0",
    description="LangGraph-powered intelligent customer service API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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
        llm_model=cfg.llm_model if cfg else "unknown",
        policies=policy_loader.list_policies() if policy_loader else [],
    )


from smart_customer_service.prompt_templates import (
    ROUTER_SYSTEM, SOLVER_SYSTEM, REPLY_GENERATOR_SYSTEM, REVIEWER_SYSTEM,
)

@app.get("/prompts", response_model=PromptsResponse)
async def prompts():
    return PromptsResponse(
        router=ROUTER_SYSTEM,
        solver=SOLVER_SYSTEM,
        reply_generator=REPLY_GENERATOR_SYSTEM,
        reviewer=REVIEWER_SYSTEM,
    )


def _build_initial_state(req: ReplyRequest) -> CustomerServiceState:
    """Build LangGraph initial state from request."""
    # Inject user instructions into old_emails so the solver sees them
    old_emails = req.old_emails
    if req.instructions:
        old_emails = (old_emails + "\n\n" if old_emails else "") + f"[客服回复要求]: {req.instructions}"

    return {
        "customer_email": req.customer_email,
        "brand": req.brand,
        "subject": req.subject,
        "body": req.body,
        "old_emails": old_emails,
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
    except Exception:
        logger.exception("Error processing request")
        raise HTTPException(status_code=500, detail="Internal server error")

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


async def _sse_event_generator(target_graph, initial_state, nf: NodeFactory):
    """SSE generator with token-level streaming.

    Key insight: LangGraph's astream() only yields AFTER a node completes.
    But tokens arrive DURING node execution via the callback. So we must emit
    the "node start" event from the token callback when the first token for
    a new node arrives, not from astream(). The astream() loop only emits
    "node done" events.
    """
    queue: asyncio.Queue = asyncio.Queue()
    # Simple flag: has the current node's "start" been emitted?
    # Reset to False after each "done" event.
    node_started = {"value": False, "name": ""}

    async def _emit_start(node_name: str) -> None:
        """Emit a node start event if not already emitted for this node lifecycle."""
        if not node_started["value"] or node_started["name"] != node_name:
            node_started["value"] = True
            node_started["name"] = node_name
            await queue.put({
                "event": "node",
                "data": json.dumps({"node": node_name, "status": "start"}, ensure_ascii=False),
            })

    # Token callback — called by LLM provider during streaming
    async def _token_cb(node_name: str, token_type: str, token_text: str) -> None:
        # Emit node start on first token — this is the REAL start time
        await _emit_start(node_name)
        await queue.put({
            "event": "token",
            "data": json.dumps({
                "node": node_name,
                "type": token_type,
                "text": token_text,
            }, ensure_ascii=False),
        })

    # Background task: run the graph, push node events to queue
    async def _run_graph():
        try:
            nf.token_callback = _token_cb
            async for chunk in target_graph.astream(initial_state):
                for node_name, update in chunk.items():
                    # For non-LLM nodes that don't produce tokens, emit start here
                    await _emit_start(node_name)

                    # Emit done with full state update
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

                    await queue.put({
                        "event": "node",
                        "data": json.dumps(event_data, ensure_ascii=False),
                    })

                    # Reset flag so the next node (or next solver iteration) gets a fresh start
                    node_started["value"] = False
                    node_started["name"] = ""

        except Exception:
            logger.exception("Error during SSE stream")
            await queue.put({
                "event": "error",
                "data": json.dumps({"node": "__error__", "error": "Internal processing error"}, ensure_ascii=False),
            })
        finally:
            nf.token_callback = None
            await queue.put({
                "event": "done",
                "data": json.dumps({"node": "__done__"}, ensure_ascii=False),
            })
            await queue.put(None)

    task = asyncio.create_task(_run_graph())

    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item
    finally:
        if not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        nf.token_callback = None


@app.post("/api/reply/stream")
async def reply_stream(req: ReplyRequest):
    """Process customer email with SSE streaming."""
    initial_state = _build_initial_state(req)
    return EventSourceResponse(_sse_event_generator(graph, initial_state, node_factory_ref))


@app.post("/api/reply/resume")
async def reply_resume(req: ResumeRequest):
    """Resume processing after human input — starts from solver, skips load_context/router."""
    # Reconstruct server-side-only fields from brand / selected_policy
    skill_dict = {}
    if skill_loader_ref and req.brand:
        skill = skill_loader_ref.load(req.brand)
        skill_dict = {
            "brand": skill.brand, "tone": skill.tone, "greeting": skill.greeting,
            "closing": skill.closing, "approval_threshold_usd": skill.approval_threshold_usd,
            "rules": skill.rules, "reply_style": skill.reply_style, "raw_markdown": skill.raw_markdown,
        }

    policy_content = ""
    if policy_loader and req.selected_policy:
        policy_content = policy_loader.get_policy(req.selected_policy)

    # Inject human directive
    old_emails = req.old_emails
    if req.human_input:
        directive = f"[人工客服指令]: {req.human_input}"
    else:
        directive = "[人工客服指令]: 跳过人工处理，请根据已有信息直接生成邮件回复"
    old_emails = (old_emails + "\n\n" if old_emails else "") + directive

    body = req.body
    if req.human_input:
        body = body + f"\n\n[人工客服补充]: {req.human_input}"

    # Build resume state — preserves routing/retrieval results, resets solver loop
    resume_state: CustomerServiceState = {
        "customer_email": req.customer_email,
        "brand": req.brand,
        "subject": req.subject,
        "body": body,
        "old_emails": old_emails,
        "auto_execute": req.auto_execute,
        "max_react_iterations": req.max_react_iterations,
        "max_reflections": req.max_reflections,
        # Preserved from previous run
        "basic_info": req.basic_info,
        "selected_policy": req.selected_policy,
        "policy_content": policy_content,
        "detected_language": req.detected_language,
        "retrieved_knowledge": req.retrieved_knowledge,
        "skill_profile": skill_dict,
        "memory_facts": [],
        "thought_history": req.thought_history,
        "tool_results": req.tool_results,
        # Reset for new solver run
        "react_iteration": 0,
        "reflection_count": 0,
        "solver_decision": "",
        "trace_log": [],
        "requires_human": False,
        "review_passed": False,
        "node_config": req.node_config,
        "llm_temperature": req.llm_temperature,
    }

    return EventSourceResponse(_sse_event_generator(resume_graph, resume_state, node_factory_ref))


# ─── Backward compatibility ──
@app.post("/reply/stream")
async def reply_stream_compat(req: ReplyRequest):
    return await reply_stream(req)


@app.post("/reply")
async def reply_compat(req: ReplyRequest):
    return await reply(req)


# ─── Static Files ────────────────────────────

# Serve new React frontend
web_dist = BASE_DIR / "web" / "dist"
if web_dist.is_dir():
    app.mount("/web", StaticFiles(directory=str(web_dist), html=True), name="web")


# ─── Entry point ─────────────────────────────

def main():
    import uvicorn

    # Eagerly create deps to print config info at startup
    global graph, resume_graph, cfg, llm, tcs_client, policy_loader, skill_loader_ref, node_factory_ref
    if cfg is None:
        graph, resume_graph, cfg, llm, tcs_client, policy_loader, skill_loader_ref, node_factory_ref = _create_dependencies()

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
