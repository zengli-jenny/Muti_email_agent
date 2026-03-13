"""LangGraph-powered customer service HTTP server."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env before anything else
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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# Application bootstrap
# ─────────────────────────────────────────────

def create_app():
    """Wire up all dependencies and return the compiled LangGraph + config."""
    cfg = AppConfig.from_base_dir()

    # LLM
    llm = OpenAICompatibleLLM(
        base_url=cfg.llm_base_url,
        api_key=cfg.llm_api_key,
        model=cfg.llm_model,
    )

    # TCS API client
    tcs_client = TCSClient(base_url=cfg.tcs_base_url, token=cfg.tcs_token)

    # Tool registry
    tool_registry = ToolRegistry(tcs_client)

    # Knowledge retriever
    knowledge_retriever = KnowledgeRetriever(cfg.knowledge_full_file)
    tool_registry.set_knowledge_search(knowledge_retriever.search)

    # Policy loader
    policy_loader = PolicyLoader(cfg.policy_dir)

    # Memory & Skills
    memory_store = MemoryStore(cfg.memory_file)
    skill_loader = SkillLoader(cfg.skills_dir)

    # Rule-based router (fallback)
    rule_router = RouterAgent(cfg.policy_routing_file)

    # Load policy routing text for LLM router prompt
    policy_routing_text = ""
    if cfg.policy_routing_file.exists():
        policy_routing_text = cfg.policy_routing_file.read_text(encoding="utf-8")

    # Node factory
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

    # Build and compile graph
    compiled_graph = build_graph(node_factory)

    return compiled_graph, cfg, llm, tcs_client


# ─────────────────────────────────────────────
# Request handler
# ─────────────────────────────────────────────

async def handle_reply(graph, payload: dict, cfg: AppConfig) -> dict:
    """Run the LangGraph workflow for a single customer email."""
    initial_state: CustomerServiceState = {
        "customer_email": payload.get("customer_email", ""),
        "brand": payload.get("brand", ""),
        "subject": payload.get("subject", ""),
        "body": payload.get("body", ""),
        "old_emails": payload.get("old_emails", ""),
        "auto_execute": payload.get("auto_execute", False),
        "max_react_iterations": cfg.max_react_iterations,
        "max_reflections": cfg.max_reflections,
        "react_iteration": 0,
        "reflection_count": 0,
        "thought_history": [],
        "tool_results": {},
        "trace_log": [],
        "requires_human": False,
        "review_passed": False,
    }

    # Run the graph
    final_state = await graph.ainvoke(initial_state)

    # Build response
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


# ─────────────────────────────────────────────
# HTTP server (asyncio + stdlib)
# ─────────────────────────────────────────────

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http import HTTPStatus
import threading


class LangGraphRequestHandler(BaseHTTPRequestHandler):
    """HTTP handler that bridges sync HTTP to async LangGraph."""

    graph = None
    cfg = None
    loop = None

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json({"status": "ok"})
        elif self.path == "/info":
            self._json({
                "system": "LangGraph Customer Service",
                "version": "3.0",
                "llm_model": self.cfg.llm_model if self.cfg else "unknown",
                "policies": PolicyLoader(self.cfg.policy_dir).list_policies() if self.cfg else [],
            })
        else:
            self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        if self.path != "/reply":
            self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)

        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception as exc:
            self._json({"error": f"Invalid JSON: {exc}"}, HTTPStatus.BAD_REQUEST)
            return

        # Validate required fields
        missing = [f for f in ("brand", "body") if not payload.get(f)]
        if missing:
            self._json({"error": f"Missing required fields: {missing}"}, HTTPStatus.BAD_REQUEST)
            return

        try:
            future = asyncio.run_coroutine_threadsafe(
                handle_reply(self.graph, payload, self.cfg), self.loop
            )
            response = future.result(timeout=300)
        except Exception as exc:
            logger.exception("Error processing request")
            self._json({"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        self._json(response)

    def log_message(self, format: str, *args: object) -> None:
        logger.info(format, *args)

    def _json(self, data: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def _run_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Run the asyncio event loop in a background thread."""
    asyncio.set_event_loop(loop)
    loop.run_forever()


def main() -> None:
    """Start the LangGraph customer service HTTP server."""
    graph, cfg, llm, tcs_client = create_app()

    # Create a dedicated asyncio event loop in a background thread
    loop = asyncio.new_event_loop()
    loop_thread = threading.Thread(target=_run_event_loop, args=(loop,), daemon=True)
    loop_thread.start()

    # Inject into handler class
    LangGraphRequestHandler.graph = graph
    LangGraphRequestHandler.cfg = cfg
    LangGraphRequestHandler.loop = loop

    server = ThreadingHTTPServer(
        (cfg.service_host, cfg.service_port), LangGraphRequestHandler
    )

    print("=" * 60)
    print("  LangGraph Customer Service System v3.0")
    print("=" * 60)
    print(f"  LLM Model:  {cfg.llm_model}")
    print(f"  TCS API:    {cfg.tcs_base_url}")
    print(f"  Listening:   http://{cfg.service_host}:{cfg.service_port}")
    print("=" * 60)
    print()
    print("  Endpoints:")
    print("    GET  /health  — Health check")
    print("    GET  /info    — System information")
    print("    POST /reply   — Process customer email")
    print()
    print("  Press Ctrl+C to stop")
    print("=" * 60)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()
        # Cleanup async resources
        async def _cleanup():
            await llm.close()
            await tcs_client.close()
        asyncio.run_coroutine_threadsafe(_cleanup(), loop).result(timeout=5)
        loop.call_soon_threadsafe(loop.stop)
        loop_thread.join(timeout=5)


if __name__ == "__main__":
    main()
