# Smart CS v4.0 — 多 Agent 智能客服系统

基于 **LangGraph StateGraph** 的跨境电商智能客服引擎，采用**渐进式技能披露（Progressive Skill Disclosure）**架构，6 个节点协同处理客户邮件。

```
技术栈：Python 3.13+ · FastAPI · LangGraph · React 19 · TypeScript · Tailwind CSS 4
LLM：OpenAI 兼容接口（默认 Qwen / Dashscope）
```

---

## 系统架构

```
React 19 Frontend  →  FastAPI (8001)  →  LangGraph StateGraph
                                               │
                    load_context → solver ←→ tool_executor
                                      ↓
                              reply_generator → reviewer → END
                                                  ↓ (rejected)
                                                solver (带 feedback 重写)
```

> v4.0 移除了独立 Router Agent，改为 Solver 通过 `load_skill` 工具按需加载标准处理流程，平均节省 60–80% token。

---

## Skills 渐进式披露架构

这是本系统的核心设计，详细说明见 [skills架构设计.md](./skills架构设计.md)。

### 三层结构

```
L1  始终注入 Solver（~750 tokens）
    15个技能的 ID / 触发条件 / 一句话说明
    ↓ Solver 识别意图 → load_skill(skill_id)

L2  场景分支判断表（~200–400 tokens）
    告诉模型当前邮件属于哪个具体场景，以及该加载哪个 L3 章节
    ↓ Solver 对照表 → load_skill_section(skill_id, section)

L3  单场景执行细节（~500–2,000 tokens）
    话术模板、判断逻辑、边界条件，只加载命中的那一个章节
```

### Solver 执行路径示例（待跟进邮件）

```
第1轮：load_skill("followup")
       → 获取 L2 场景分支表

第2轮：load_skill_section("followup", "售后处理类跟进")
       → 获取具体话术（上一封已执行退款，跟进到账）

第3轮：generate_reply
       → 生成跟进邮件
```

### Token 对比

| | 旧架构 | 新架构 |
|--|--------|--------|
| Router 调用 | ~3,500 tokens | 0 |
| 简单问题 | ~5,000 tokens | ~1,200 tokens |
| 复杂问题 | ~14,500 tokens | ~2,500 tokens |

### 注册表配置（`skills/skill_registry.json`）

```json
{
  "id": "followup",
  "name": "邮件跟进处理",
  "file": "邮件跟进处理流程.md",
  "trigger": "待跟进状态、跟进邮件、确认收货、确认退款到账",
  "l1_summary": "会话标记为待跟进时，根据上一封客服回复内容生成对应跟进邮件",
  "l2_section": "L2 场景分支判断表",
  "l3_sections": ["售后处理类跟进", "退货流程类跟进", "调查处理类跟进"]
}
```

---

## 快速启动

### 1. 创建 Conda 环境

```bash
conda create -n smart_cs python=3.13 -y
conda activate smart_cs
pip install -r requirements.txt
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 LLM_API_KEY（必填）
```

### 3. 构建前端

```bash
cd web && npm install && npm run build && cd ..
```    

### 4. 启动服务

```bash
# Linux / macOS
PYTHONPATH=. python api/main.py

# Windows PowerShell
$env:PYTHONPATH="."; python api/main.py

# Windows CMD
set PYTHONPATH=. && python api/main.py
```

访问 `http://localhost:8001/web/index.html`

---

## 项目结构

```
.
├── api/
│   ├── main.py              # FastAPI 入口，SSE 流式推送，Skills API
│   └── models.py            # Pydantic 模型
├── smart_customer_service/
│   ├── skill_registry.py    # SkillRegistry — 渐进式技能披露核心
│   ├── graph/
│   │   ├── builder.py       # build_graph()（6节点，无 Router）
│   │   ├── nodes.py         # NodeFactory — 6 个节点实现
│   │   └── state.py         # CustomerServiceState
│   ├── prompt_templates.py  # SOLVER_SYSTEM / REPLY_GENERATOR / REVIEWER
│   └── tool_registry.py     # 14 个工具（含 load_skill / load_skill_section）
├── skills/
│   ├── skill_registry.json  # 15 个技能的 L1/L2/L3 配置
│   ├── ohuhu.md             # 品牌人格
│   └── tribit.md
├── 标准流程/                  # 15 个标准处理流程（每个含 L2 场景分支表）
├── data/
│   └── knowledge_base_full.json  # 1546 条 FAQ
└── web/                     # React 19 前端
```

---

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `LLM_API_KEY` | ✅ | — | LLM API 密钥 |
| `LLM_BASE_URL` | ❌ | Dashscope | OpenAI 兼容接口地址 |
| `LLM_MODEL` | ❌ | `qwen3.5-plus` | 模型名称 |
| `TCS_TOKEN` | ❌ | — | TCS 外部 API Token |
| `SERVICE_PORT` | ❌ | `8001` | 服务端口 |
| `USE_MOCK_TCS` | ❌ | `false` | Mock 模式（无需真实 API） |

---

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/reply/stream` | SSE 流式处理（主接口） |
| `POST` | `/api/reply` | 同步处理 |
| `POST` | `/api/reply/resume` | 人工介入后续跑 |
| `GET` | `/api/skills` | 列出所有技能（L1 元数据） |
| `GET` | `/api/skills/{id}` | 技能详情（含 L2 内容） |
| `PATCH` | `/api/skills/{id}` | 更新注册表元数据 |
| `PUT` | `/api/skills/{id}/content` | 更新流程文件内容 |
| `GET` | `/api/skills/meta/l1_table` | L1 表格预览 |
| `GET` | `/health` | 健康检查 |
| `GET` | `/docs` | Swagger 文档 |

---

## 品牌 Skill

`skills/{brand}.md` 定义品牌客服人格，影响 Solver 决策约束、Generator 语气格式、Reviewer 合规审核。

```markdown
Brand: ohuhu
Tone: warm and supportive
Greeting: Hi there,
Closing: Warm regards,
ApprovalThresholdUSD: 50

## Rules
- 退款金额 ≤ $50 可自动审批

## ReplyStyle
- 短段落，直接给方案
```

新增品牌：创建 `skills/{brand_name}.md`，请求时 `brand` 字段传对应名称。

---

## 自定义与扩展

| 改什么 | 改哪里 |
|--------|--------|
| Solver / Generator / Reviewer 提示词 | `prompt_templates.py` 或前端 Settings 页面 |
| 品牌人格 | `skills/{brand}.md` |
| 技能触发条件 / L1 说明 | `skills/skill_registry.json` 或前端技能注册表页面 |
| 标准流程内容（L2/L3） | `标准流程/*.md` 或前端技能注册表页面 |
| 新增标准流程 | `标准流程/xxx.md` + `skill_registry.json` 新增一条记录 |
| 知识库 | `data/knowledge_base_full.json` |

---

## 前端页面

| 页面 | 功能 |
|------|------|
| 新建回复 | 输入邮件 → SSE 流式展示 Agent 链路 → 实时渲染回复 |
| 技能注册表 | L1/L2/L3 技能配置管理、流程文件编辑 |
| 设置 | Prompt 编辑器、模型参数、Thinking 开关 |
| 历史记录 | 处理历史查看与回溯 |
| 批量处理 | 批量邮件自动回复 |

---

## 测试

```bash
conda activate smart_cs
PYTHONPATH=. python -m pytest tests/ -v
```

---

## License

MIT
