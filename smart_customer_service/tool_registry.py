"""Unified tool registry — dispatches tool calls to TCS client or local handlers."""

from __future__ import annotations

import logging
from typing import Any

from smart_customer_service.tcs_client import TCSClient

logger = logging.getLogger(__name__)


class ToolRegistry:
    """Maps Chinese tool names (matching the old prompt conventions) to TCS API calls."""

    def __init__(self, tcs_client: TCSClient) -> None:
        self.tcs = tcs_client
        self._knowledge_search_fn = None  # set externally after init

    def set_knowledge_search(self, fn) -> None:
        """Inject the knowledge retriever search function."""
        self._knowledge_search_fn = fn

    async def call(self, name: str, params: dict[str, Any]) -> dict[str, Any]:
        """Execute a tool by its Chinese name. Returns the API result dict."""
        handler = self._get_handler(name)
        if handler is None:
            return {"status": "error", "message": f"未知工具: {name}"}
        try:
            result = await handler(params)
            return {"status": "ok", "data": result}
        except Exception as exc:
            logger.exception("Tool %s failed", name)
            return {"status": "error", "message": str(exc)}

    def _get_handler(self, name: str):
        return _TOOL_DISPATCH.get(name, lambda _self: None).__get__(self, type(self))

    def get_tool_descriptions(self) -> list[dict[str, str]]:
        """Return tool name + description list for LLM prompt injection."""
        return [{"name": k, "description": v} for k, v in TOOL_DESCRIPTIONS.items()]

    # ── Individual handlers ──

    async def _query_order(self, p: dict) -> Any:
        return await self.tcs.query_order(p["order_id"])

    async def _query_order_extension(self, p: dict) -> Any:
        return await self.tcs.query_order_extension(
            p["order_id"], p["sku"], p["end_date"]
        )

    async def _query_order_relations(self, p: dict) -> Any:
        return await self.tcs.query_order_relations(p["order_id"])

    async def _query_order_splitting(self, p: dict) -> Any:
        return await self.tcs.query_order_splitting(p["order_id"])

    async def _query_logistics(self, p: dict) -> Any:
        return await self.tcs.query_logistics(
            p["tracking_number"], p.get("carrier_code")
        )

    async def _query_inventory(self, p: dict) -> Any:
        return await self.tcs.query_inventory(
            p["sale_type"], p["sku"], p["channel"], p.get("country_code")
        )

    async def _query_sku_by_url(self, p: dict) -> Any:
        return await self.tcs.query_sku_by_url(p["url"])

    async def _query_sku_by_asin(self, p: dict) -> Any:
        return await self.tcs.query_sku_by_asin(p["asin"])

    async def _query_sku_info(self, p: dict) -> Any:
        return await self.tcs.query_sku_info(p["sku"])

    async def _query_email_account(self, p: dict) -> Any:
        return await self.tcs.query_email_account(p["email"])

    async def _query_channel_by_brand(self, p: dict) -> Any:
        return await self.tcs.query_channel_by_brand(p["brand"])

    async def _knowledge_search(self, p: dict) -> Any:
        if self._knowledge_search_fn is None:
            return {"status": "error", "message": "知识检索未初始化"}
        return self._knowledge_search_fn(p.get("query", ""), p.get("brand", ""), p.get("product_model"))


# ── Dispatch table (Chinese name → method) ──

_TOOL_DISPATCH = {
    "查询订单基本信息": ToolRegistry._query_order,
    "查询订单补充信息": ToolRegistry._query_order_extension,
    "查询关联订单基本信息": ToolRegistry._query_order_relations,
    "查询拆单订单号": ToolRegistry._query_order_splitting,
    "查询物流信息": ToolRegistry._query_logistics,
    "查询库存信息": ToolRegistry._query_inventory,
    "通过官网链接查询产品SKU": ToolRegistry._query_sku_by_url,
    "通过ASIN查询SKU": ToolRegistry._query_sku_by_asin,
    "通过SKU查询产品信息": ToolRegistry._query_sku_info,
    "TSM客服邮箱查询工具": ToolRegistry._query_email_account,
    "通过品牌查询渠道": ToolRegistry._query_channel_by_brand,
    "知识检索工具": ToolRegistry._knowledge_search,
}


TOOL_DESCRIPTIONS: dict[str, str] = {
    "查询订单基本信息": "通过订单号获取订单基本信息（渠道、平台、国家、状态、物流号、SKU等）。参数: {order_id: str}",
    "查询订单补充信息": "通过订单号获取货值、保修周期、是否在保等数据。参数: {order_id: str, sku: str, end_date: str}",
    "查询关联订单基本信息": "根据订单号查询关联订单信息。参数: {order_id: str}",
    "查询拆单订单号": "查询因拆单产生的子订单号。参数: {order_id: str}",
    "查询物流信息": "通过跟踪号查询物流详细信息（状态、更新时间、跟踪链接等）。参数: {tracking_number: str, carrier_code?: str}",
    "查询库存信息": "通过SKU、渠道查询产品库存。参数: {sale_type: str, sku: list[str], channel: str, country_code?: str}",
    "通过官网链接查询产品SKU": "通过官网产品链接查询对应SKU。参数: {url: str}",
    "通过ASIN查询SKU": "通过亚马逊ASIN查询SKU。参数: {asin: str}",
    "通过SKU查询产品信息": "通过SKU查询产品详细信息（型号、品线、系列、色号等）。参数: {sku: list[str]}",
    "TSM客服邮箱查询工具": "通过邮箱账号查询渠道信息。参数: {email: str}",
    "通过品牌查询渠道": "通过品牌查询渠道列表。参数: {brand: str}",
    "知识检索工具": "搜索产品FAQ知识库获取解答。参数: {query: str, brand?: str, product_model?: str}",
}
