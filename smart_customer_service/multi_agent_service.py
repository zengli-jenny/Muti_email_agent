"""
新版客服系统服务入口
整合协调 Agent、路由 Agent 和专家池
"""
from __future__ import annotations

from pathlib import Path

from smart_customer_service.coordinator_agent import CoordinatorAgent
from smart_customer_service.router_agent import RouterAgent
from smart_customer_service.expert_pool import ExpertPool
from smart_customer_service.tools import BusinessToolRegistry
from smart_customer_service.models import WorkflowState


class MultiAgentCustomerService:
    """
    多专家 Agent 客服系统

    架构:
    - 协调 Agent: 整体流程编排
    - 路由 Agent: 根据政策路由规则分发
    - 专家池: 15 个专家 Agent,每个专注一个标准流程
    - 工具层: 统一的 API 调用接口
    """

    def __init__(self, base_dir: Path | None = None):
        """
        初始化多专家客服系统

        Args:
            base_dir: 项目根目录,默认为当前文件的父目录
        """
        if base_dir is None:
            base_dir = Path(__file__).parent.parent

        self.base_dir = base_dir
        self.policies_dir = base_dir / "标准流程"
        self.data_dir = base_dir / "data"

        # 初始化工具注册表
        self.tool_registry = BusinessToolRegistry(self.data_dir / "business_data.json")

        # 初始化路由 Agent
        self.router = RouterAgent(base_dir / "政策路由.md")

        # 初始化专家池
        self.expert_pool = ExpertPool(self.policies_dir, self.tool_registry)

        # 初始化协调 Agent
        self.coordinator = CoordinatorAgent(self.router, self.expert_pool)

    def handle_request(self, payload: dict) -> dict:
        """
        处理客户请求

        Args:
            payload: 请求数据
            {
                "customer_email": "客户邮箱",
                "brand": "品牌",
                "subject": "邮件主题",
                "body": "邮件正文",
                "auto_execute": false,
                "conversation_history": []
            }

        Returns:
            dict: 处理结果
            {
                "final_reply": "最终邮件回复",
                "selected_policies": ["物流问题处理流程.md"],
                "expert_results": [...],
                "requires_human": false,
                "human_tasks": [],
                "confidence": 0.95,
                "metrics": {...}
            }
        """
        # 验证必填字段
        self._validate(payload)

        # 构建工作流状态
        state = WorkflowState(
            customer_email=payload["customer_email"],
            brand=payload["brand"].lower(),
            subject=payload["subject"],
            body=payload["body"],
            auto_execute=bool(payload.get("auto_execute", False)),
            conversation_history=payload.get("conversation_history", [])
        )

        # 调用协调 Agent 处理
        result = self.coordinator.coordinate(state)

        # 返回结果
        return {
            "final_reply": result.final_reply,
            "selected_policies": result.selected_policies,
            "expert_results": result.expert_results,
            "requires_human": result.requires_human,
            "human_tasks": result.human_tasks,
            "confidence": result.confidence,
            "metrics": result.metrics
        }

    def _validate(self, payload: dict) -> None:
        """验证请求参数"""
        required = {"customer_email", "brand", "subject", "body"}
        missing = sorted(field for field in required if not payload.get(field))
        if missing:
            raise ValueError(f"Missing required fields: {', '.join(missing)}")

    def get_system_info(self) -> dict:
        """获取系统信息"""
        return {
            "architecture": "Multi-Agent Expert System",
            "available_experts": self.expert_pool.get_available_experts(),
            "policies_dir": str(self.policies_dir),
            "version": "2.0.0"
        }
