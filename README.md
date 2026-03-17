# Smart CS v4.0 — 多 Agent 智能客服系统

基于 **LangGraph StateGraph** 的跨境电商智能客服引擎，7 个节点协同处理客户邮件，支持 ReAct 推理、工具调用、知识库检索、品牌人格注入、审核反馈闭环与人工介入断点续跑。

```
技术栈：Python 3.13+ · FastAPI · LangGraph · React 19 · TypeScript · Tailwind CSS 4 · Zustand · Radix UI
LLM：OpenAI 兼容接口（默认 Qwen / Dashscope）
```

---

## 目录

- [系统架构](#系统架构)
- [核心流程图](#核心流程图)
- [项目结构](#项目结构)
- [快速启动](#快速启动)
- [环境变量](#环境变量)
- [API 接口](#api-接口)
- [Skill 品牌人格机制](#skill-品牌人格机制)
- [前端功能](#前端功能)
- [自定义与扩展](#自定义与扩展)

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        React 19 Frontend                        │
│  Compose · Dashboard · Templates · Batch · History · Settings   │
│                    SSE 实时 Token 流式渲染                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ POST /api/reply/stream (SSE)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (8001)                       │
│  CORS · SSE EventSource · Static File Serving (web/dist)        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  LangGraph StateGraph 编排引擎                    │
│                                                                  │
│  load_context → router → solver ←→ tool_executor                │
│                            ↓                                     │
│                    reply_generator → reviewer → END              │
│                                        ↓ (rejected)             │
│                                      solver (带 feedback 重写)   │
│                                        ↓ (max_reflections)      │
│                                      finalize → END             │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌──────────┐      ┌──────────────┐     ┌──────────────┐
   │ 知识库    │      │ TCS API      │     │ Skill 文件   │
   │ 1546 FAQ │      │ 订单/物流/库存│     │ ohuhu.md     │
   │ BM25+TFIDF│     │ 售后查询      │     │ tribit.md    │
   └──────────┘      └──────────────┘     └──────────────┘
```

---

## 核心流程图

### Agent 节点数据流

每个节点从全局 `CustomerServiceState` 中读取输入、写入输出：

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CustomerServiceState (TypedDict)                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ① Load Context                                                    │
│     Read:  OldEmail (原始邮件)                                      │
│     Write: old_email, skill_profile, detected_language,             │
│            customer_memory, policy_routing_rules                    │
│                          ↓                                          │
│  ② Router                                                          │
│     Read:  old_email, policy_routing_rules                          │
│     Write: basic_info (结构化信息), selected_policy (匹配流程)       │
│                          ↓                                          │
│  ③ Solver (ReAct Loop, 最多 7 轮)                                  │
│     Read:  selected_policy, skill_profile, old_email,               │
│            tool_list, review_feedback                               │
│     Write: solver_thoughts, tool_results, reply_draft               │
│                ↕                                                    │
│  ④ Tool Executor                                                   │
│     Read:  solver 工具调用指令                                       │
│     Write: tool_results                                             │
│                          ↓                                          │
│  ⑤ Generator                                                       │
│     Read:  reply_draft, skill_profile, detected_language            │
│     Write: final_reply_draft                                        │
│                          ↓                                          │
│  ⑥ Reviewer (三重审核)                                              │
│     Read:  final_reply_draft, skill_profile, selected_policy,       │
│            tool_results                                             │
│     Write: review_result, review_feedback                           │
│              │                                                      │
│              ├─ ✅ Approved → END                                   │
│              ├─ ❌ Rejected → Solver (带 review_feedback 重写)      │
│              └─ ⚠️  超最大轮次 → finalize → 人工介入                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Solver ReAct 决策循环

```
                    ┌──────────────┐
                    │   Solver     │
                    │  思考 Think  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │   决策 Act    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        call_tool    generate_reply  need_human
              │            │            │
              ▼            │            ▼
       Tool Executor       │       finalize
              │            │       (人工介入)
              ▼            ▼
        返回 Solver    Generator
        (下一轮迭代)   (生成邮件)
```

### Reviewer 审核闭环

```
        Generator 生成邮件
               │
               ▼
     ┌─────────────────┐
     │    Reviewer      │
     │  三重审核维度     │
     ├─────────────────┤
     │ 1. 事实一致性    │  回复内容与工具返回数据一致
     │ 2. 方案合规性    │  处理方案符合标准流程
     │ 3. 品牌调性      │  语气/用词符合品牌 Skill
     └────────┬────────┘
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
 Approved   Rejected   Max轮次
    │         │         │
    ▼         ▼         ▼
   END    Solver重写   人工介入
         (带feedback)
```

---

## 项目结构

```
.
├── api/
│   ├── main.py              # FastAPI 入口，SSE 流式推送，静态文件服务
│   └── models.py            # Pydantic 请求/响应模型
│
├── smart_customer_service/
│   ├── config.py            # AppConfig，从 .env 加载配置
│   ├── graph/
│   │   ├── builder.py       # build_graph() / build_resume_graph()
│   │   ├── state.py         # CustomerServiceState (TypedDict)
│   │   ├── nodes.py         # NodeFactory — 8 个节点实现
│   │   └── edges.py         # 条件边：decide_solver_next / decide_review_result
│   ├── llm/
│   │   ├── base.py          # BaseLLM 抽象类
│   │   └── openai_provider.py  # OpenAI 兼容 LLM（支持 Thinking 模式）
│   ├── knowledge_retriever.py  # BM25 + TF-IDF 混合检索（1546 FAQ）
│   ├── memory.py            # 文件级客户记忆（memory.json）
│   ├── policy_loader.py     # 标准流程 Markdown 加载器
│   ├── prompt_templates.py  # 4 个 Agent 的系统提示词
│   ├── router_agent.py      # Router LLM + 规则回退
│   ├── skills.py            # Skill Markdown 解析器
│   ├── tcs_client.py        # TCS 外部 API 客户端（订单/物流/库存）
│   └── tool_registry.py     # 12 个工具的注册表与描述
│
├── skills/
│   ├── ohuhu.md             # Ohuhu 品牌人格（温暖共情风格）
│   └── tribit.md            # Tribit 品牌人格（专业简洁风格）
│
├── data/
│   ├── knowledge_base_full.json  # 完整知识库（1546 条 FAQ，894KB）
│   ├── knowledge_base.json       # 精简知识库
│   ├── business_data.json        # 业务数据
│   ├── catalog_graph.json        # 产品目录图谱
│   └── memory.json               # 客户记忆存储
│
├── 标准流程/                      # 15 个标准处理流程 Markdown
│   ├── 物流问题处理流程.md
│   ├── 客户原因退换货处理流程.md
│   ├── 商品质量问题处理流程.md
│   └── ... (共 15 个)
│
├── 政策路由.md                    # Router 意图→流程映射规则
│
├── web/                           # React 前端
│   ├── src/
│   │   ├── pages/                 # 7 个页面组件
│   │   ├── components/            # 布局、Toast、对话框等
│   │   ├── store/useStore.ts      # Zustand 全局状态
│   │   └── lib/                   # API 客户端、工具函数
│   └── package.json
│
├── tests/                         # 单元测试
├── .env                           # 环境变量（需自行配置）
├── .env.example                   # 环境变量模板
├── requirements.txt               # Python 依赖
└── pyproject.toml                 # 项目元数据
```

---

## 快速启动

### 前置条件

- **Python** >= 3.13
- **Node.js** >= 18（仅前端开发需要）
- **LLM API Key**（Dashscope / OpenAI 兼容接口）

### 1. 克隆项目

```bash
git clone https://github.com/zengli-jenny/Muti_email_agent.git
cd Muti_email_agent
git checkout dev
```

### 2. 安装 Python 依赖

```bash
# 创建虚拟环境（推荐）
python -m venv .venv

# 激活虚拟环境
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 3. 配置环境变量

```bash
# 复制模板
cp .env.example .env

# 编辑 .env，填入你的 LLM API Key
# 必须配置：LLM_API_KEY
# 可选配置：TCS_TOKEN（外部订单 API）
```

### 4. 构建前端（生产模式）

```bash
cd web
npm install
npm run build
cd ..
```

构建产物输出到 `web/dist/`，后端会自动挂载为静态文件。

### 5. 启动服务

```bash
python api/main.py
```

启动后输出：

```
============================================================
  Smart CS v4.0 — FastAPI + LangGraph
============================================================
  LLM Model:  qwen3.5-plus
  TCS API:    https://tcs.1000shores.cn
  Listening:   http://0.0.0.0:8001
============================================================

  API Docs:    http://localhost:8001/docs
  Frontend:    http://localhost:8001/web/index.html

  Press Ctrl+C to stop
============================================================
```

### 6. 访问

| 地址 | 说明 |
|------|------|
| `http://localhost:8001/web/index.html` | React 前端界面 |
| `http://localhost:8001/docs` | Swagger API 文档 |
| `http://localhost:8001/health` | 健康检查 |

### 前端开发模式（可选）

如果需要前端热更新开发：

```bash
cd web
npm run dev
# Vite 开发服务器启动在 http://localhost:5173
# 需要后端同时运行在 8001 端口
```

---

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `LLM_BASE_URL` | ✅ | `https://dashscope.aliyuncs.com/compatible-mode/v1` | LLM API 地址（OpenAI 兼容） |
| `LLM_API_KEY` | ✅ | — | LLM API 密钥 |
| `LLM_MODEL` | ❌ | `qwen3.5-plus` | 模型名称 |
| `LLM_TEMPERATURE` | ❌ | `0.1` | 生成温度 |
| `TCS_BASE_URL` | ❌ | `https://tcs.1000shores.cn` | TCS 外部 API 地址 |
| `TCS_TOKEN` | ❌ | — | TCS API Token |
| `KNOWLEDGE_BASE_PATH` | ❌ | `./data/knowledge_base_full.json` | 知识库文件路径 |
| `POLICY_DIR` | ❌ | `./标准流程` | 标准流程目录 |
| `SERVICE_HOST` | ❌ | `0.0.0.0` | 服务监听地址 |
| `SERVICE_PORT` | ❌ | `8001` | 服务监听端口 |
| `MAX_REACT_ITERATIONS` | ❌ | `7` | Solver 最大推理轮次 |
| `MAX_REFLECTIONS` | ❌ | `2` | Reviewer 最大审核轮次 |
| `USE_MOCK_TCS` | ❌ | `false` | 是否使用 Mock TCS（无需真实 API） |

---

## API 接口

### `POST /api/reply/stream` — 流式处理（主接口）

SSE 流式返回每个节点的执行状态和 Token 级输出。

```bash
curl -N -X POST http://localhost:8001/api/reply/stream \
  -H "Content-Type: application/json" \
  -d '{
    "customer_email": "alice@example.com",
    "brand": "ohuhu",
    "subject": "Package issue",
    "body": "Hi, order #OHU290027 shows delivered but I did not receive it.",
    "auto_execute": true
  }'
```

SSE 事件格式：

```
event: node
data: {"node": "router", "status": "start"}

event: token
data: {"node": "router", "token": "分析"}

event: node
data: {"node": "router", "status": "done", "selected_policy": "物流问题处理流程", ...}

event: done
data: {"node": "__done__"}
```

### `POST /api/reply` — 同步处理

等待全部节点执行完毕后一次性返回结果。

### `POST /api/reply/resume` — 人工介入续跑

从 Solver 节点开始执行，跳过 load_context 和 router，用于人工审核后继续处理。

### `GET /health` — 健康检查

```json
{ "status": "ok" }
```

### `GET /info` — 系统信息

```json
{ "llm_model": "qwen3.5-plus", "policies": ["物流问题处理流程", ...] }
```

### `GET /prompts` — 获取默认提示词

返回 4 个 Agent 的系统提示词（Router / Solver / Generator / Reviewer）。

---

## Skill 品牌人格机制

Skill 是一个 Markdown 文件，定义品牌的客服人格。修改文件即可切换品牌风格，无需改代码。

```
skills/
├── ohuhu.md      # 温暖共情风格：Hi there, / Warm regards,
└── tribit.md     # 专业简洁风格：Hello, / Best regards,
```

Skill 文件结构示例（`skills/ohuhu.md`）：

```markdown
# Brand: ohuhu
## Tone: warm and supportive
## Greeting: Hi there,
## Closing: Warm regards,
## Approval Threshold: $50
## Rules
- 退款金额 ≤ $50 可自动审批
- 必须先确认订单状态再给方案
## Reply Style
- 短段落，直接给方案
- 共情措辞，表达理解
```

Skill 影响 3 个 Agent：

```
Skill Profile
    ├── BrandInfo + Rules  →  Solver（推理决策约束）
    ├── ReplyStyle + Greeting/Closing  →  Generator（语气格式）
    └── Rules + ForbiddenWords  →  Reviewer（合规审核）
```

新增品牌：创建 `skills/{brand_name}.md`，请求时 `brand` 字段传对应名称即可。

---

## 前端功能

| 页面 | 功能 |
|------|------|
| 新建回复 | 输入邮件 → SSE 流式展示 Agent 链路 → 实时渲染回复 |
| 控制台 | 系统状态、处理统计 |
| 邮件模板 | 预设邮件模板管理 |
| 批量处理 | 批量邮件自动回复 |
| 历史记录 | 处理历史查看与回溯 |
| 设置 | Prompt 编辑器、模型参数、Thinking 开关、连接配置 |
| 系统介绍 | 深色科技风架构展示页（架构图、Skill 机制、Agent 卡片） |

---

## 自定义与扩展

| 改什么 | 改哪个文件 |
|--------|-----------|
| Agent 提示词 | `smart_customer_service/prompt_templates.py` |
| 品牌人格 | `skills/{brand}.md` |
| 路由规则 | `政策路由.md` |
| 标准流程 | `标准流程/*.md`（15 个文件） |
| 工具注册 | `smart_customer_service/tool_registry.py` |
| 知识库 | `data/knowledge_base_full.json` |
| 检索算法 | `smart_customer_service/knowledge_retriever.py` |
| LLM 提供商 | `smart_customer_service/llm/openai_provider.py` |
| 前端 Prompt 编辑 | Settings 页面实时覆盖默认模板，零代码生效 |

---

## 测试

```bash
python -m pytest tests/ -v
```

---

## License

MIT
