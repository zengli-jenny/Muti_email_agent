"""Pydantic models for the FastAPI customer service API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ReplyRequest(BaseModel):
    """Request body for /api/reply and /api/reply/stream."""

    body: str = Field(..., min_length=1, max_length=50000, description="Email body text")
    customer_email: str = Field(default="", max_length=200, description="Customer email address")
    brand: str = Field(default="", max_length=100, description="Brand name")
    subject: str = Field(default="", max_length=500, description="Email subject")
    old_emails: str = Field(default="", max_length=100000, description="Previous email thread")
    instructions: str = Field(default="", max_length=5000, description="User instructions for reply generation")
    auto_execute: bool = Field(default=False, description="Auto-execute tools")
    llm_temperature: float = Field(default=0.1, ge=0, le=2)
    max_react_iterations: int = Field(default=7, ge=1, le=20)
    max_reflections: int = Field(default=2, ge=0, le=5)
    node_config: dict = Field(default_factory=dict)


class ResumeRequest(BaseModel):
    """Request body for /api/reply/resume — continues from solver after human input."""

    human_input: str = Field(default="", max_length=10000, description="Human agent instruction")

    # Original request context
    body: str = Field(..., min_length=1, max_length=50000)
    customer_email: str = Field(default="", max_length=200)
    brand: str = Field(default="", max_length=100)
    subject: str = Field(default="", max_length=500)
    old_emails: str = Field(default="", max_length=100000)

    # Routing results (from SSE stream, skip re-computation)
    basic_info: dict = Field(default_factory=dict)
    selected_policy: str = Field(default="")
    detected_language: str = Field(default="en")
    retrieved_knowledge: str = Field(default="")

    # Accumulated ReAct state
    thought_history: list = Field(default_factory=list)
    tool_results: dict = Field(default_factory=dict)

    # Config
    auto_execute: bool = Field(default=False)
    llm_temperature: float = Field(default=0.1, ge=0, le=2)
    max_react_iterations: int = Field(default=7, ge=1, le=20)
    max_reflections: int = Field(default=2, ge=0, le=5)
    node_config: dict = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: str = "ok"


class InfoResponse(BaseModel):
    system: str = "LangGraph Customer Service"
    version: str = "4.0"
    llm_model: str = "unknown"
    policies: list[str] = []


class PromptsResponse(BaseModel):
    router: str = ""
    solver: str = ""
    reply_generator: str = ""
    reviewer: str = ""
