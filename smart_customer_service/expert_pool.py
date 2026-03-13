"""
专家 Agent 池 (Expert Pool)
管理所有专家 Agent,提供统一的调用接口
"""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from smart_customer_service.coordinator_agent import BasicInfo


class BaseExpert:
    """
    专家 Agent 基类

    所有专家 Agent 都继承此类,实现统一接口
    """

    def __init__(self, policy_file: Path, tool_registry):
        """
        初始化专家 Agent

        Args:
            policy_file: 标准流程文件路径
            tool_registry: 工具注册表
        """
        self.policy_file = policy_file
        self.tool_registry = tool_registry
        self.policy_content = self._load_policy()

    def _load_policy(self) -> str:
        """加载标准流程文件内容"""
        if self.policy_file.exists():
            return self.policy_file.read_text(encoding="utf-8")
        return ""

    def process(
        self,
        old_email: str,
        basic_info: BasicInfo,
        conversation_history: list[dict[str, str]]
    ) -> dict[str, Any]:
        """
        处理客户问题

        Args:
            old_email: 邮件原文及历史
            basic_info: 基本信息
            conversation_history: 对话历史

        Returns:
            dict: 处理结果
            {
                "status": "success|needs_info|needs_human",
                "reply_content": "邮件回复内容",
                "tool_calls": [...],
                "next_steps": [...],
                "requires_human": False,
                "human_tasks": [],
                "confidence": 0.95
            }
        """
        raise NotImplementedError("子类必须实现 process 方法")

    def _build_prompt(self, old_email: str, basic_info: BasicInfo) -> str:
        """
        构建专家 Agent 的提示词

        Args:
            old_email: 邮件原文
            basic_info: 基本信息

        Returns:
            str: 完整的提示词
        """
        prompt = f"""# 角色定义
你是资深跨境电商客服专家,专注处理 {self.policy_file.stem} 相关问题。

# 业务处理流程
{self.policy_content}

# 当前客户邮件
{old_email}

# 基本信息
- 订单号: {basic_info.order_id or "未提供"}
- 问题类型: {basic_info.issue_type or "未知"}
- 平台: {basic_info.platform or "未知"}
- 服务阶段: {"售前" if basic_info.is_pre_sales else "售后" if basic_info.is_after_sales else "未知"}

# 任务指令
严格按照业务处理流程,生成专业的邮件回复。

# 输出格式
请以 JSON 格式输出:
{{
    "status": "success|needs_info|needs_human",
    "reply_content": "邮件回复内容",
    "tool_calls": [
        {{"tool_name": "工具名称", "parameters": {{}}, "result": {{}}}}
    ],
    "next_steps": ["下一步操作"],
    "requires_human": false,
    "human_tasks": [],
    "confidence": 0.95
}}
"""
        return prompt


class LogisticsExpert(BaseExpert):
    """物流问题专家"""

    def process(self, old_email: str, basic_info: BasicInfo, conversation_history: list) -> dict[str, Any]:
        """处理物流问题"""
        tool_calls = []
        reply_sections = []

        # Step 1: 查询订单基本信息
        if basic_info.order_id:
            order_result = self.tool_registry.call("query_order", {"order_id": basic_info.order_id})
            tool_calls.append({
                "tool_name": "query_order",
                "parameters": {"order_id": basic_info.order_id},
                "result": order_result
            })

            if order_result["status"] == "ok":
                # Step 2: 查询物流信息
                tracking_result = self.tool_registry.call("track_logistics", {"order_id": basic_info.order_id})
                tool_calls.append({
                    "tool_name": "track_logistics",
                    "parameters": {"order_id": basic_info.order_id},
                    "result": tracking_result
                })

                if tracking_result["status"] == "ok":
                    delivery_status = tracking_result.get("delivery_status", "unknown")
                    if delivery_status == "delivered":
                        reply_sections.append(
                            f"I checked your order {basic_info.order_id}. The tracking shows it was delivered on "
                            f"{tracking_result.get('delivered_at')}. Please check with your neighbors, mailbox, "
                            f"or building reception."
                        )
                    else:
                        reply_sections.append(
                            f"I checked your order {basic_info.order_id}. The latest tracking status is "
                            f"{delivery_status} at {tracking_result.get('last_update')}."
                        )
                else:
                    reply_sections.append(
                        f"I found your order {basic_info.order_id}, but tracking information is not available yet. "
                        f"The package should be shipped within 2 business days."
                    )
            else:
                return {
                    "status": "needs_info",
                    "reply_content": f"I could not find order {basic_info.order_id}. Please verify the order number.",
                    "tool_calls": tool_calls,
                    "next_steps": ["等待客户提供正确订单号"],
                    "requires_human": False,
                    "human_tasks": [],
                    "confidence": 0.6
                }
        else:
            return {
                "status": "needs_info",
                "reply_content": "To check the shipping status, I need your order number. Could you please provide it?",
                "tool_calls": tool_calls,
                "next_steps": ["等待客户提供订单号"],
                "requires_human": False,
                "human_tasks": [],
                "confidence": 0.5
            }

        reply_content = "\n\n".join(reply_sections)

        return {
            "status": "success",
            "reply_content": reply_content,
            "tool_calls": tool_calls,
            "next_steps": [],
            "requires_human": False,
            "human_tasks": [],
            "confidence": 0.9
        }


