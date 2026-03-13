# 智能客服系统 - 技术架构升级指令

> 这份文档是给 Claude Code 的详细技术指令，目的是把当前的"协调Agent→路由Agent→15个专家Agent"架构，升级为完整的 LangGraph Multi-Agent + Hybrid RAG + MCP + ReAct + Reflection 架构。

---

## 当前状态分析

你已经完成了：
- 协调Agent（coordinator）、路由Agent（router）、15个专家Agent的基础框架
- 基于规则的路由匹配（9个场景）
- 硬编码逻辑模拟专家行为
- HTTP服务入口

需要升级的：
1. 专家Agent从硬编码规则 → LLM驱动 + ReAct推理循环
2. 加入Reflection审核机制
3. 知识检索从无 → Hybrid RAG（ES + 向量检索 + 知识图谱）
4. 工具调用从直接调API → MCP协议封装
5. 加入长记忆管理和Skills动态加载
6. 全链路可观测（LangSmith或自建trace）

---

## 第一步：用 LangGraph 重构核心编排层

### 1.1 安装依赖

```bash
pip install langgraph langchain langchain-openai langsmith
# 如果用Qwen API
pip install dashscope
# 向量检索
pip install pymilvus elasticsearch
# 知识图谱（可选，先用简单实现）
pip install neo4j
```

### 1.2 定义全局 State

这是所有Agent共享的状态对象，是LangGraph的核心。每个Agent读取和写入这个State。

```python
from typing import TypedDict, List, Optional, Annotated
from langgraph.graph import add_messages

class CustomerServiceState(TypedDict):
    # === 输入 ===
    customer_email: str          # 客户邮件原文
    old_emails: str              # 历史邮件上下文
    brand: str                   # 品牌（iClever/Tribit/Ohuhu等）
    site: str                    # 站点（US/EU/UK等）
    order_ids: List[str]         # 提取到的订单号列表
    
    # === 路由结果 ===
    intents: List[dict]          # 识别到的意图列表，每个含 type/description/order_id
    current_intent_index: int    # 当前正在处理的意图索引
    
    # === 检索结果 ===
    retrieved_knowledge: str     # RAG检索到的知识
    tool_results: dict           # 工具调用结果（订单信息、物流状态等）
    
    # === ReAct推理过程 ===
    thought_history: List[dict]  # Thought→Action→Observation的完整链路
    react_iteration: int         # 当前ReAct循环次数
    max_react_iterations: int    # 最大循环次数（默认5）
    
    # === 生成结果 ===
    draft_reply: str             # 生成的邮件草稿
    
    # === Reflection审核 ===
    review_feedback: Optional[str]  # 审核反馈，None表示通过
    review_passed: bool             # 是否通过审核
    reflection_count: int           # 已反思次数
    max_reflections: int            # 最大反思次数（默认2）
    
    # === 最终输出 ===
    final_reply: str             # 最终发送的邮件
    auto_send: bool              # 是否可以自动发送（vs需要人工确认）
    
    # === 长记忆 ===
    customer_memory: dict        # 从Redis加载的客户记忆
    
    # === Skills ===
    active_skills: str           # 当前加载的品牌Skills内容
    
    # === 追踪 ===
    trace_log: List[dict]        # 全链路追踪日志
```

### 1.3 LangGraph 工作流定义

