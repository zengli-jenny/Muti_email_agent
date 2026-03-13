"""Real TCS API HTTP client for all 11 endpoints."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class TCSClient:
    """Async HTTP client for TCS (1000shores) API."""

    def __init__(self, base_url: str, token: str, timeout: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout),
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json",
                },
            )
        return self._client

    async def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        client = await self._get_client()
        url = f"{self.base_url}{path}"
        logger.debug("TCS POST %s body=%s", url, body)
        resp = await client.post(url, json=body)
        resp.raise_for_status()
        data = resp.json()
        logger.debug("TCS response: %s", str(data)[:500])
        return data

    # ── 1. 通过官网链接查询产品SKU ──
    async def query_sku_by_url(self, url: str) -> dict[str, Any]:
        return await self._post("/client/sku/match", {"url": url})

    # ── 2. 通过SKU查询产品信息 ──
    async def query_sku_info(self, sku: list[str]) -> dict[str, Any]:
        return await self._post("/client/sku/sku", {"sku": sku})

    # ── 3. 通过品牌查询渠道 ──
    async def query_channel_by_brand(self, brand: str) -> dict[str, Any]:
        return await self._post("/client/repository/website-channel", {"brand": brand})

    # ── 4. 查询关联订单基本信息 ──
    async def query_order_relations(self, order_id: str) -> dict[str, Any]:
        return await self._post("/client/order-relations", {"order_id": order_id})

    # ── 5. 查询订单补充信息 ──
    async def query_order_extension(
        self, order_id: str, sku: str, end_date: str
    ) -> dict[str, Any]:
        return await self._post(
            "/client/order-extension",
            {"order_id": order_id, "sku": sku, "end_date": end_date},
        )

    # ── 6. 通过ASIN查询SKU ──
    async def query_sku_by_asin(self, asin: str) -> dict[str, Any]:
        return await self._post("/client/sku/get-sku-by-asin", {"asin": asin})

    # ── 7. TSM客服邮箱查询工具 ──
    async def query_email_account(self, email: str) -> dict[str, Any]:
        return await self._post("/client/repository/email-account", {"email": email})

    # ── 8. 查询拆单订单号 ──
    async def query_order_splitting(self, order_id: str) -> dict[str, Any]:
        return await self._post("/client/order-splitting", {"order_id": order_id})

    # ── 9. 查询订单基本信息 ──
    async def query_order(self, order_id: str) -> dict[str, Any]:
        return await self._post("/client/order", {"order_id": order_id})

    # ── 10. 查询库存信息 ──
    async def query_inventory(
        self,
        sale_type: str,
        sku: list[str],
        channel: str,
        country_code: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "sale_type": sale_type,
            "sku": sku,
            "channel": channel,
        }
        if country_code:
            body["country_code"] = country_code
        return await self._post("/client/sku/sku-stock", body)

    # ── 11. 查询物流信息 ──
    async def query_logistics(
        self, tracking_number: str, carrier_code: str | None = None
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"tracking_number": tracking_number}
        if carrier_code:
            body["carrier_code"] = carrier_code
        return await self._post("/client/order-tracking", body)

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
