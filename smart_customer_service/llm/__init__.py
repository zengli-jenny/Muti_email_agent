"""LLM abstraction layer."""

from smart_customer_service.llm.base import BaseLLM
from smart_customer_service.llm.openai_provider import OpenAICompatibleLLM

__all__ = ["BaseLLM", "OpenAICompatibleLLM"]