```python
from langgraph.graph import StateGraph, END

workflow = StateGraph(CustomerServiceState)

# 添加节点
workflow.add_node("load_context", load_context_node)       # 加载记忆+Skills
workflow.add_node("router", router_node)                   # 意图路由
workflow.add_node("retriever", retriever_node)             # 知识检索
workflow.add_node("solver", solver_node)                   # ReAct方案决策
workflow.add_node("tool_executor", tool_executor_node)     # 执行工具调用
workflow.add_node("reply_generator", reply_generator_node) # 生成回复
workflow.add_node("reviewer", reviewer_node)               # Reflection审核

# 定义边
workflow.set_entry_point("load_context")
workflow.add_edge("load_context", "router")
workflow.add_edge("router", "retriever")
workflow.add_edge("retriever", "solver")

# Solver的条件边：决定是调工具还是生成回复
workflow.add_conditional_edges(
    "solver",
    decide_solver_next,  # 这个函数根据thought决定下一步
    {
        "call_tool": "tool_executor",
        "generate_reply": "reply_generator",
        "max_iterations_reached": "reply_generator"
    }
)

# 工具执行完回到Solver继续推理
workflow.add_edge("tool_executor", "solver")

# 回复生成后进入审核
workflow.add_edge("reply_generator", "reviewer")

# Reviewer的条件边：通过则结束，不通过则回Solver重来
workflow.add_conditional_edges(
    "reviewer",
    decide_review_result,
    {
        "approved": END,
        "rejected": "solver",  # 带着feedback回到Solver
        "max_reflections": END  # 超过最大反思次数，降级人工
    }
)

graph = workflow.compile()
```

---

## 第二步：各节点的详细实现

### 2.1 load_context_node — 加载记忆和Skills

```python
import redis
import os

async def load_context_node(state: CustomerServiceState) -> dict:
    """
    做两件事：
    1. 从Redis加载客户历史记忆（之前的诉求、已执行的方案等）
    2. 根据品牌加载对应的Skills文件
    """
    # --- 长记忆 ---
    r = redis.Redis(host='localhost', port=6379, db=0)
    customer_key = f"memory:{state['customer_email']}"
    memory_data = r.get(customer_key)
    customer_memory = json.loads(memory_data) if memory_data else {}
    
    # --- Skills动态加载 ---
    brand = state['brand'].lower()
    skills_dir = f"skills/{brand}/"
    active_skills = ""
    
    # 加载该品牌的通用策略
    general_skill = f"{skills_dir}general_policy.md"
    if os.path.exists(general_skill):
        with open(general_skill, 'r') as f:
            active_skills += f.read() + "\n\n"
    
    # 根据初步意图判断加载哪些专项Skill
    # 这里可以简单用关键词匹配，后续由Router精确加载
    email_lower = state['customer_email'].lower()
    if any(kw in email_lower for kw in ['refund', 'return', '退款']):
        refund_skill = f"{skills_dir}refund_policy.md"
        if os.path.exists(refund_skill):
            with open(refund_skill, 'r') as f:
                active_skills += f.read() + "\n\n"
    
    if any(kw in email_lower for kw in ['shipping', 'tracking', 'deliver', '物流']):
        logistics_skill = f"{skills_dir}logistics_policy.md"
        if os.path.exists(logistics_skill):
            with open(logistics_skill, 'r') as f:
                active_skills += f.read() + "\n\n"
    
    return {
        "customer_memory": customer_memory,
        "active_skills": active_skills,
        "trace_log": [{"node": "load_context", "memory_loaded": bool(memory_data), 
                       "skills_loaded": len(active_skills)}]
    }
```

**Skills文件示例 (skills/ohuhu/refund_policy.md)：**

```markdown
# Ohuhu 退款政策

## 退款权限
- 金额 ≤ $20：Agent可直接执行退款
- $20 < 金额 ≤ $50：Agent可执行但需标记为"待复核"
- 金额 > $50：必须转人工处理

## 退款类型
- 全额退款：产品质量问题、未收到货
- 部分退款（10%-30%）：客户不满意但产品无质量问题
- 部分退款（50%）：使用后损坏

## 话术要求
- 语气友善亲和，使用"We're sorry to hear that..."开头
- 不能说"unfortunately"
- 结尾必须问是否还有其他需要帮助的
```

### 2.2 router_node — 意图路由（用你现有的15个专家映射）

