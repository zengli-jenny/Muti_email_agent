"""OpenAI-compatible LLM provider (supports Qwen, DeepSeek, vLLM, etc.)."""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

import httpx

from smart_customer_service.llm.base import BaseLLM

logger = logging.getLogger(__name__)


class OpenAICompatibleLLM(BaseLLM):
    """Calls any OpenAI-compatible /v1/chat/completions endpoint."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        timeout: float = 120.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout),
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
            )
        return self._client

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.1,
        enable_thinking: bool = False,
    ) -> str:
        """Return the content string (backward compatible)."""
        content, _ = await self.chat_with_thinking(messages, temperature, enable_thinking)
        return content

    async def chat_with_thinking(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.1,
        enable_thinking: bool = False,
    ) -> tuple[str, str]:
        """Return (content, reasoning_content). Non-streaming."""
        client = await self._get_client()
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "enable_thinking": enable_thinking,
        }

        logger.debug("LLM request: model=%s messages=%d thinking=%s", self.model, len(messages), enable_thinking)
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()

        msg = data["choices"][0]["message"]
        content = msg.get("content", "")
        reasoning = msg.get("reasoning_content", "")
        logger.debug("LLM response: %d chars, reasoning: %d chars", len(content), len(reasoning))
        return content, reasoning

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.1,
        enable_thinking: bool = False,
    ) -> AsyncGenerator[dict, None]:
        """Stream tokens. Yields dicts: {type: 'thinking'|'content', text: str}."""
        client = await self._get_client()
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "enable_thinking": enable_thinking,
            "stream": True,
        }

        async with client.stream("POST", url, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data_str = line[6:].strip()
                if data_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    continue
                delta = chunk.get("choices", [{}])[0].get("delta", {})
                rc = delta.get("reasoning_content")
                ct = delta.get("content")
                if rc is not None:
                    yield {"type": "thinking", "text": rc}
                elif ct is not None:
                    yield {"type": "content", "text": ct}

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
