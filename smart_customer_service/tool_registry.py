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

    def set_knowledge_search(self, fn: Any) -> None:
        """Inject the knowledge retriever search function."""
        self._knowledge_search_fn = fn

    async def call(self, name: str, params: dict[str, Any]) -> dict[str, Any]:
        """Execute a tool by its Chinese name. Returns the API result dict."""
        # Normalize: strip whitespace that LLM may insert in tool names
        normalized = name.replace(" ", "").replace("\u3000", "").strip()
        handler = self._get_handler(normalized)
        if handler is None:
            return {"status": "error", "message": f"未知工具: {name}"}
        try:
            result = await handler(params)
            return {"status": "ok", "data": result}
        except KeyError as exc:
            logger.error("Tool %s missing required parameter: %s", name, exc)
            return {"status": "error", "message": f"缺少必要参数: {exc}"}
        except Exception as exc:
            logger.exception("Tool %s failed", name)
            return {"status": "error", "message": str(exc)}

    def _get_handler(self, name: str):
        method = _TOOL_DISPATCH.get(name)
        if method is None:
            return None
        return method.__get__(self, type(self))

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
        return self._knowledge_search_fn(p.get("query", ""), p.get("brand", ""), p.get("product_model"), top_k=5)


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
    "查询订单基本信息": (
        "通过订单号获取订单基本信息（渠道、平台、国家、状态、发货类型、物流号、SKU等）。"
        "订单号为空时不要调用。"
        "参数: {order_id: str}"
    ),
    "查询订单补充信息": (
        "在售后场景中，通过订单号获取货值（商品售价）、保修周期、是否在保、货品类型（新品/旧品）、退款状态等数据。"
        "订单号为空时不要调用。"
        "参数: {order_id: str, sku: str（单个SKU字符串）, end_date: str（客户首次来件日期，格式YYYY-MM-DD）}"
    ),
    "查询关联订单基本信息": (
        "根据订单号查询关联订单信息（换货订单、拆单订单等）。"
        "订单号为空时不要调用。"
        "参数: {order_id: str}"
    ),
    "查询拆单订单号": (
        "查询因拆单产生的子订单号。仅在客户反馈只收到部分包裹时使用。"
        "参数: {order_id: str}"
    ),
    "查询物流信息": (
        "通过跟踪号查询物流详细信息（物流状态、最近更新时间、跟踪链接、预计到达时间等）。"
        "注意：跟踪号为空或发货类型(fulfillment_channel)为AFN时不要调用。"
        "参数: {tracking_number: str, carrier_code?: str（物流商代码，如UPS、USPS等）}"
    ),
    "查询库存信息": (
        "通过服务阶段、产品SKU、渠道查询产品库存信息。SKU或渠道为空时不要调用。"
        "参数: {"
        "sale_type: str（服务阶段，只能填\"售前\"或\"售后\"，根据basic_info中is_pre_sales/is_after_sales判断）, "
        "sku: list[str]（SKU数组，如[\"SKU001\",\"SKU002\"]）, "
        "channel: str（渠道名称，格式为\"品牌_国家\"如\"Ohuhu_US\"、\"Tribit_EU\"，可从订单信息的channel字段获取）, "
        "country_code?: str（两位国家代码如US、DE、AU等。注意：UK/GB客户查配件库存用DE，查马克笔库存用EU）"
        "}"
    ),
    "通过官网链接查询产品SKU": (
        "通过官网产品链接查询对应SKU。支持的官网域名：https://www.tribit.com、https://www.ohuhu.com。"
        "参数: {url: str（完整的官网产品链接）}"
    ),
    "通过ASIN查询SKU": (
        "通过亚马逊ASIN查询对应的产品SKU。"
        "参数: {asin: str}"
    ),
    "通过SKU查询产品信息": (
        "通过SKU查询产品详细信息（型号、品线、系列、色号等）。"
        "参数: {sku: list[str]（SKU数组，如[\"SKU001\"]）}"
    ),
    "TSM客服邮箱查询工具": (
        "通过客服邮箱账号查询该邮箱对应的品牌、渠道、国家等信息。"
        "参数: {email: str（邮箱地址）}"
    ),
    "通过品牌查询渠道": (
        "通过品牌名称查询该品牌下所有渠道列表（含渠道名、国家、仓库描述）。"
        "参数: {brand: str（品牌名称，如Ohuhu、Tribit、iClever）}"
    ),
    "知识检索工具": (
        "搜索产品FAQ知识库获取常见问题解答。适用于产品使用问题、功能咨询、兼容性查询等。"
        "参数: {query: str（搜索关键词）, brand?: str（品牌名称）, product_model?: str（产品型号）}"
    ),
}