```python
async def router_node(state: CustomerServiceState) -> dict:
    """
    用LLM识别邮件中的所有意图，映射到15个专家中的一个或多个。
    关键：一封邮件可能有多个意图，需要全部识别。
    """
    prompt = f"""你是一个客服邮件意图识别专家。分析以下邮件，识别所有独立的客户诉求。

## 可识别的意图类型
1. order_modification - 订单修改/取消
2. logistics_inquiry - 物流查询/异常/未收到
3. return_refund - 退货退款
4. exchange - 换货
5. product_quality - 产品质量问题
6. marker_quality - 马克笔专项质量问题（Ohuhu品牌特有）
7. invoice_request - 发票请求
8. influencer_collab - 网红合作
9. presale_inquiry - 售前咨询/产品推荐
10. warranty - 保修服务
11. feedback_followup - 邮件跟进
12. shipping_address - 地址修改
13. coupon_discount - 优惠券/折扣问题
14. account_issue - 账户问题
15. general_inquiry - 其他咨询

## 客户邮件
{state['customer_email']}

## 历史对话
{state['old_emails']}

## 输出要求
输出JSON数组，每个元素包含：
- type: 意图类型（上述之一）
- description: 简述该诉求
- order_id: 关联的订单号（如有）
- is_resolved: 该诉求在历史对话中是否已解决

只输出JSON，不要其他文字。
"""
    
    response = await llm.ainvoke(prompt)
    intents = json.loads(response.content)
    
    # 过滤掉已解决的意图
    pending_intents = [i for i in intents if not i.get('is_resolved', False)]
    
    return {
        "intents": pending_intents,
        "current_intent_index": 0,
        "trace_log": state['trace_log'] + [
            {"node": "router", "intents_found": len(intents), 
             "pending": len(pending_intents)}
        ]
    }
```

### 2.3 retriever_node — Hybrid RAG三路检索

```python
from elasticsearch import Elasticsearch
from pymilvus import connections, Collection
# from neo4j import GraphDatabase  # 如果用Neo4j

async def retriever_node(state: CustomerServiceState) -> dict:
    """
    三路检索 + 重排序融合
    根据当前意图类型决定检索策略的权重
    """
    current_intent = state['intents'][state['current_intent_index']]
    query = state['customer_email']  # 用原始邮件作为查询
    
    results = []
    
    # === 第一路：ES BM25关键词检索 ===
    # 适合精确匹配产品参数、政策条款
    es = Elasticsearch("http://localhost:9200")
    es_results = es.search(
        index="knowledge_base",
        body={
            "query": {
                "multi_match": {
                    "query": query,
                    "fields": ["title^2", "content", "keywords^3"],
                    "type": "best_fields"
                }
            },
            "size": 10
        }
    )
    for hit in es_results['hits']['hits']:
        results.append({
            "source": "es_bm25",
            "content": hit['_source']['content'],
            "score": hit['_score'],
            "metadata": hit['_source'].get('metadata', {})
        })
    
    # === 第二路：Milvus向量检索 ===
    # 适合语义相似的FAQ和历史优秀回复
    connections.connect("default", host="localhost", port="19530")
    collection = Collection("knowledge_vectors")
    collection.load()
    
    # 用BGE-M3做embedding
    query_embedding = await get_embedding(query)  # 调BGE-M3 API
    
    milvus_results = collection.search(
        data=[query_embedding],
        anns_field="embedding",
        param={"metric_type": "COSINE", "params": {"nprobe": 10}},
        limit=10,
        output_fields=["content", "metadata"]
    )
    for hits in milvus_results:
        for hit in hits:
            results.append({
                "source": "milvus_vector",
                "content": hit.entity.get("content"),
                "score": hit.score,
                "metadata": hit.entity.get("metadata", {})
            })
    
    # === 第三路：知识图谱查询（简化版，可以先用字典模拟） ===
    # 适合产品关联关系查询
    if current_intent['type'] in ['presale_inquiry', 'exchange', 'marker_quality']:
        graph_results = query_product_graph(query, state.get('order_ids', []))
        results.extend(graph_results)
    
    # === Cross-Encoder重排序 ===
    reranked = await rerank_results(query, results, top_k=5)
    
    knowledge_text = "\n\n---\n\n".join([r['content'] for r in reranked])
    
    return {
        "retrieved_knowledge": knowledge_text,
        "trace_log": state['trace_log'] + [
            {"node": "retriever", "total_results": len(results),
             "reranked_top5": [r['source'] for r in reranked]}
        ]
    }
```

