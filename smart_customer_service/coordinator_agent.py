"""
协调 Agent (Coordinator Agent)
负责整体流程编排、人工介入判断、最终回复生成
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from smart_customer_service.models import WorkflowState
from smart_customer_service.router_agent import RouterAgent
from smart_customer_service.expert_pool import ExpertPool


@dataclass
class BasicInfo:
    """从邮件中提取的基本信息"""
    order_id: str | None = None
    customer_name: str | None = None
    issue_type: str | None = None
    order_status: str | None = None
    platform: str | None = None  # Amazon / 官网
    country: str | None = None
    has_order: bool = False
    is_pre_sales: bool = False
    is_after_sales: bool = False


@dataclass
class CoordinatorResult:
    """协调 Agent 的输出结果"""
    final_reply: str
    selected_policies: list[str]
    expert_results: list[dict[str, Any]]
    requires_human: bool
    human_tasks: list[str]
    confidence: float
    metrics: dict[str, Any]


class CoordinatorAgent:
    """
    协调 Agent - 整体流程编排

    职责:
    1. 提取邮件基本信息 (BasicInfo)
    2. 调用路由 Agent 获取适用的标准流程
    3. 编排专家 Agent 的执行顺序
    4. 判断是否需要人工介入
    5. 整合多个专家的输出,生成最终回复
    """

    def __init__(self, router: RouterAgent, expert_pool: ExpertPool):
        self.router = router
        self.expert_pool = expert_pool

    def coordinate(self, state: WorkflowState) -> CoordinatorResult:
        """
        协调整个处理流程

        Args:
            state: 工作流状态,包含邮件内容等信息

        Returns:
            CoordinatorResult: 协调结果,包含最终回复和元数据
        """
        # Step 1: 提取基本信息
        basic_info = self._extract_basic_info(state)

        # Step 2: 调用路由 Agent 获取适用的标准流程
        policies = self.router.route(state.body, basic_info)

        # Step 3: 依次调用专家 Agent 处理
        expert_results = []
        requires_human = False
        human_tasks = []

        for policy_file in policies:
            expert_result = self.expert_pool.invoke_expert(
                policy_file=policy_file,
                old_email=state.body,
                basic_info=basic_info,
                conversation_history=state.conversation_history
            )

            expert_results.append(expert_result)

            # 如果专家返回需要人工介入,记录下来
            if expert_result.get("requires_human"):
                requires_human = True
                human_tasks.extend(expert_result.get("human_tasks", []))

            # 如果专家已经给出完整回复且置信度高,可以提前终止
            if expert_result.get("status") == "success" and expert_result.get("confidence", 0) > 0.9:
                break

        # Step 4: 整合所有专家的输出,生成最终回复
        final_reply = self._merge_expert_outputs(expert_results, state)

        # Step 5: 计算整体置信度
        confidence = self._calculate_confidence(expert_results)

        # Step 6: 如果置信度过低,自动转人工
        if confidence < 0.7:
            requires_human = True
            human_tasks.append("置信度过低,需要人工审核")

        # Step 7: 收集指标
        metrics = {
            "policies_count": len(policies),
            "experts_invoked": len(expert_results),
            "total_tool_calls": sum(len(r.get("tool_calls", [])) for r in expert_results),
            "confidence": confidence
        }

        return CoordinatorResult(
            final_reply=final_reply,
            selected_policies=policies,
            expert_results=expert_results,
            requires_human=requires_human,
            human_tasks=human_tasks,
            confidence=confidence,
            metrics=metrics
        )

    def _extract_basic_info(self, state: WorkflowState) -> BasicInfo:
        """
        从邮件中提取基本信息

        这里使用简单的规则提取,实际可以用 LLM 提取
        """
        body = state.body.lower()

        # 提取订单号
        import re
        order_pattern = r"#?([A-Z]{3,}\d{5,}|\d{3}-\d{7}-\d{7})"
        order_match = re.search(order_pattern, state.body, re.IGNORECASE)
        order_id = order_match.group(1) if order_match else None

        # 判断是否有订单
        has_order = order_id is not None

        # 判断售前/售后
        pre_sales_keywords = ["buy", "purchase", "price", "available", "stock", "recommend"]
        is_pre_sales = any(kw in body for kw in pre_sales_keywords) and not has_order
        is_after_sales = has_order or any(kw in body for kw in ["refund", "return", "broken", "defect"])

        # 判断平台
        platform = None
        if "amazon" in body:
            platform = "Amazon"
        elif any(domain in body for domain in ["ohuhu.com", "tribit.com", "iclever.com", "sportneer.com"]):
            platform = "官网"

        # 判断问题类型
        issue_type = None
        if any(kw in body for kw in ["tracking", "delivered", "not received", "package"]):
            issue_type = "logistics"
        elif any(kw in body for kw in ["broken", "defect", "not work", "quality"]):
            issue_type = "quality"
        elif any(kw in body for kw in ["refund", "return"]):
            issue_type = "refund"
        elif any(kw in body for kw in ["exchange", "replace"]):
            issue_type = "exchange"

        return BasicInfo(
            order_id=order_id,
            has_order=has_order,
            is_pre_sales=is_pre_sales,
            is_after_sales=is_after_sales,
            platform=platform,
            issue_type=issue_type
        )

    def _merge_expert_outputs(self, expert_results: list[dict], state: WorkflowState) -> str:
        """
        整合多个专家的输出,生成最终邮件回复

        Args:
            expert_results: 所有专家的返回结果
            state: 工作流状态

        Returns:
            str: 最终的邮件回复
        """
        if not expert_results:
            return "Thank you for contacting us. We will get back to you shortly."

        # 如果只有一个专家,直接返回其回复
        if len(expert_results) == 1:
            return expert_results[0].get("reply_content", "")

        # 如果有多个专家,需要整合
        # 这里简化处理,实际可以用 LLM 做更智能的整合
        sections = []
        for result in expert_results:
            content = result.get("reply_content", "")
            if content:
                sections.append(content)

        return "\n\n".join(sections)

    def _calculate_confidence(self, expert_results: list[dict]) -> float:
        """
        计算整体置信度

        Args:
            expert_results: 所有专家的返回结果

        Returns:
            float: 整体置信度 (0-1)
        """
        if not expert_results:
            return 0.0

        confidences = [r.get("confidence", 0.5) for r in expert_results]
        return sum(confidences) / len(confidences)
