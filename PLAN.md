# Smart CS v4.0 — React + FastAPI 架构重写计划

## 核心需求理解

你正在构建一个**基于 LangGraph 的跨境电商智能客服系统**，核心价值是：
1. 客服粘贴客户邮件 → AI 多节点链式处理 → 生成专业回复
2. 实时可视化 AI 思考过程（节点动画、思维链）
3. Human-in-the-loop（人工介入 → 继续生成）
4. 对话式协作（修改意见 → 重新生成）
5. 提示词/参数可配置
6. Claude 官网风格的高品质 UI

## 技术栈

### Frontend
- **React 18** + TypeScript
- **Vite** (构建工具)
- **Tailwind CSS v4** (样式)
- **shadcn/ui** (基于 Radix UI 的高质量组件)
- **Zustand** (轻量状态管理)
- **Lucide React** (图标库，Claude 风格)

### Backend
- **FastAPI** + uvicorn (替代 stdlib http.server)
- **SSE (Server-Sent Events)** 流式响应
- **Pydantic** 请求/响应模型
- 保留现有 LangGraph 工作流不变

## 目录结构

```
Muti_email_agent/
├── api/                          # FastAPI 后端
│   ├── main.py                   # FastAPI app + 路由
│   ├── models.py                 # Pydantic 请求/响应模型
│   └── sse.py                    # SSE 流式处理
│
├── web/                          # React 前端
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── index.css             # Tailwind + 全局样式
│   │   ├── lib/
│   │   │   └── utils.ts          # cn() 工具函数
│   │   ├── store/
│   │   │   └── useStore.ts       # Zustand 全局状态
│   │   ├── hooks/
│   │   │   └── useSSE.ts         # SSE 流式 Hook
│   │   ├── components/
│   │   │   ├── ui/               # shadcn/ui 组件
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   └── Layout.tsx
│   │   │   ├── compose/
│   │   │   │   ├── EmailInput.tsx
│   │   │   │   ├── ChainTimeline.tsx
│   │   │   │   ├── ChainStep.tsx
│   │   │   │   ├── FinalReplyCard.tsx
│   │   │   │   ├── HumanAssistDialog.tsx
│   │   │   │   └── ConversationPanel.tsx
│   │   │   ├── history/
│   │   │   │   └── HistoryList.tsx
│   │   │   └── settings/
│   │   │       ├── ConnectionSettings.tsx
│   │   │       ├── ModelSettings.tsx
│   │   │       └── PromptEditor.tsx
│   │   └── pages/
│   │       ├── ComposePage.tsx
│   │       ├── HistoryPage.tsx
│   │       └── SettingsPage.tsx
│
├── smart_customer_service/       # 保持不变
├── data/                         # 保持不变
├── 标准流程/                      # 保持不变
└── app_langgraph.py              # 保留作为参考/备份
```

## 实施步骤

### Phase 1: FastAPI 后端
1. 创建 `api/main.py` — FastAPI app，迁移所有端点
2. 创建 `api/models.py` — Pydantic 模型
3. 创建 `api/sse.py` — SSE 流式响应封装
4. 端点: GET /health, /info, /prompts; POST /api/reply/stream

### Phase 2: React 项目初始化
1. Vite + React + TypeScript 项目
2. Tailwind CSS 配置（Claude 色彩系统）
3. shadcn/ui 初始化 + 基础组件

### Phase 3: React 组件开发
1. Layout (Sidebar + Header + 三个 Page)
2. ComposePage (EmailInput + ChainTimeline + FinalReplyCard)
3. ChainStep (节点动画、展开/折叠)
4. HumanAssistDialog (模态对话框)
5. ConversationPanel (对话式协作)
6. HistoryPage + SettingsPage

### Phase 4: 状态管理 + SSE 集成
1. Zustand store (处理状态、历史、设置)
2. useSSE hook (SSE 流式连接)
3. 端到端流式可视化

## Claude 风格设计规范
- 背景: #FAF9F7 (暖白)
- 主色: #DA7756 (Claude 橙)
- 文字: #2D2B2A (深棕)
- 卡片: 白色 + 细微阴影
- 圆角: 12px
- 字体: Inter / system-ui
- 过渡: 200ms ease