### 2.4 solver_node — ReAct推理（最核心的Agent）

```python
async def solver_node(state: CustomerServiceState) -> dict:
    """
    ReAct推理循环的核心。
    每次调用产生一个 Thought，然后决定是调工具还是生成回复。
    """
    current_intent = state['intents'][state['current_intent_index']]
    
    # 构建包含历史thought的prompt
    thought_history_text = ""
    for t in state.get('thought_history', []):
        thought_history_text += f"Thought: {t.get('thought', '')}\n"
        if t.get('action'):
            thought_history_text += f"Action: {t['action']}\n"
        if t.get('observation'):
            thought_history_text += f"Observation: {t['observation']}\n"
        thought_history_text += "\n"
    
    # 如果有Reflection反馈，加入prompt
    reflection_feedback = ""
    if state.get('review_feedback'):
        reflection_feedback = f"""
## ⚠️ 上一次生成的回复未通过审核，原因如下：
{state['review_feedback']}

请根据以上反馈重新思考并生成更好的方案。
"""
    
    prompt = f"""你是一个专业的跨境电商客服方案决策专家。
使用ReAct方式（Thought→Action→Observation循环）来处理客户问题。

## 品牌策略（Skills）
{state.get('active_skills', '无')}

## 客户历史记忆
{json.dumps(state.get('customer_memory', {}), ensure_ascii=False)}

## 当前客户邮件
{state['customer_email']}

## 历史对话
{state['old_emails']}

## 当前处理的诉求
类型：{current_intent['type']}
描述：{current_intent['description']}
关联订单：{current_intent.get('order_id', '无')}

## 检索到的知识
{state.get('retrieved_knowledge', '无')}

## 已有的工具调用结果
{json.dumps(state.get('tool_results', {}), ensure_ascii=False)}

## 之前的推理过程
{thought_history_text}

{reflection_feedback}

## 可用工具
1. query_order(order_id) - 查询订单详情（商品、金额、状态、地址）
2. query_logistics(order_id) - 查询物流状态（跟踪号、最新状态、预计到达）
3. execute_refund(order_id, amount, reason) - 执行退款
4. create_exchange(order_id, new_sku) - 创建换货单
5. check_inventory(sku) - 查询库存

## 你的任务
继续推理。输出格式（严格JSON）：
{{
  "thought": "你的思考过程",
  "decision": "call_tool" 或 "generate_reply",
  "tool_name": "工具名（仅decision=call_tool时）",
  "tool_params": {{...}}（仅decision=call_tool时）,
  "reply_plan": "回复要点（仅decision=generate_reply时）"
}}
"""
    
    response = await llm.ainvoke(prompt)
    result = json.loads(response.content)
    
    # 更新thought历史
    new_thought = {
        "thought": result['thought'],
        "action": f"{result.get('tool_name', '')}({json.dumps(result.get('tool_params', {}))})" if result['decision'] == 'call_tool' else None,
        "observation": None  # 将由tool_executor填充
    }
    
    updated_history = state.get('thought_history', []) + [new_thought]
    iteration = state.get('react_iteration', 0) + 1
    
    return {
        "thought_history": updated_history,
        "react_iteration": iteration,
        "_solver_decision": result['decision'],  # 用于条件边判断
        "_tool_name": result.get('tool_name'),
        "_tool_params": result.get('tool_params', {}),
        "_reply_plan": result.get('reply_plan', ''),
        "trace_log": state['trace_log'] + [
            {"node": "solver", "iteration": iteration, 
             "decision": result['decision'], "thought": result['thought'][:100]}
        ]
    }

def decide_solver_next(state: CustomerServiceState) -> str:
    """条件边：决定Solver下一步去哪"""
    if state.get('react_iteration', 0) >= state.get('max_react_iterations', 5):
        return "max_iterations_reached"
    return state.get('_solver_decision', 'generate_reply')
```

