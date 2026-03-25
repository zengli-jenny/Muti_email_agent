"""FastAPI backend for the Smart CS LangGraph customer service system."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from sse_starlette.sse import EventSourceResponse
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from smart_customer_service.config import AppConfig
from smart_customer_service.graph.builder import build_graph, build_resume_graph
from smart_customer_service.graph.nodes import NodeFactory
from smart_customer_service.graph.state import CustomerServiceState
from smart_customer_service.knowledge_retriever import KnowledgeRetriever
from smart_customer_service.llm.openai_provider import OpenAICompatibleLLM
from smart_customer_service.memory import MemoryStore
from smart_customer_service.policy_loader import PolicyLoader
from smart_customer_service.skill_registry import SkillRegistry
from smart_customer_service.tcs_client import TCSClient
from smart_customer_service.tool_registry import ToolRegistry

from api.models import (
    ReplyRequest, ResumeRequest, HealthResponse, InfoResponse, PromptsResponse,
    SkillEntryUpdate, SkillFileUpdate,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent


# ─── Bootstrap ───────────────────────────────

def _create_dependencies(checkpointer=None):
    """Wire up all dependencies. Checkpointer is created externally in lifespan."""
    cfg = AppConfig.from_base_dir()

    llm = OpenAICompatibleLLM(
        base_url=cfg.llm_base_url,
        api_key=cfg.llm_api_key,
        model=cfg.llm_model,
    )

    tcs_client = TCSClient(base_url=cfg.tcs_base_url, token=cfg.tcs_token)
    tool_registry = ToolRegistry(tcs_client)

    knowledge_retriever = KnowledgeRetriever(
        cfg.knowledge_full_file,
        embedding_base_url=cfg.embedding_base_url,
        embedding_api_key=cfg.embedding_api_key,
        embedding_model=cfg.embedding_model,
        chroma_persist_dir=cfg.chroma_persist_dir,
    )
    tool_registry.set_knowledge_search(knowledge_retriever.search_as_text)

    policy_loader = PolicyLoader(cfg.policy_dir)
    memory_store = MemoryStore(cfg.memory_file)

    # Skill registry (progressive disclosure)
    skill_registry = SkillRegistry(cfg.skill_registry_file, cfg.policy_dir)
    tool_registry.set_skill_registry(skill_registry)

    node_factory = NodeFactory(
        llm=llm,
        memory_store=memory_store,
        skill_registry=skill_registry,
        knowledge_retriever=knowledge_retriever,
        tool_registry=tool_registry,
    )

    compiled_graph = build_graph(node_factory, checkpointer=checkpointer)
    compiled_resume_graph = build_resume_graph(node_factory, checkpointer=checkpointer)
    return compiled_graph, compiled_resume_graph, cfg, llm, tcs_client, policy_loader, skill_registry, node_factory


# Module-level references populated in lifespan
graph = None
resume_graph = None
cfg = None
llm = None
tcs_client = None
policy_loader = None
skill_registry_ref = None
node_factory_ref = None
checkpointer_ref = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize dependencies on startup, cleanup on shutdown."""
    global graph, resume_graph, cfg, llm, tcs_client, policy_loader, skill_registry_ref, node_factory_ref, checkpointer_ref

    # Create checkpoint DB path
    _cfg = AppConfig.from_base_dir()
    _cfg.checkpoint_db.parent.mkdir(parents=True, exist_ok=True)

    async with AsyncSqliteSaver.from_conn_string(str(_cfg.checkpoint_db)) as checkpointer:
        checkpointer_ref = checkpointer
        graph, resume_graph, cfg, llm, tcs_client, policy_loader, skill_registry_ref, node_factory_ref = _create_dependencies(checkpointer=checkpointer)
        logger.info("Smart CS dependencies initialized (model=%s, checkpoint=%s)", cfg.llm_model, cfg.checkpoint_db)
        yield
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
    SOLVER_SYSTEM, REPLY_GENERATOR_SYSTEM, REVIEWER_SYSTEM,
)

@app.get("/prompts", response_model=PromptsResponse)
async def prompts():
    return PromptsResponse(
        solver=SOLVER_SYSTEM,
        reply_generator=REPLY_GENERATOR_SYSTEM,
        reviewer=REVIEWER_SYSTEM,
    )


# ─── Skills Registry API ──────────────────────

@app.get("/api/skills")
async def list_skills():
    """List all skills in the registry (L1 metadata only)."""
    if not skill_registry_ref:
        raise HTTPException(status_code=503, detail="Skill registry not initialized")
    return {"skills": skill_registry_ref.list_skills()}


