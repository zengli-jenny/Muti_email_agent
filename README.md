# 智能客服 MVP

这是一个按文档中“跨境电商智能客服自动回复系统”方案搭建的本地可运行 MVP。

它保留了原方案里的核心分层：

- `Router Agent`：识别多意图邮件
- `Retriever Agent`：Hybrid RAG，本地模拟 BM25 / 向量检索 / 图谱查询
- `Solver Agent`：按 ReAct 风格做方案决策
- `Executor Agent`：执行退款、换货、物流查询等动作
- `Reviewer Agent`：做事实一致性、合规性、品牌调性检查
- `Skills`：按品牌动态加载 Markdown 规则文件
- `Memory`：用文件模拟长记忆

## 和生产方案的差异

为了保证你当前目录里就能直接跑起来，这个版本只用 Python 标准库，做了如下本地替代：

- LangGraph -> 自定义状态工作流
- Elasticsearch / Milvus / Neo4j -> 本地 JSON 知识库 + 图谱数据 + 混合检索
- Redis -> 本地 `memory.json`
- MCP Server -> 本地工具注册表
- 真实 LLM -> 规则化决策与模板化回复生成

这意味着它已经是“架构完整、流程可跑、接口可替换”的工程骨架，后续可逐步替换成真实模型和线上基础设施。

## 启动

```bash
python app.py
```

服务默认监听 `http://127.0.0.1:8000`。

## 调用示例

```bash
curl -X POST http://127.0.0.1:8000/reply ^
  -H "Content-Type: application/json" ^
  -d "{\"customer_email\":\"alice@example.com\",\"brand\":\"ohuhu\",\"subject\":\"Package issue\",\"body\":\"Hi, order #OHU290027 shows delivered but I did not receive it. If needed I can also accept a refund.\",\"auto_execute\":false}"
```

## 测试

```bash
python -m unittest discover -s tests -v
```