### 2.5 tool_executor_node — MCP工具执行

```python
async def tool_executor_node(state: CustomerServiceState) -> dict:
    """
    按MCP协议调用业务工具。
    工具执行结果写回State，Solver下一轮可以看到。
    """
    tool_name = state.get('_tool_name')
    tool_params = state.get('_tool_params', {})
    
    # MCP工具注册表
    mcp_tools = {
        "query_order": {
            "endpoint": "http://tcs-api:8080/api/order/query",
            "method": "POST",
            "description": "查询订单详情"
        },
        "query_logistics": {
            "endpoint": "http://tcs-api:8080/api/logistics/track",
            "method": "POST",
            "description": "查询物流信息"
        },
        "execute_refund": {
            "endpoint": "http://tcs-api:8080/api/refund/execute",
            "method": "POST",
            "description": "执行退款操作"
        },
        "create_exchange": {
            "endpoint": "http://tcs-api:8080/api/exchange/create",
            "method": "POST",
            "description": "创建换货单"
        },
        "check_inventory": {
            "endpoint": "http://tcs-api:8080/api/inventory/check",
            "method": "POST",
            "description": "查询库存"
        }
    }
    
    tool_config = mcp_tools.get(tool_name)
    if not tool_config:
        observation = f"错误：未知工具 {tool_name}"
    else:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    tool_config['endpoint'],
                    json=tool_params,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        observation = json.dumps(result, ensure_ascii=False)
                    else:
                        observation = f"API调用失败，状态码：{resp.status}"
        except Exception as e:
            observation = f"工具调用异常：{str(e)}"
    
    # 把observation写入最后一条thought
    updated_history = state['thought_history'].copy()
    if updated_history:
        updated_history[-1]['observation'] = observation
    
    # 合并工具结果
    tool_results = state.get('tool_results', {})
    tool_results[f"{tool_name}_{len(tool_results)}"] = {
        "tool": tool_name,
        "params": tool_params,
        "result": observation
    }
    
    return {
        "thought_history": updated_history,
        "tool_results": tool_results,
        "trace_log": state['trace_log'] + [
            {"node": "tool_executor", "tool": tool_name, 
             "success": "错误" not in observation and "失败" not in observation}
        ]
    }
```

### 2.6 reply_generator_node — 邮件生成

```python
async def reply_generator_node(state: CustomerServiceState) -> dict:
    """
    基于Solver的推理结果和检索知识，生成最终邮件。
    """
    prompt = f"""你是{state['brand']}品牌的专业客服代表。

## 品牌策略
{state.get('active_skills', '')}

## 客户邮件
{state['customer_email']}

## 推理过程和决策方案
{json.dumps(state.get('thought_history', []), ensure_ascii=False, indent=2)}

## 工具查询结果
{json.dumps(state.get('tool_results', {}), ensure_ascii=False, indent=2)}

## 检索到的知识
{state.get('retrieved_knowledge', '')}

## 站点语言
站点：{state['site']}
请用该站点的主要语言回复。

## 要求
1. 邮件格式专业，开头有称呼，结尾有签名
2. 针对客户的每一个诉求都要有回应，不能遗漏
3. 提到的订单号、金额、物流状态必须和查询结果一致
4. 语气符合品牌调性
5. 如果有需要客户确认的事项，明确列出

直接输出邮件内容，不要其他说明。
"""
    
    response = await llm.ainvoke(prompt)
    
    return {
        "draft_reply": response.content,
        "trace_log": state['trace_log'] + [
            {"node": "reply_generator", "reply_length": len(response.content)}
        ]
    }
```

