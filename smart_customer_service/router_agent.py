"""
路由 Agent (Router Agent)
根据政策路由规则判断适用的标准流程
"""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from smart_customer_service.coordinator_agent import BasicInfo


class RouterAgent:
    """
    路由 Agent - 根据政策路由规则分发到正确的专家

    职责:
    1. 根据 `政策路由.md` 的规则判断适用的标准流程
    2. 支持多意图识别(一封邮件可能涉及多个问题)
    3. 返回优先级排序的流程列表

    输入:
        - OldEmail: 邮件原文
        - BasicInfo: 基本信息(订单号、问题类型等)

    输出:
        - PoliciesFileName: 标准流程文件名列表
    """

    def __init__(self, policy_routing_file: Path | None = None):
        """
        初始化路由 Agent

        Args:
            policy_routing_file: 政策路由文件路径,默认为 政策路由.md
        """
        if policy_routing_file is None:
            policy_routing_file = Path(__file__).parent.parent / "政策路由.md"

        self.policy_routing_file = policy_routing_file
        self._load_routing_rules()

    def _load_routing_rules(self):
        """加载政策路由规则"""
        # 这里简化处理,实际可以解析 Markdown 文件
        # 或者用 LLM 理解路由规则
        pass

    def route(self, email_body: str, basic_info: BasicInfo) -> list[str]:
        """
        根据邮件内容和基本信息,路由到适用的标准流程

        Args:
            email_body: 邮件正文
            basic_info: 基本信息

        Returns:
            list[str]: 标准流程文件名列表,按优先级排序
        """
        policies = []

        # 规则 1: 问题已解决 — 客户来信表示感谢且没有新诉求
        if self._is_problem_resolved(email_body):
            return ["问题已解决回复要求.md"]

        # 规则 2: 特殊场景优先匹配（与订单状态无关）
        if self._is_invoice_request(email_body):
            policies.append("客户索要发票处理流程.md")

        if self._is_points_issue(email_body):
            policies.append("官网积分处理流程.md")

        if self._is_email_modification(email_body):
            policies.append("官网邮箱信息修改处理流程.md")

        if self._is_influencer_request(email_body):
            policies.append("红人要样或合作处理流程.md")

        if self._is_order_modification(email_body):
            policies.append("订单修改与取消流程.md")

        # 如果特殊场景已匹配,直接返回
        if policies:
            return policies

        # 规则 3: 售前场景 — 没有订单号且不是售后问题
        if basic_info.is_pre_sales and not basic_info.has_order:
            if self._is_logistics_inquiry(email_body):
                policies.append("物流问题处理流程.md")
            else:
                policies.append("售前咨询处理流程.md")
            return policies

        # 规则 4: 有订单号的售后场景 — 基于邮件语义判断问题类型
        # 注意: 此时 order_status 可能未知,所以优先用邮件内容判断
        # 质量问题权重 > 客户原因 > 设计描述差异（按政策路由.md）

        # 4.1 马克笔质量问题（优先于通用质量问题）
        if self._is_marker_quality_issue(email_body, basic_info):
            policies.append("马克笔质量问题处理流程.md")

        # 4.2 商品质量问题
        elif self._is_quality_issue(email_body):
            policies.append("商品质量问题处理流程.md")

        # 4.3 发货差错
        elif self._is_shipping_error(email_body):
            policies.append("发货差错问题处理流程.md")

        # 4.4 物流问题
        elif self._is_logistics_issue(email_body) or self._is_logistics_inquiry(email_body):
            policies.append("物流问题处理流程.md")

        # 4.5 设计与描述差异
        elif self._is_design_description_issue(email_body):
            policies.append("设计与描述差异问题处理流程.md")

        # 4.6 客户原因退换货
        elif self._is_customer_return(email_body):
            policies.append("客户原因退换货处理流程.md")

        # 4.7 售后咨询
        elif self._is_after_sales_inquiry(email_body):
            policies.append("售后咨询处理流程.md")

        # 规则 5: 兜底 — 没有匹配到任何流程
        if not policies:
            if basic_info.has_order or basic_info.is_after_sales:
                policies.append("售后咨询处理流程.md")
            else:
                policies.append("售前咨询处理流程.md")

        return policies

    # ========== 判断逻辑辅助方法 ==========

    def _is_problem_resolved(self, email_body: str) -> bool:
        """判断问题是否已解决"""
        resolved_keywords = ["thank you", "thanks", "resolved", "solved", "appreciate", "grateful"]
        body_lower = email_body.lower()
        return any(kw in body_lower for kw in resolved_keywords) and len(email_body.split()) < 50

    def _is_influencer_request(self, email_body: str) -> bool:
        """判断是否为红人要样或合作"""
        keywords = ["sample", "free", "influencer", "youtube", "instagram", "tiktok", "collaboration",
                   "partnership", "sponsor", "birthday", "donate"]
        return any(kw in email_body.lower() for kw in keywords)

    def _is_logistics_inquiry(self, email_body: str) -> bool:
        """判断是否为物流咨询"""
        keywords = ["shipping", "delivery", "tracking", "when will", "how long"]
        return any(kw in email_body.lower() for kw in keywords)

    def _is_logistics_issue(self, email_body: str) -> bool:
        """判断是否为物流问题"""
        keywords = ["not received", "not delivered", "lost", "missing package", "tracking not update",
                   "shows delivered", "delivered but", "didn't receive", "haven't received"]
        return any(kw in email_body.lower() for kw in keywords)

    def _is_quality_issue(self, email_body: str) -> bool:
        """判断是否为商品质量问题"""
        keywords = ["broken", "defect", "not work", "malfunction", "damage", "quality issue",
                   "stop working", "doesn't work", "won't turn on"]
        return any(kw in email_body.lower() for kw in keywords)

    def _is_marker_quality_issue(self, email_body: str, basic_info: BasicInfo) -> bool:
        """判断是否为马克笔质量问题"""
        marker_keywords = ["marker", "ohuhu", "干墨", "漏墨", "dry", "dried out", "leak"]
        return any(kw in email_body.lower() for kw in marker_keywords)

    def _is_design_description_issue(self, email_body: str) -> bool:
        """判断是否为设计与描述差异问题"""
        keywords = ["not as described", "different from", "size wrong", "color different",
                   "compatibility", "doesn't fit", "not compatible"]
        return any(kw in email_body.lower() for kw in keywords)

    def _is_shipping_error(self, email_body: str) -> bool:
        """判断是否为发货差错"""
        keywords = ["wrong item", "wrong product", "received wrong", "missing item", "extra item"]
        return any(kw in email_body.lower() for kw in keywords)

    def _is_customer_return(self, email_body: str) -> bool:
        """判断是否为客户原因退换货"""
        keywords = ["don't want", "don't like", "change mind", "ordered by mistake", "return"]
        return any(kw in email_body.lower() for kw in keywords)

    def _is_order_modification(self, email_body: str) -> bool:
        """判断是否为订单修改与取消"""
        keywords = ["cancel order", "change order", "modify order", "update address"]
        return any(kw in email_body.lower() for kw in keywords)

    def _is_after_sales_inquiry(self, email_body: str) -> bool:
        """判断是否为售后咨询"""
        keywords = ["how to use", "manual", "instruction", "refund status", "when will refund"]
        return any(kw in email_body.lower() for kw in keywords)

    def _is_invoice_request(self, email_body: str) -> bool:
        """判断是否为索要发票"""
        keywords = ["invoice", "receipt", "vat"]
        return any(kw in email_body.lower() for kw in keywords)

    def _is_points_issue(self, email_body: str) -> bool:
        """判断是否为积分问题"""
        keywords = ["points", "reward", "loyalty"]
        return any(kw in email_body.lower() for kw in keywords)

    def _is_email_modification(self, email_body: str) -> bool:
        """判断是否为邮箱信息修改"""
        keywords = ["change email", "update email", "modify email"]
        return any(kw in email_body.lower() for kw in keywords)
