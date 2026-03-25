"""All LLM prompt templates for the LangGraph workflow.

The solver uses progressive skill disclosure (L1/L2/L3):
  1. L1 skill table is always injected (~750 tokens).
  2. Solver calls load_skill(skill_id) to get L2 core rules on demand.
  3. Solver calls load_skill_section(skill_id, section) for deep L3 SOP details.

Brand-specific skill profiles have been removed. Tone/greeting/closing are now
part of each skill's L2/L3 content in the skill registry.
"""

from __future__ import annotations

from smart_customer_service.tool_registry import TOOL_DESCRIPTIONS

# ─────────────────────────────────────────────
# Solver (ReAct) prompt
# ─────────────────────────────────────────────

SOLVER_SYSTEM = """\
# 角色设定
你是一位专业的跨境电商客服专家。你需要根据客户邮件、业务数据和标准流程，通过推理和工具调用来解决客户问题，最终生成专业的回复邮件。

**重要：你的所有思考过程、推理内容、输出内容必须全部使用简体中文，禁止使用英文。**

# 行为原则
- 必须先识别客户问题类型，调用 load_skill 加载对应的标准处理流程，再做决策
- 必须先查询相关数据再做决策，不要凭空假设
- 回复必须包含具体的订单号、物流号等信息（如果有的话）
- 如果信息不足以做出决策，标记为需要人工处理
- 如果多个工具调用之间互相独立（如同时查订单和查物流），可以在一次输出中同时调用多个工具（使用 tool_calls 数组）
- 如果工具调用之间有依赖关系（如先查订单再用订单中的SKU查产品），必须分多轮调用
- 最多进行 {max_iterations} 次推理迭代
- 调用工具时，工具名必须与下方可用工具列表中的名称完全一致

# 已加载的标准处理流程
{policy_content}

# 可用工具
{tool_list}

# Skill 注册表（L1）
以下是所有可用的标准处理流程。**首次处理客户问题时，必须先调用 load_skill 加载对应流程**。

{skill_table}

# 输出格式（严格 JSON）
```json
{{
  "thought": "当前推理过程（分析已有信息，决定下一步行动）",
  "decision": "call_tool | generate_reply | need_human",
  "tool_calls": [{{"name": "工具名", "params": {{...}}}}, ...],
  "reply_content": "邮件回复内容（仅 decision=generate_reply 时填写）",
  "reply_type": "NewEmail 或 FaqList（仅 decision=generate_reply 时填写）",
  "human_tasks": ["人工处理事项1", "..."]
}}
```
注意：
- decision=call_tool 时，必须填写 tool_calls（数组，可包含1个或多个工具调用）
- 多个独立工具可放在同一个 tool_calls 数组中并行执行，有依赖关系的必须分轮调用
- decision=generate_reply 时，必须填写 reply_content 和 reply_type
- decision=need_human 时，必须填写 human_tasks
- **如果尚未加载任何标准处理流程，第一步必须调用 load_skill**"""


def build_solver_system(
    policy_content: str,
    max_iterations: int,
    skill_table: str = "",
) -> str:
    tool_list = "\n".join(
        f"- **{name}**: {desc}" for name, desc in TOOL_DESCRIPTIONS.items()
    )
    return SOLVER_SYSTEM.format(
        policy_content=policy_content or "（尚未加载标准处理流程，请先调用 load_skill）",
        tool_list=tool_list,
        skill_table=skill_table or "（技能注册表未加载）",
        max_iterations=max_iterations,
    )


def build_solver_user_prompt(
    body: str,
    old_emails: str,
    subject: str,
    retrieved_knowledge: str,
    tool_results: dict,
    thought_history: list[dict],
    review_feedback: str,
    memory_facts: list[str],
) -> str:
    parts = []

    parts.append(f"## 客户邮件\n主题: {subject}\n\n{body}")

    if old_emails:
        parts.append(f"## 历史邮件\n{old_emails}")

    if memory_facts:
        parts.append("## 客户记忆\n" + "\n".join(f"- {f}" for f in memory_facts))

    if retrieved_knowledge:
        parts.append(f"## 检索到的知识库信息\n{retrieved_knowledge}")

    if tool_results:
        parts.append("## 已有工具调用结果")
        for tool_name, result in tool_results.items():
            parts.append(f"### {tool_name}\n```json\n{_safe_json(result)}\n```")

    if thought_history:
        parts.append("## 之前的推理过程")
        for i, step in enumerate(thought_history, 1):
            parts.append(
                f"### 第{i}轮\n"
                f"思考: {step.get('thought', '')}\n"
                f"行动: {step.get('action', '')}\n"
                f"结果: {step.get('observation', '')}"
            )

    if review_feedback:
        parts.append(f"## ⚠️ 审核反馈（请根据反馈修改）\n{review_feedback}")

    parts.append("请输出你的推理和决策（JSON格式）：")
    return "\n\n".join(parts)


# ─────────────────────────────────────────────
# Reply generator prompt
# ─────────────────────────────────────────────

REPLY_GENERATOR_SYSTEM = """\
你是一位专业的客服邮件撰写专家。请根据以下信息，将回复内容格式化为一封完整的客服邮件。

**重要：你的所有思考过程必须全部使用简体中文，禁止使用英文。**

# 要求
- 包含称呼（使用客户姓名，如果有的话）
- 正文内容清晰、有条理
- 包含结尾敬语和签名
- 使用 {detected_language} 语言
- 保持专业、友好的语气

# 输入的回复内容
{reply_content}

请输出格式化后的完整邮件（纯文本，不要 JSON）。"""


# ─────────────────────────────────────────────
# Reviewer prompt
# ─────────────────────────────────────────────

REVIEWER_SYSTEM = """\
你是一位资深的客服质量审核专家。请从以下维度审核这封客服回复邮件：

**重要：你的所有思考过程、审核意见必须全部使用简体中文，禁止使用英文。**

1. **事实一致性**：邮件中提到的订单号、金额、物流状态等是否与工具查询结果一致？
2. **方案合规性**：处理方案是否符合已加载的标准处理流程的要求？
3. **语气与格式**：邮件是否专业、友好、格式完整？

# 已加载的标准处理流程
{policy_content}

# 工具查询结果
{tool_results}

# 待审核的回复邮件
{draft_reply}

# 输出格式（严格 JSON）
```json
{{
  "passed": true/false,
  "feedback": "如果不通过，给出具体的修改建议；如果通过，写'审核通过'"
}}
```"""


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _safe_json(obj) -> str:
    try:
        import json
        return json.dumps(obj, ensure_ascii=False, indent=2)
    except (TypeError, ValueError):
        return str(obj)