### 2.7 reviewer_node — Reflection审核

```python
async def reviewer_node(state: CustomerServiceState) -> dict:
    """
    三维度审核：事实一致性、方案合规性、品牌调性。
    不通过则生成具体反馈，回传Solver重新生成。
    """
    prompt = f"""你是一个客服邮件质量审核专家。请审核以下AI生成的客服邮件。

## 客户原始邮件
{state['customer_email']}

## AI生成的回复邮件
{state['draft_reply']}

## 工具查询的真实数据
{json.dumps(state.get('tool_results', {}), ensure_ascii=False)}

## 品牌策略规则
{state.get('active_skills', '')}

## 审核维度

### 1. 事实一致性
- 邮件中提到的订单号是否和查询结果一致？
- 金额、物流状态、产品名称是否准确？
- 有没有编造不存在的信息？

### 2. 方案合规性
- 退款金额是否在授权范围内？
- 换货商品是否有库存？
- 处理方案是否符合品牌策略？

### 3. 品牌调性
- 语气是否符合品牌要求？
- 有没有使用禁用词汇？
- 是否回应了客户的所有诉求？

## 输出格式（JSON）
{{
  "passed": true/false,
  "issues": [
    {{
      "dimension": "事实一致性/方案合规性/品牌调性",
      "description": "具体问题描述",
      "severity": "high/medium/low"
    }}
  ],
  "feedback": "如果不通过，给出具体的修改建议（供Solver参考）"
}}
"""
    
    response = await llm.ainvoke(prompt)
    review = json.loads(response.content)
    
    reflection_count = state.get('reflection_count', 0) + 1
    
    if review['passed']:
        return {
            "review_passed": True,
            "review_feedback": None,
            "final_reply": state['draft_reply'],
            "auto_send": all(i.get('severity') != 'high' for i in review.get('issues', [])),
            "reflection_count": reflection_count,
            "trace_log": state['trace_log'] + [
                {"node": "reviewer", "passed": True, "reflection_count": reflection_count}
            ]
        }
    else:
        return {
            "review_passed": False,
            "review_feedback": review['feedback'],
            "reflection_count": reflection_count,
            # 重置ReAct，让Solver带着feedback重新推理
            "react_iteration": 0,
            "thought_history": [],
            "trace_log": state['trace_log'] + [
                {"node": "reviewer", "passed": False, 
                 "issues": len(review['issues']), "reflection_count": reflection_count}
            ]
        }

def decide_review_result(state: CustomerServiceState) -> str:
    """条件边：审核结果判断"""
    if state.get('review_passed', False):
        return "approved"
    if state.get('reflection_count', 0) >= state.get('max_reflections', 2):
        # 超过最大反思次数，标记为需人工审核
        return "max_reflections"
    return "rejected"
```

---

## 第三步：长记忆持久化

在每次对话结束后，更新Redis中的客户记忆：

```python
async def update_customer_memory(state: CustomerServiceState):
    """对话结束后更新长记忆"""
    r = redis.Redis(host='localhost', port=6379, db=0)
    customer_key = f"memory:{state['customer_email']}"
    
    # 提取本次对话的关键事实
    new_facts = {
        "last_interaction": datetime.now().isoformat(),
        "last_intents": [i['type'] for i in state.get('intents', [])],
        "resolved_orders": state.get('order_ids', []),
        "actions_taken": [t.get('action') for t in state.get('thought_history', []) if t.get('action')]
    }
    
    # 合并到已有记忆
    existing = state.get('customer_memory', {})
    existing.update(new_facts)
    
    # 对话摘要（用LLM压缩）
    if len(state.get('thought_history', [])) > 3:
        summary_prompt = f"用50字总结这次客服交互的要点：{json.dumps(state['thought_history'], ensure_ascii=False)}"
        summary = await llm.ainvoke(summary_prompt)
        existing['last_summary'] = summary.content
    
    r.set(customer_key, json.dumps(existing, ensure_ascii=False), ex=86400*30)  # 30天过期
```