class QualityExpert(BaseExpert):
    """商品质量问题专家"""

    def process(self, old_email: str, basic_info: BasicInfo, conversation_history: list) -> dict[str, Any]:
        """处理商品质量问题"""
        tool_calls = []
        reply_sections = []

        if not basic_info.order_id:
            return {
                "status": "needs_info",
                "reply_content": "I'm sorry to hear about the quality issue. To assist you better, could you please provide your order number?",
                "tool_calls": [],
                "next_steps": ["等待客户提供订单号"],
                "requires_human": False,
                "human_tasks": [],
                "confidence": 0.5
            }

        # Step 1: 查询订单基本信息
        order_result = self.tool_registry.call("query_order", {"order_id": basic_info.order_id})
        tool_calls.append({
            "tool_name": "query_order",
            "parameters": {"order_id": basic_info.order_id},
            "result": order_result
        })

        if order_result["status"] != "ok":
            return {
                "status": "needs_info",
                "reply_content": f"I could not find order {basic_info.order_id}. Please verify the order number.",
                "tool_calls": tool_calls,
                "next_steps": ["等待客户提供正确订单号"],
                "requires_human": False,
                "human_tasks": [],
                "confidence": 0.6
            }

        # Step 2: 查询订单补充信息(判断是否在保)
        # 这里简化处理,实际需要传入 sku 和 end_date
        # supplement_result = self.tool_registry.call("query_order_supplement", {...})

        # Step 3: 判断是否需要提供技术支持
        if self._needs_technical_support(old_email):
            reply_sections.append(
                "I understand the issue you're experiencing. Before we proceed with a replacement or refund, "
                "could you please try the following troubleshooting steps:\n\n"
                "1. Check if the device is fully charged\n"
                "2. Try resetting the device\n"
                "3. Ensure all connections are secure\n\n"
                "Please let me know if these steps resolve the issue."
            )
            return {
                "status": "needs_info",
                "reply_content": "\n\n".join(reply_sections),
                "tool_calls": tool_calls,
                "next_steps": ["等待客户反馈技术支持结果"],
                "requires_human": False,
                "human_tasks": [],
                "confidence": 0.8
            }

        # Step 4: 查询库存,判断是否可以换货
        sku = order_result.get("sku", [""])[0]
        if sku:
            inventory_result = self.tool_registry.call("check_inventory", {"sku": sku})
            tool_calls.append({
                "tool_name": "check_inventory",
                "parameters": {"sku": sku},
                "result": inventory_result
            })

            if inventory_result["status"] == "ok" and inventory_result.get("available", 0) > 0:
                reply_sections.append(
                    f"I'm sorry about the quality issue with your order {basic_info.order_id}. "
                    f"I'd be happy to send you a replacement. Could you please confirm your shipping address?"
                )
            else:
                reply_sections.append(
                    f"I'm sorry about the quality issue with your order {basic_info.order_id}. "
                    f"Unfortunately, this item is currently out of stock. "
                    f"How about we issue you a full refund instead?"
                )

        reply_content = "\n\n".join(reply_sections)

        return {
            "status": "success",
            "reply_content": reply_content,
            "tool_calls": tool_calls,
            "next_steps": ["等待客户确认地址" if inventory_result.get("available", 0) > 0 else "等待客户确认退款"],
            "requires_human": False,
            "human_tasks": [],
            "confidence": 0.85
        }

    def _needs_technical_support(self, email_body: str) -> bool:
        """判断是否需要提供技术支持"""
        functional_keywords = ["not work", "doesn't work", "won't turn on", "not connect", "not pair"]
        return any(kw in email_body.lower() for kw in functional_keywords)


