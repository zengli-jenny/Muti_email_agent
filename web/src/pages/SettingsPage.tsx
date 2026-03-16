import { useState, useEffect } from 'react'
import { Wifi, WifiOff, RotateCcw, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { fetchHealth } from '@/lib/api'
import { toast } from '@/components/Toast'

const PROMPT_TABS = [
  { key: 'router', label: 'Router' },
  { key: 'solver', label: 'Solver' },
  { key: 'reply_generator', label: 'Generator' },
  { key: 'reviewer', label: 'Reviewer' },
] as const

const THINKING_NODES = [
  { key: 'router', label: 'Router 路由', sub: '邮件意图分析与流程匹配' },
  { key: 'solver', label: 'Solver 推理', sub: 'ReAct 循环，工具调用与决策' },
  { key: 'reply_generator', label: 'Generator 生成', sub: '格式化草稿为专业邮件' },
  { key: 'reviewer', label: 'Reviewer 审核', sub: '事实准确性、合规性、品牌调性检查' },
]

export function SettingsPage() {
  const {
    settings, updateSettings,
    defaultPrompts, customPrompts, setCustomPrompt, deleteCustomPrompt,
    setSystemOnline,
  } = useStore()

  const [activeTab, setActiveTab] = useState<string>('router')
  const [promptValue, setPromptValue] = useState('')
  const [isDefault, setIsDefault] = useState(true)
  const [connectionTesting, setConnectionTesting] = useState(false)
  const [connectionResult, setConnectionResult] = useState<'success' | 'error' | null>(null)

  // Load prompt value when tab changes
  useEffect(() => {
    const custom = customPrompts[activeTab]
    const def = defaultPrompts[activeTab]
    if (custom) {
      setPromptValue(custom)
      setIsDefault(false)
    } else if (def) {
      setPromptValue(def)
      setIsDefault(true)
    } else {
      setPromptValue('')
      setIsDefault(true)
    }
  }, [activeTab, customPrompts, defaultPrompts])

  const handleSavePrompt = () => {
    if (isDefault) return
    const val = promptValue.trim()
    if (val) {
      setCustomPrompt(activeTab, val)
      toast('success', `${activeTab} 提示词已保存`)
    } else {
      deleteCustomPrompt(activeTab)
      toast('info', `${activeTab} 提示词已恢复默认`)
    }
  }

  const handleResetPrompt = () => {
    deleteCustomPrompt(activeTab)
    const def = defaultPrompts[activeTab]
    setPromptValue(def || '')
    setIsDefault(true)
    toast('info', '已恢复默认提示词')
  }

  const handleTestConnection = async () => {
    setConnectionTesting(true)
    setConnectionResult(null)
    try {
      const data = await fetchHealth()
      if (data.status === 'ok') {
        setConnectionResult('success')
        setSystemOnline(true)
        toast('success', '后端连接成功')
      } else {
        throw new Error()
      }
    } catch {
      setConnectionResult('error')
      setSystemOnline(false)
      toast('error', '连接失败，请检查后端是否运行')
    } finally {
      setConnectionTesting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Model Parameters */}
        <section className="bg-bg-panel rounded-2xl border border-border p-5 space-y-5">
          <h3 className="text-sm font-semibold text-text-primary">模型参数</h3>

          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-text-secondary" htmlFor="temperature">Temperature</label>
              <span className="text-xs font-mono text-text-tertiary">{settings.temperature}</span>
            </div>
            <input
              id="temperature"
              type="range" min="0" max="2" step="0.1"
              value={settings.temperature}
              onChange={(e) => updateSettings({ temperature: parseFloat(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>

          {/* Max iterations */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-text-secondary" htmlFor="maxIterations">最大推理轮次</label>
              <span className="text-xs font-mono text-text-tertiary">{settings.maxReactIterations}</span>
            </div>
            <input
              id="maxIterations"
              type="range" min="1" max="20" step="1"
              value={settings.maxReactIterations}
              onChange={(e) => updateSettings({ maxReactIterations: parseInt(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>

          {/* Max reflections */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-text-secondary" htmlFor="maxReflections">最大审核轮次</label>
              <span className="text-xs font-mono text-text-tertiary">{settings.maxReflections}</span>
            </div>
            <input
              id="maxReflections"
              type="range" min="0" max="5" step="1"
              value={settings.maxReflections}
              onChange={(e) => updateSettings({ maxReflections: parseInt(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>
        </section>

        {/* Thinking toggles */}
        <section className="bg-bg-panel rounded-2xl border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">深度思考 (Thinking)</h3>
          <p className="text-xs text-text-tertiary">开启后 LLM 会输出推理思维链</p>
          {THINKING_NODES.map(({ key, label, sub }) => (
            <div key={key} className="py-2 border-b border-border-light last:border-0 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-text-primary">{label}</div>
                  <div className="text-[11px] text-text-tertiary">{sub}</div>
                </div>
                <button
                  onClick={() =>
                    updateSettings({
                      thinking: { ...settings.thinking, [key]: !settings.thinking[key] },
                    })
                  }
                  className={cn(
                    'w-10 h-5.5 rounded-full transition-colors relative',
                    settings.thinking[key] ? 'bg-accent' : 'bg-border'
                  )}
                  role="switch"
                  aria-checked={settings.thinking[key]}
                  aria-label={`${label} 深度思考开关`}
                >
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform',
                      settings.thinking[key] ? 'translate-x-5' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </div>
              {/* Per-node thinking budget */}
              <div className={cn('pl-1 transition-opacity', settings.thinking[key] ? 'opacity-100' : 'opacity-40 pointer-events-none')}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-text-tertiary">思考长度 (Token)</span>
                  <span className="text-[11px] font-mono text-text-tertiary">{settings.thinkingBudgets?.[key] ?? 600}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={50}
                    max={2000}
                    step={10}
                    value={settings.thinkingBudgets?.[key] ?? 600}
                    onChange={(e) =>
                      updateSettings({
                        thinkingBudgets: { ...settings.thinkingBudgets, [key]: parseInt(e.target.value) },
                      })
                    }
                    disabled={!settings.thinking[key]}
                    className="flex-1 accent-accent disabled:opacity-40"
                  />
                  <input
                    type="number"
                    min={50}
                    max={2000}
                    step={10}
                    value={settings.thinkingBudgets?.[key] ?? 600}
                    onChange={(e) => {
                      const v = parseInt(e.target.value)
                      if (!isNaN(v))
                        updateSettings({
                          thinkingBudgets: { ...settings.thinkingBudgets, [key]: Math.max(50, Math.min(2000, v)) },
                        })
                    }}
                    disabled={!settings.thinking[key]}
                    className={cn(
                      'w-[72px] rounded-lg border border-border-light bg-bg-secondary/50 px-2 py-1',
                      'text-[11px] text-text-primary font-mono text-center',
                      'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
                      'disabled:opacity-40 disabled:cursor-not-allowed'
                    )}
                  />
                </div>
                <p className="text-[10px] text-text-tertiary mt-1">限制该节点深度思考的最大Token数，数值越小推理速度越快，数值越大推理越详细，支持范围50-2000</p>
              </div>
            </div>
          ))}
        </section>

        {/* Connection */}
        <section className="bg-bg-panel rounded-2xl border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">连接设置</h3>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block" htmlFor="apiUrl">后端地址</label>
            <input
              id="apiUrl"
              type="text"
              value={settings.apiUrl}
              onChange={(e) => updateSettings({ apiUrl: e.target.value })}
              className={cn(
                'w-full rounded-xl border border-border-light bg-bg-secondary/50 px-4 py-2',
                'text-sm text-text-primary font-mono',
                'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent'
              )}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestConnection}
              disabled={connectionTesting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border-light hover:bg-bg-hover transition-all disabled:opacity-50"
            >
              {connectionTesting ? '测试中...' : '测试连接'}
            </button>
            {connectionResult === 'success' && (
              <span className="flex items-center gap-1 text-xs text-success">
                <Wifi className="w-3.5 h-3.5" /> 连接成功
              </span>
            )}
            {connectionResult === 'error' && (
              <span className="flex items-center gap-1 text-xs text-error">
                <WifiOff className="w-3.5 h-3.5" /> 连接失败
              </span>
            )}
          </div>
        </section>

        {/* Prompt editor */}
        <section className="bg-bg-panel rounded-2xl border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">Agent 提示词配置</h3>
          <p className="text-xs text-text-tertiary">查看和自定义 LLM 节点的系统提示词</p>

          {/* Tabs */}
          <div className="flex gap-1 bg-bg-secondary rounded-lg p-1" role="tablist">
            {PROMPT_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                role="tab"
                aria-selected={activeTab === key}
                className={cn(
                  'flex-1 py-1.5 rounded-md text-xs font-medium transition-all',
                  activeTab === key
                    ? 'bg-bg-panel text-accent shadow-sm'
                    : 'text-text-tertiary hover:text-text-secondary'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Editor */}
          <div className="space-y-2" role="tabpanel">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">
                {isDefault ? '默认提示词（只读）' : '自定义提示词'}
              </span>
              <button
                onClick={handleResetPrompt}
                className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-accent transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> 恢复默认
              </button>
            </div>
            <textarea
              value={promptValue}
              onChange={(e) => {
                setPromptValue(e.target.value)
                setIsDefault(false)
              }}
              rows={10}
              className={cn(
                'w-full rounded-xl border border-border-light px-4 py-3',
                'text-xs text-text-primary font-mono leading-relaxed',
                'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
                'resize-y transition-all',
                isDefault ? 'bg-bg-secondary/50 text-text-tertiary italic' : 'bg-bg-panel'
              )}
              aria-label={`${activeTab} 提示词编辑器`}
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-tertiary">{promptValue.length} 字符</span>
              <button
                onClick={handleSavePrompt}
                disabled={isDefault}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  isDefault
                    ? 'bg-bg-hover text-text-tertiary cursor-not-allowed'
                    : 'bg-accent text-text-inverse hover:bg-accent-hover'
                )}
              >
                <Save className="w-3 h-3" /> 保存
              </button>
            </div>
          </div>
        </section>

        {/* About */}
        <section className="bg-bg-panel rounded-2xl border border-border p-5 text-xs text-text-tertiary space-y-1">
          <h3 className="text-sm font-semibold text-text-primary mb-2">关于</h3>
          <p>Smart CS v4.0 — 基于 LangGraph 的跨境电商智能客服系统。</p>
          <p>架构：React 19 + FastAPI + LangGraph StateGraph</p>
          <p>前端：React + TypeScript + Tailwind CSS 4 + Zustand + Radix UI</p>
        </section>
      </div>
    </div>
  )
}