---

## 第四步：把现有的15个专家融入新架构

你现有的15个专家不需要扔掉。改造思路：

1. **expert_pool.py 里的专家 → 变成 Solver Agent 的 Skills文件**
   - 每个专家的核心业务逻辑，提取成对应的 `skills/{brand}/{expert_type}.md`
   - 比如 `logistics_expert.py` 里的物流处理规则 → `skills/general/logistics_policy.md`

2. **专家的硬编码逻辑 → 变成 Solver Agent 的 Prompt 指令**
   - Solver在ReAct推理时，根据当前意图类型自动读取对应的Skills
   - 不需要显式调用"专家"，Solver自己就能按Skills里的规则决策

3. **router_agent.py → 保留，但输出简化为意图列表**
   - 不再路由到具体专家，而是输出意图类型
   - Solver Agent根据意图类型加载对应Skills

这样15个专家的知识就变成了15个Skills文件，架构更优雅。

---

## 第五步：全链路追踪

```python
# 简单版追踪（不依赖LangSmith）
class TraceLogger:
    def __init__(self):
        self.traces = []
    
    def log(self, node_name, data):
        self.traces.append({
            "timestamp": datetime.now().isoformat(),
            "node": node_name,
            "data": data
        })
    
    def export(self):
        """导出完整trace，可用于分析和优化"""
        return {
            "total_nodes": len(self.traces),
            "total_time_ms": ...,  # 计算总耗时
            "traces": self.traces
        }

# 如果要接入LangSmith（推荐，可视化更好）：
# export LANGCHAIN_TRACING_V2=true
# export LANGCHAIN_API_KEY=your_key
# export LANGCHAIN_PROJECT=customer_service
```

---

## 给 Claude Code 的指令模板

你可以把以下内容直接发给Claude Code：

---

**请按照以下优先级逐步实施：**

**Phase 1（核心骨架）：**
1. 安装 langgraph langchain 依赖
2. 定义 CustomerServiceState（参考上面的TypedDict）
3. 创建 LangGraph StateGraph，先实现 router → solver → reply_generator → reviewer 这条主线
4. Solver先不做ReAct循环，先实现单次思考→生成回复
5. Reviewer先做简单的规则检查（比如检查回复中是否包含了订单号）

**Phase 2（ReAct循环）：**
1. 给Solver加上ReAct循环：thought_history + conditional_edge回到自身
2. 实现tool_executor节点，对接现有的TCS API
3. 设置max_react_iterations=5的安全阀

**Phase 3（Reflection）：**
1. Reviewer升级为LLM审核（三维度：事实一致性/合规性/调性）
2. 实现reviewer → solver的反馈回传链路
3. 设置max_reflections=2

**Phase 4（Hybrid RAG）：**
1. 先接入ES做关键词检索（把现有知识库文档索引进去）
2. 再加Milvus向量检索（用BGE-M3做Embedding）
3. 知识图谱可以先用Python字典模拟产品关联关系，后续再迁移Neo4j

**Phase 5（记忆+Skills）：**
1. 实现Redis长记忆存储和加载
2. 把15个专家的业务规则提取为Skills Markdown文件
3. 实现按品牌+意图类型动态加载Skills

**重要原则：**
- 不要为了用技术而用，每个组件都要解决实际问题
- ReAct循环：只在需要多步查询的复杂场景才循环，简单FAQ一次就出结果
- Reflection：大部分邮件应该一次通过，只有15%左右需要修正
- Skills文件要短（2000 tokens以内），不要把所有规则塞进一个文件
- 先跑通主流程再优化细节