@app.get("/api/skills/{skill_id}")
async def get_skill(skill_id: str):
    """Get full detail for a skill including L2 content."""
    if not skill_registry_ref:
        raise HTTPException(status_code=503, detail="Skill registry not initialized")
    detail = skill_registry_ref.get_skill_detail(skill_id)
    if not detail:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found")
    return detail


@app.patch("/api/skills/{skill_id}")
async def update_skill_entry(skill_id: str, body: SkillEntryUpdate):
    """Update skill registry metadata (name, trigger, l1_summary, etc.)."""
    if not skill_registry_ref:
        raise HTTPException(status_code=503, detail="Skill registry not initialized")
    updates = body.model_dump(exclude_none=True)
    ok = skill_registry_ref.update_registry_entry(skill_id, updates)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found")
    return {"ok": True}


@app.put("/api/skills/{skill_id}/content")
async def update_skill_content(skill_id: str, body: SkillFileUpdate):
    """Update the full markdown content of a skill's policy file."""
    if not skill_registry_ref:
        raise HTTPException(status_code=503, detail="Skill registry not initialized")
    ok = skill_registry_ref.update_skill_file(skill_id, body.content)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found")
    return {"ok": True}


@app.get("/api/skills/meta/l1_table")
async def get_l1_table():
    """Return the full L1 skill table (for preview)."""
    if not skill_registry_ref:
        raise HTTPException(status_code=503, detail="Skill registry not initialized")
    return {"table": skill_registry_ref.build_l1_table()}


# ─── Tools Registry API (read-only) ─────────

from smart_customer_service.tool_registry import TOOL_DESCRIPTIONS, _TOOL_DISPATCH


@app.get("/api/tools")
async def list_tools():
    """List all registered tools with name, description, and category."""
    tools = []
    for name, desc in TOOL_DESCRIPTIONS.items():
        # Categorize tools
        if name in ("load_skill", "load_skill_section"):
            category = "skill"
        elif name == "知识检索工具":
            category = "knowledge"
        elif "订单" in name or "拆单" in name:
            category = "order"
        elif "物流" in name:
            category = "logistics"
        elif "库存" in name:
            category = "inventory"
        elif "SKU" in name or "产品" in name or "ASIN" in name or "官网" in name:
            category = "product"
        elif "邮箱" in name:
            category = "account"
        elif "品牌" in name or "渠道" in name:
            category = "channel"
        else:
            category = "other"

        # Extract params hint from description
        params_hint = ""
        if "参数:" in desc:
            params_hint = desc.split("参数:")[-1].strip()

        tools.append({
            "name": name,
            "description": desc,
            "category": category,
            "params": params_hint,
            "registered": name in _TOOL_DISPATCH,
        })
    return {"tools": tools, "total": len(tools)}


# ─── Reply Processing ─────────────────────────

def _generate_thread_id(req) -> str:
    """Generate a unique thread_id for checkpoint tracking."""
    return getattr(req, "thread_id", None) or str(uuid.uuid4())


def _build_initial_state(req: ReplyRequest) -> CustomerServiceState:
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
        "pending_tool_calls": [],
        "trace_log": [],
        "requires_human": False,
        "review_passed": False,
        "policy_content": "",
        "node_config": req.node_config,
        "llm_temperature": req.llm_temperature,
    }


