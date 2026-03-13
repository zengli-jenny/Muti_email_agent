"""
完整的专家 Agent 实现 - 剩余 11 个专家
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from smart_customer_service.expert_pool import BaseExpert
from smart_customer_service.coordinator_agent import BasicInfo


class AfterSalesExpert(BaseExpert):
    """售后咨询专家"""

    def process(self, old_email: str, basic_info: BasicInfo, conversation_history: list) -> dict[str, Any]:
        """处理售后咨询"""
        tool_calls = []
        reply_sections = []

        # 判断咨询类型
        email_lower = old_email.lower()

        if "refund status" in email_lower or "when will refund" in email_lower:
            # 退款进度咨询
            if basic_info.order_id:
                order_result = self.tool_registry.call("query_order", {"order_id": basic_info.order_id})
                tool_calls.append({
                    "tool_name": "query_order",
                    "parameters": {"order_id": basic_info.order_id},
                    "result": order_result
                })

                if order_result["status"] == "ok":
                    refund_status = order_result.get("refund_status", "not_processed")
                    if refund_status == "processed":
                        reply_sections.append(
                            f"I checked your order {basic_info.order_id}. The refund has been processed and "
                            f"should be credited to your original payment method within 3-7 business days."
                        )
                    else:
                        reply_sections.append(
                            f"I checked your order {basic_info.order_id}. The refund is currently being processed. "
                            f"You should receive it within 3-7 business days."
                        )
            else:
                return {
                    "status": "needs_info",
                    "reply_content": "To check the refund status, I need your order number. Could you please provide it?",
                    "tool_calls": [],
                    "next_steps": ["等待客户提供订单号"],
                    "requires_human": False,
                    "human_tasks": [],
                    "confidence": 0.5
                }

        elif "how to use" in email_lower or "manual" in email_lower or "instruction" in email_lower:
            # 产品使用咨询
            reply_sections.append(
                "I'd be happy to help you with the product usage. Could you please let me know which specific "
                "feature or function you need assistance with? If you need the user manual, I can send it to you."
            )

        else:
            # 其他售后咨询
            reply_sections.append(
                "Thank you for contacting us. I'm here to help with your after-sales inquiry. "
                "Could you please provide more details about your question?"
            )

        reply_content = "\n\n".join(reply_sections)

        return {
            "status": "success",
            "reply_content": reply_content,
            "tool_calls": tool_calls,
            "next_steps": [],
            "requires_human": False,
            "human_tasks": [],
            "confidence": 0.85
        }


class ShippingErrorExpert(BaseExpert):
    """发货差错问题专家"""

    def process(self, old_email: str, basic_info: BasicInfo, conversation_history: list) -> dict[str, Any]:
        """处理发货差错问题"""
        tool_calls = []
        reply_sections = []

        if not basic_info.order_id:
            return {
                "status": "needs_info",
                "reply_content": "I'm sorry to hear about the shipping error. To assist you, I need your order number.",
                "tool_calls": [],
                "next_steps": ["等待客户提供订单号"],
                "requires_human": False,
                "human_tasks": [],
                "confidence": 0.5
            }

        # 查询订单信息
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

        # 判断发货差错类型
        email_lower = old_email.lower()

        if "wrong item" in email_lower or "wrong product" in email_lower:
            # 发错货
            reply_sections.append(
                f"I'm very sorry that you received the wrong item for order {basic_info.order_id}. "
                f"I'd be happy to send you the correct item. Could you please confirm your shipping address?"
            )
        elif "missing item" in email_lower:
            # 发少货
            reply_sections.append(
                f"I'm sorry that your order {basic_info.order_id} is missing an item. "
                f"I'll arrange to send the missing item to you. Could you please confirm your shipping address?"
            )
        elif "extra item" in email_lower:
            # 发多货
            reply_sections.append(
                f"Thank you for letting us know about the extra item in order {basic_info.order_id}. "
                f"You may keep it as a gift from us. No need to return it."
            )
        else:
            reply_sections.append(
                f"I'm sorry about the shipping error with order {basic_info.order_id}. "
                f"Could you please provide more details about what went wrong?"
            )

        reply_content = "\n\n".join(reply_sections)

        return {
            "status": "success",
            "reply_content": reply_content,
            "tool_calls": tool_calls,
            "next_steps": ["等待客户确认地址"],
            "requires_human": False,
            "human_tasks": [],
            "confidence": 0.9
        }


class DesignDescriptionExpert(BaseExpert):
    """设计与描述差异问题专家"""

    def process(self, old_email: str, basic_info: BasicInfo, conversation_history: list) -> dict[str, Any]:
        """处理设计与描述差异问题"""
        tool_calls = []
        reply_sections = []

        if not basic_info.order_id:
            return {
                "status": "needs_info",
                "reply_content": "I'm sorry the product didn't meet your expectations. To assist you, I need your order number.",
                "tool_calls": [],
                "next_steps": ["等待客户提供订单号"],
                "requires_human": False,
                "human_tasks": [],
                "confidence": 0.5
            }

        # 查询订单信息
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

        # 设计与描述差异问题通常无法通过换货解决,提供退款
        reply_sections.append(
            f"I'm sorry that the product didn't match your expectations for order {basic_info.order_id}. "
            f"Since this is a design/description issue, I'd like to offer you a full refund. "
            f"Would that be acceptable to you?"
        )

        reply_content = "\n\n".join(reply_sections)

        return {
            "status": "success",
            "reply_content": reply_content,
            "tool_calls": tool_calls,
            "next_steps": ["等待客户确认退款"],
            "requires_human": False,
            "human_tasks": [],
            "confidence": 0.85
        }


class CustomerReturnExpert(BaseExpert):
    """客户原因退换货专家"""

    def process(self, old_email: str, basic_info: BasicInfo, conversation_history: list) -> dict[str, Any]:
        """处理客户原因退换货"""
        tool_calls = []
        reply_sections = []

        if not basic_info.order_id:
            return {
                "status": "needs_info",
                "reply_content": "I understand you'd like to return the item. To assist you, I need your order number.",
                "tool_calls": [],
                "next_steps": ["等待客户提供订单号"],
                "requires_human": False,
                "human_tasks": [],
                "confidence": 0.5
            }

        # 查询订单信息
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

        # 判断是退货还是换货
        email_lower = old_email.lower()

        if "exchange" in email_lower or "replace" in email_lower:
            # 换货
            reply_sections.append(
                f"I understand you'd like to exchange the item from order {basic_info.order_id}. "
                f"Could you please let me know which product you'd like to exchange it for?"
            )
        else:
            # 退货退款
            reply_sections.append(
                f"I understand you'd like to return the item from order {basic_info.order_id}. "
                f"I'd be happy to process a full refund for you. Would that work for you?"
            )

        reply_content = "\n\n".join(reply_sections)

        return {
            "status": "success",
            "reply_content": reply_content,
            "tool_calls": tool_calls,
            "next_steps": ["等待客户确认"],
            "requires_human": False,
            "human_tasks": [],
            "confidence": 0.85
        }


class OrderModificationExpert(BaseExpert):
    """订单修改与取消专家"""

    def process(self, old_email: str, basic_info: BasicInfo, conversation_history: list) -> dict[str, Any]:
        """处理订单修改与取消"""
        tool_calls = []
        reply_sections = []

        if not basic_info.order_id:
            return {
                "status": "needs_info",
                "reply_content": "To modify or cancel your order, I need your order number. Could you please provide it?",
                "tool_calls": [],
                "next_steps": ["等待客户提供订单号"],
                "requires_human": False,
                "human_tasks": [],
                "confidence": 0.5
            }

        # 查询订单信息
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

        # 判断订单状态
        order_status = order_result.get("order_status", "unknown")

        if order_status == "shipped":
            reply_sections.append(
                f"I checked your order {basic_info.order_id}. Unfortunately, it has already been shipped, "
                f"so we cannot modify or cancel it at this point. However, once you receive it, "
                f"you can return it for a full refund if needed."
            )
        elif order_status in ["pending", "processing"]:
            email_lower = old_email.lower()
            if "cancel" in email_lower:
                reply_sections.append(
                    f"I can help you cancel order {basic_info.order_id}. "
                    f"I'll process the cancellation and issue a full refund. Is that okay?"
                )
            elif "change address" in email_lower or "update address" in email_lower:
                reply_sections.append(
                    f"I can help you update the shipping address for order {basic_info.order_id}. "
                    f"Could you please provide the new address?"
                )
            else:
                reply_sections.append(
                    f"I can help you modify order {basic_info.order_id}. "
                    f"What would you like to change?"
                )
        else:
            reply_sections.append(
                f"I checked your order {basic_info.order_id}. The current status is {order_status}. "
                f"Could you please let me know what you'd like to modify?"
            )

        reply_content = "\n\n".join(reply_sections)

        return {
            "status": "success",
            "reply_content": reply_content,
            "tool_calls": tool_calls,
            "next_steps": ["等待客户确认"],
            "requires_human": False,
            "human_tasks": [],
            "confidence": 0.85
        }


class InfluencerExpert(BaseExpert):
    """红人要样或合作专家"""

    def process(self, old_email: str, basic_info: BasicInfo, conversation_history: list) -> dict[str, Any]:
        """处理红人要样或合作"""
        # 红人要样或合作通常需要人工审核
        email_lower = old_email.lower()

        if any(kw in email_lower for kw in ["youtube", "instagram", "tiktok", "influencer"]):
            # 红人合作
            return {
                "status": "needs_human",
                "reply_content": (
                    "Thank you for your interest in collaborating with us! "
                    "We appreciate influencers who love our products. "
                    "Our marketing team will review your request and get back to you within 2-3 business days. "
                    "Could you please share your social media profile links and follower count?"
                ),
                "tool_calls": [],
                "next_steps": [],
                "requires_human": True,
                "human_tasks": ["红人合作申请,需要市场部审核"],
                "confidence": 0.7
            }
        else:
            # 要样请求
            return {
                "status": "needs_human",
                "reply_content": (
                    "Thank you for your interest in our products. "
                    "We occasionally provide samples for special occasions. "
                    "Our team will review your request and get back to you soon."
                ),
                "tool_calls": [],
                "next_steps": [],
                "requires_human": True,
                "human_tasks": ["要样请求,需要人工审核"],
                "confidence": 0.7
            }


class InvoiceExpert(BaseExpert):
    """客户索要发票专家"""

    def process(self, old_email: str, basic_info: BasicInfo, conversation_history: list) -> dict[str, Any]:
        """处理客户索要发票"""
        tool_calls = []
        reply_sections = []

        if not basic_info.order_id:
            return {
                "status": "needs_info",
                "reply_content": "To provide you with an invoice, I need your order number. Could you please provide it?",
                "tool_calls": [],
                "next_steps": ["等待客户提供订单号"],
                "requires_human": False,
                "human_tasks": [],
                "confidence": 0.5
            }

        # 查询订单信息
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

        # 判断平台
        platform = order_result.get("platform", "")

        if platform == "Amazon":
            # 亚马逊订单
            reply_sections.append(
                f"For Amazon orders, the invoice is provided directly by Amazon. "
                f"You can download it from your Amazon account under 'Your Orders'. "
                f"If you need any assistance, please let me know."
            )
        else:
            # 官网订单
            reply_sections.append(
                f"I'd be happy to provide you with an invoice for order {basic_info.order_id}. "
                f"I'll send it to your email address within 24 hours. "
                f"If you need it urgently, please let me know."
            )

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


class PointsExpert(BaseExpert):
    """官网积分专家"""

    def process(self, old_email: str, basic_info: BasicInfo, conversation_history: list) -> dict[str, Any]:
        """处理官网积分问题"""
        email_lower = old_email.lower()

        if "transfer" in email_lower or "move" in email_lower:
            # 积分转移
            return {
                "status": "needs_human",
                "reply_content": (
                    "Thank you for contacting us about transferring your points. "
                    "Our customer service team will review your request and assist you with the transfer. "
                    "Could you please provide both the old and new email addresses?"
                ),
                "tool_calls": [],
                "next_steps": [],
                "requires_human": True,
                "human_tasks": ["积分转移请求,需要人工处理"],
                "confidence": 0.7
            }
        elif "redeem" in email_lower or "use" in email_lower:
            # 积分兑换
            return {
                "status": "success",
                "reply_content": (
                    "You can redeem your points on our website during checkout. "
                    "Simply log in to your account, add items to your cart, and you'll see the option "
                    "to apply your points at checkout. If you need any assistance, please let me know."
                ),
                "tool_calls": [],
                "next_steps": [],
                "requires_human": False,
                "human_tasks": [],
                "confidence": 0.85
            }
        else:
            # 其他积分问题
            return {
                "status": "success",
                "reply_content": (
                    "Thank you for contacting us about your points. "
                    "Could you please provide more details about your inquiry? "
                    "For example, are you looking to check your points balance, redeem points, or transfer points?"
                ),
                "tool_calls": [],
                "next_steps": ["等待客户提供更多信息"],
                "requires_human": False,
                "human_tasks": [],
                "confidence": 0.7
            }


class EmailModificationExpert(BaseExpert):
    """官网邮箱信息修改专家"""

    def process(self, old_email: str, basic_info: BasicInfo, conversation_history: list) -> dict[str, Any]:
        """处理官网邮箱信息修改"""
        return {
            "status": "needs_human",
            "reply_content": (
                "Thank you for contacting us about updating your email address. "
                "For security reasons, our customer service team will need to verify your identity "
                "before making this change. Could you please provide:\n\n"
                "1. Your current email address\n"
                "2. Your new email address\n"
                "3. Your order number (if you have one)\n\n"
                "Our team will process your request within 1-2 business days."
            ),
            "tool_calls": [],
            "next_steps": [],
            "requires_human": True,
            "human_tasks": ["邮箱修改请求,需要人工验证身份"],
            "confidence": 0.8
        }


class FollowUpExpert(BaseExpert):
    """邮件跟进专家"""

    def process(self, old_email: str, basic_info: BasicInfo, conversation_history: list) -> dict[str, Any]:
        """处理邮件跟进"""
        tool_calls = []
        reply_sections = []

        if not basic_info.order_id:
            return {
                "status": "needs_info",
                "reply_content": "To follow up on your case, I need your order number. Could you please provide it?",
                "tool_calls": [],
                "next_steps": ["等待客户提供订单号"],
                "requires_human": False,
                "human_tasks": [],
                "confidence": 0.5
            }

        # 查询订单信息
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

        # 查询物流信息
        tracking_result = self.tool_registry.call("track_logistics", {"order_id": basic_info.order_id})
        tool_calls.append({
            "tool_name": "track_logistics",
            "parameters": {"order_id": basic_info.order_id},
            "result": tracking_result
        })

        # 生成跟进邮件
        reply_sections.append(
            f"Thank you for your patience. I wanted to follow up on your order {basic_info.order_id}."
        )

        if tracking_result["status"] == "ok":
            delivery_status = tracking_result.get("delivery_status", "unknown")
            reply_sections.append(
                f"The latest tracking status is {delivery_status}. "
                f"If you have any questions or concerns, please let me know."
            )
        else:
            reply_sections.append(
                "I'm still checking on the status and will update you as soon as I have more information."
            )

        reply_content = "\n\n".join(reply_sections)

        return {
            "status": "success",
            "reply_content": reply_content,
            "tool_calls": tool_calls,
            "next_steps": [],
            "requires_human": False,
            "human_tasks": [],
            "confidence": 0.85
        }


class ResolvedExpert(BaseExpert):
    """问题已解决专家"""

    def process(self, old_email: str, basic_info: BasicInfo, conversation_history: list) -> dict[str, Any]:
        """处理问题已解决场景"""
        # 简单的感谢回复
        return {
            "status": "success",
            "reply_content": (
                "You're very welcome! I'm glad we could help resolve your issue. "
                "If you need anything else in the future, please don't hesitate to reach out. "
                "Have a great day!"
            ),
            "tool_calls": [],
            "next_steps": [],
            "requires_human": False,
            "human_tasks": [],
            "confidence": 0.95
        }
