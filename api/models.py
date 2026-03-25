"""Pydantic models for the FastAPI customer service API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ReplyRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=50000)
    customer_email: str = Field(default="", max_length=200)
    brand: str = Field(default="", max_length=100)
    subject: str = Field(default="", max_length=500)
    old_emails: str = Field(default="", max_length=100000)
    instructions: str = Field(default="", max_length=5000)
    auto_execute: bool = Field(default=False)
    llm_temperature: float = Field(default=0.1, ge=0, le=2)
    max_react_iterations: int = Field(default=7, ge=1, le=20)
    max_reflections: int = Field(default=2, ge=0, le=5)
    node_config: dict = Field(default_factory=dict)
    thread_id: str | None = Field(default=None, max_length=200)


class ResumeRequest(BaseModel):
    human_input: str = Field(default="", max_length=10000)
    body: str = Field(..., min_length=1, max_length=50000)
    customer_email: str = Field(default="", max_length=200)
    brand: str = Field(default="", max_length=100)
    subject: str = Field(default="", max_length=500)
    old_emails: str = Field(default="", max_length=100000)
    basic_info: dict = Field(default_factory=dict)
    selected_policy: str = Field(default="")
    policy_content: str = Field(default="")
    detected_language: str = Field(default="en")
    retrieved_knowledge: str = Field(default="")
    thought_history: list = Field(default_factory=list)
    tool_results: dict = Field(default_factory=dict)
    auto_execute: bool = Field(default=False)
    llm_temperature: float = Field(default=0.1, ge=0, le=2)
    max_react_iterations: int = Field(default=7, ge=1, le=20)
    max_reflections: int = Field(default=2, ge=0, le=5)
    node_config: dict = Field(default_factory=dict)
    thread_id: str | None = Field(default=None, max_length=200)


class HealthResponse(BaseModel):
    status: str = "ok"


class InfoResponse(BaseModel):
    system: str = "LangGraph Customer Service"
    version: str = "4.0"
    llm_model: str = "unknown"
    policies: list[str] = []


class PromptsResponse(BaseModel):
    solver: str = ""
    reply_generator: str = ""
    reviewer: str = ""


class SkillEntryUpdate(BaseModel):
    """Partial update for skill registry metadata."""
    name: str | None = None
    trigger: str | None = None
    l1_summary: str | None = None
    l2_section: str | None = None
    l3_sections: list[str] | None = None


class SkillFileUpdate(BaseModel):
    """Full replacement of a skill's markdown content."""
    content: str = Field(..., min_length=1, max_length=200000)