class MarkerQualityExpert(BaseExpert):
    """马克笔质量问题专家"""

    def process(self, old_email: str, basic_info: BasicInfo, conversation_history: list) -> dict[str, Any]:
        """处理马克笔质量问题"""
        # 这里简化处理,实际需要实现复杂的马克笔质量问题处理流程
        return {
            "status": "success",
            "reply_content": "I'm sorry about the marker quality issue. We'll arrange a replacement for you.",
            "tool_calls": [],
            "next_steps": ["安排换货"],
            "requires_human": False,
            "human_tasks": [],
            "confidence": 0.8
        }


class PreSalesExpert(BaseExpert):
    """售前咨询专家"""

    def process(self, old_email: str, basic_info: BasicInfo, conversation_history: list) -> dict[str, Any]:
        """处理售前咨询"""
        return {
            "status": "success",
            "reply_content": "Thank you for your interest in our products. How can I help you today?",
            "tool_calls": [],
            "next_steps": [],
            "requires_human": False,
            "human_tasks": [],
            "confidence": 0.7
        }


class ExpertPool:
    """
    专家 Agent 池

    管理所有专家 Agent,提供统一的调用接口
    """

    def __init__(self, policies_dir: Path, tool_registry):
        """
        初始化专家池

        Args:
            policies_dir: 标准流程文件目录
            tool_registry: 工具注册表
        """
        self.policies_dir = policies_dir
        self.tool_registry = tool_registry
        self.experts = self._initialize_experts()

    def _initialize_experts(self) -> dict[str, BaseExpert]:
        """初始化所有专家 Agent"""
        experts = {}

        from smart_customer_service.all_experts import (
            AfterSalesExpert,
            ShippingErrorExpert,
            DesignDescriptionExpert,
            CustomerReturnExpert,
            OrderModificationExpert,
            InfluencerExpert,
            InvoiceExpert,
            PointsExpert,
            EmailModificationExpert,
            FollowUpExpert,
            ResolvedExpert,
        )

        # 注册所有 15 个专家
        expert_mapping = {
            "物流问题处理流程.md": LogisticsExpert,
            "商品质量问题处理流程.md": QualityExpert,
            "马克笔质量问题处理流程.md": MarkerQualityExpert,
            "售前咨询处理流程.md": PreSalesExpert,
            "售后咨询处理流程.md": AfterSalesExpert,
            "发货差错问题处理流程.md": ShippingErrorExpert,
            "设计与描述差异问题处理流程.md": DesignDescriptionExpert,
            "客户原因退换货处理流程.md": CustomerReturnExpert,
            "订单修改与取消流程.md": OrderModificationExpert,
            "红人要样或合作处理流程.md": InfluencerExpert,
            "客户索要发票处理流程.md": InvoiceExpert,
            "官网积分处理流程.md": PointsExpert,
            "官网邮箱信息修改处理流程.md": EmailModificationExpert,
            "邮件跟进处理流程.md": FollowUpExpert,
            "问题已解决回复要求.md": ResolvedExpert,
        }

        for policy_file, expert_class in expert_mapping.items():
            policy_path = self.policies_dir / policy_file
            experts[policy_file] = expert_class(policy_path, self.tool_registry)

        return experts

    def invoke_expert(
        self,
        policy_file: str,
        old_email: str,
        basic_info,
        conversation_history: list[dict[str, str]]
    ) -> dict[str, Any]:
        """
        调用指定的专家 Agent

        Args:
            policy_file: 标准流程文件名
            old_email: 邮件原文
            basic_info: 基本信息
            conversation_history: 对话历史

        Returns:
            dict: 专家处理结果
        """
        expert = self.experts.get(policy_file)

        if expert is None:
            # 如果没有找到对应的专家,返回默认响应
            return {
                "status": "needs_human",
                "reply_content": f"This case requires manual review (policy: {policy_file}).",
                "tool_calls": [],
                "next_steps": [],
                "requires_human": True,
                "human_tasks": [f"未找到对应的专家处理 {policy_file}"],
                "confidence": 0.0
            }

        # 调用专家处理
        return expert.process(old_email, basic_info, conversation_history)

    def get_available_experts(self) -> list[str]:
        """获取所有可用的专家列表"""
        return list(self.experts.keys())