@app.post("/api/reply")
async def reply(req: ReplyRequest):
    """Process customer email (non-streaming)."""
    initial_state = _build_initial_state(req)
    thread_id = _generate_thread_id(req)
    run_config = {"configurable": {"thread_id": thread_id}}

    try:
        final_state = await graph.ainvoke(initial_state, config=run_config)
    except Exception:
        logger.exception("Error processing request")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {
        "thread_id": thread_id,
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


async def _sse_event_generator(target_graph, initial_state, nf: NodeFactory, *, thread_id: str = ""):
    """SSE generator with token-level streaming and checkpoint support."""
    queue: asyncio.Queue = asyncio.Queue()
    node_started = {"value": False, "name": ""}
    run_config = {"configurable": {"thread_id": thread_id}} if thread_id else {}

    async def _emit_start(node_name: str) -> None:
        if not node_started["value"] or node_started["name"] != node_name:
            node_started["value"] = True
            node_started["name"] = node_name
            await queue.put({
                "event": "node",
                "data": json.dumps({"node": node_name, "status": "start"}, ensure_ascii=False),
            })

    async def _token_cb(node_name: str, token_type: str, token_text: str) -> None:
        await _emit_start(node_name)
        await queue.put({
            "event": "token",
            "data": json.dumps({
                "node": node_name,
                "type": token_type,
                "text": token_text,
            }, ensure_ascii=False),
        })

    async def _run_graph():
        try:
            nf.token_callback = _token_cb
            async for chunk in target_graph.astream(initial_state, config=run_config):
                for node_name, update in chunk.items():
                    await _emit_start(node_name)

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
                "data": json.dumps({"node": "__done__", "thread_id": thread_id}, ensure_ascii=False),
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
    thread_id = _generate_thread_id(req)
    return EventSourceResponse(_sse_event_generator(graph, initial_state, node_factory_ref, thread_id=thread_id))


@app.post("/api/reply/resume")
async def reply_resume(req: ResumeRequest):
    """Resume processing after human input — starts from solver."""
    thread_id = getattr(req, "thread_id", None) or str(uuid.uuid4())

    policy_content = req.policy_content or ""

    old_emails = req.old_emails
    if req.human_input:
        directive = f"[人工客服指令]: {req.human_input}"
    else:
        directive = "[人工客服指令]: 跳过人工处理，请根据已有信息直接生成邮件回复"
    old_emails = (old_emails + "\n\n" if old_emails else "") + directive

    body = req.body
    if req.human_input:
        body = body + f"\n\n[人工客服补充]: {req.human_input}"

    # Rebuild skill table for resume context
    skill_table = skill_registry_ref.build_l1_table() if skill_registry_ref else ""

    resume_state: CustomerServiceState = {
        "customer_email": req.customer_email,
        "brand": req.brand,
        "subject": req.subject,
        "body": body,
        "old_emails": old_emails,
        "auto_execute": req.auto_execute,
        "max_react_iterations": req.max_react_iterations,
        "max_reflections": req.max_reflections,
        "basic_info": req.basic_info,
        "selected_policy": req.selected_policy,
        "policy_content": policy_content,
        "detected_language": req.detected_language,
        "retrieved_knowledge": req.retrieved_knowledge,
        "skill_table": skill_table,
        "memory_facts": [],
        "thought_history": req.thought_history,
        "tool_results": req.tool_results,
        "pending_tool_calls": [],
        "react_iteration": 0,
        "reflection_count": 0,
        "solver_decision": "",
        "trace_log": [],
        "requires_human": False,
        "review_passed": False,
        "node_config": req.node_config,
        "llm_temperature": req.llm_temperature,
    }

    return EventSourceResponse(_sse_event_generator(resume_graph, resume_state, node_factory_ref, thread_id=thread_id))


# ─── Backward compatibility ──
@app.post("/reply/stream")
async def reply_stream_compat(req: ReplyRequest):
    return await reply_stream(req)


@app.post("/reply")
async def reply_compat(req: ReplyRequest):
    return await reply(req)


# ─── Checkpoint / Thread History API ─────────

@app.get("/api/threads/{thread_id}")
async def get_thread_state(thread_id: str):
    """Retrieve the latest checkpoint state for a given thread."""
    if not checkpointer_ref:
        raise HTTPException(status_code=503, detail="Checkpointer not initialized")
    config = {"configurable": {"thread_id": thread_id}}
    try:
        cp_tuple = await checkpointer_ref.aget_tuple(config)
    except Exception:
        logger.exception("Failed to retrieve checkpoint for thread %s", thread_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve checkpoint")
    if not cp_tuple:
        raise HTTPException(status_code=404, detail=f"Thread '{thread_id}' not found")
    state = cp_tuple.checkpoint.get("channel_values", {})
    return {
        "thread_id": thread_id,
        "final_reply": state.get("final_reply", ""),
        "requires_human": state.get("requires_human", False),
        "selected_policy": state.get("selected_policy", ""),
        "thought_history": state.get("thought_history", []),
        "tool_results": state.get("tool_results", {}),
        "trace_log": state.get("trace_log", []),
        "review_passed": state.get("review_passed", False),
        "detected_language": state.get("detected_language", "en"),
    }


# ─── Static Files ────────────────────────────

web_dist = BASE_DIR / "web" / "dist"
if web_dist.is_dir():
    app.mount("/web", StaticFiles(directory=str(web_dist), html=True), name="web")


# ─── Entry point ─────────────────────────────

def main():
    import uvicorn

    global graph, resume_graph, cfg, llm, tcs_client, policy_loader, skill_registry_ref, node_factory_ref
    if cfg is None:
        graph, resume_graph, cfg, llm, tcs_client, policy_loader, skill_registry_ref, node_factory_ref = _create_dependencies()

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
