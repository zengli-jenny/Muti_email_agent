import { useState, useEffect, useRef, useCallback } from 'react'
import { Wifi, WifiOff, RotateCcw, Save, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { highlightPrompt } from '@/lib/highlightPrompt'
import { useStore } from '@/store/useStore'
import { fetchHealth } from '@/lib/api'
import { toast } from '@/components/Toast'
import { FullscreenPromptEditor } from '@/components/FullscreenPromptEditor'

const PROMPT_TABS = [
  { key: 'solver', label: 'Solver' },
  { key: 'reply_generator', label: 'Generator' },
  { key: 'reviewer', label: 'Reviewer' },
] as const

const THINKING_NODES = [
  { key: 'solver', label: 'Solver 推理', sub: 'ReAct 循环，技能选择、工具调用与决策' },
  { key: 'reply_generator', label: 'Generator 生成', sub: '格式化草稿为专业邮件' },
  { key: 'reviewer', label: 'Reviewer 审核', sub: '事实准确性、合规性、品牌调性检查' },
]

export function SettingsPage() {
  const {
    settings, updateSettings,
    defaultPrompts, customPrompts, setCustomPrompt, deleteCustomPrompt,
    setSystemOnline,
  } = useStore()

  const [activeTab, setActiveTab] = useState<string>('solver')
  const [promptValue, setPromptValue] = useState('')
  const [isDefault, setIsDefault] = useState(true)
  const [connectionTesting, setConnectionTesting] = useState(false)
  const [connectionResult, setConnectionResult] = useState<'success' | 'error' | null>(null)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  const savedValue = customPrompts[activeTab] || defaultPrompts[activeTab] || ''
  const hasUnsavedChanges = !isDefault && promptValue !== savedValue

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

  const syncScroll = useCallback(() => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }, [])

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

  const activeTabLabel = PROMPT_TABS.find(t => t.key === activeTab)?.label ?? activeTab

  return (
    <div className="h-full flex flex-col lg:flex-row">

      {/* ── Left Sidebar: Control Panel ── */}
      <aside className="lg:w-[280px] lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border-light bg-bg overflow-y-auto">
        <div className="p-5 flex flex-col gap-4 h-full">

          {/* Thinking toggles card */}
          <section className="bg-bg-panel rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] space-y-3">
            <h3 className="text-sm font-semibold text-text-primary leading-snug">深度思考</h3>
            <div className="space-y-3">
              {THINKING_NODES.map(({ key, label, sub }) => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-text-primary leading-normal">{label}</div>
                      <div className="text-xs text-text-tertiary leading-normal">{sub}</div>
                    </div>
                    <button
                      onClick={() =>
                        updateSettings({
                          thinking: { ...settings.thinking, [key]: !settings.thinking[key] },
                        })
                      }
                      className={cn(
                        'w-11 h-6 rounded-full transition-colors relative shrink-0',
                        'shadow-inner',
                        settings.thinking[key] ? 'bg-accent' : 'bg-border'
                      )}
                      role="switch"
                      aria-checked={settings.thinking[key]}
                      aria-label={`${label} 深度思考开关`}
                    >
                      <div
                        className={cn(
                          'w-[18px] h-[18px] rounded-full bg-white shadow-sm absolute top-[3px] transition-transform',
                          settings.thinking[key] ? 'translate-x-[22px]' : 'translate-x-[3px]'
                        )}
                      />
                    </button>
                  </div>
                  {/* Budget slider */}
                  <div className={cn(
                    'transition-all duration-200',
                    settings.thinking[key] ? 'opacity-100' : 'opacity-30 pointer-events-none'
                  )}>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={50} max={2000} step={10}
                        value={settings.thinkingBudgets?.[key] ?? 600}
                        onChange={(e) =>
                          updateSettings({
                            thinkingBudgets: { ...settings.thinkingBudgets, [key]: parseInt(e.target.value) },
                          })
                        }
                        disabled={!settings.thinking[key]}
                        className="settings-range flex-1"
                      />
                      <input
                        type="number"
                        min={50} max={2000} step={10}
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
                          'w-[60px] rounded-lg border border-border-light bg-bg-secondary/50 px-2 py-1',
                          'text-xs text-text-primary font-mono text-center',
                          'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
                          'disabled:opacity-40 disabled:cursor-not-allowed'
                        )}
                      />
                    </div>
                  </div>
                  {key !== 'reviewer' && <div className="border-b border-border-light/60" />}
                </div>
              ))}
            </div>
          </section>

          {/* Model Parameters card */}
          <section className="bg-bg-panel rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] space-y-4">
            <h3 className="text-sm font-semibold text-text-primary leading-snug">模型参数</h3>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[13px] font-medium text-text-secondary" htmlFor="temperature">Temperature</label>
                <span className="text-xs font-mono text-accent font-semibold">{settings.temperature}</span>
              </div>
              <input
                id="temperature"
                type="range" min="0" max="2" step="0.1"
                value={settings.temperature}
                onChange={(e) => updateSettings({ temperature: parseFloat(e.target.value) })}
                className="settings-range w-full"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[13px] font-medium text-text-secondary" htmlFor="maxIterations">最大推理轮次</label>
                <span className="text-xs font-mono text-accent font-semibold">{settings.maxReactIterations}</span>
              </div>
              <input
                id="maxIterations"
                type="range" min="1" max="20" step="1"
                value={settings.maxReactIterations}
                onChange={(e) => updateSettings({ maxReactIterations: parseInt(e.target.value) })}
                className="settings-range w-full"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[13px] font-medium text-text-secondary" htmlFor="maxReflections">最大审核轮次</label>
                <span className="text-xs font-mono text-accent font-semibold">{settings.maxReflections}</span>
              </div>
              <input
                id="maxReflections"
                type="range" min="0" max="5" step="1"
                value={settings.maxReflections}
                onChange={(e) => updateSettings({ maxReflections: parseInt(e.target.value) })}
                className="settings-range w-full"
              />
            </div>
          </section>

          {/* Connection card */}
          <section className="bg-bg-panel rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] space-y-3">
            <h3 className="text-sm font-semibold text-text-primary leading-snug">连接设置</h3>
            <div>
              <label className="text-[13px] font-medium text-text-secondary mb-1.5 block" htmlFor="apiUrl">后端地址</label>
              <input
                id="apiUrl"
                type="text"
                value={settings.apiUrl}
                onChange={(e) => updateSettings({ apiUrl: e.target.value })}
                className={cn(
                  'w-full rounded-lg border border-border-light bg-bg-secondary/40 px-3 py-2',
                  'text-[13px] text-text-primary font-mono',
                  'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
                  'transition-shadow'
                )}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleTestConnection}
                disabled={connectionTesting}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border border-border-light',
                  'hover:bg-bg-hover hover:shadow-sm transition-all disabled:opacity-50'
                )}
              >
                {connectionTesting ? '测试中...' : '测试连接'}
              </button>
              {connectionResult === 'success' && (
                <span className="flex items-center gap-1 text-xs text-success font-medium">
                  <Wifi className="w-3.5 h-3.5" /> 连接成功
                </span>
              )}
              {connectionResult === 'error' && (
                <span className="flex items-center gap-1 text-xs text-error font-medium">
                  <WifiOff className="w-3.5 h-3.5" /> 连接失败
                </span>
              )}
            </div>
          </section>

          {/* About — muted, at bottom */}
          <div className="mt-auto pt-2 px-1 text-[11px] text-text-tertiary/70 leading-relaxed">
            <p>Smart CS v4.0</p>
            <p>React 19 · FastAPI · LangGraph · Radix UI</p>
          </div>
        </div>
      </aside>

      {/* ── Right Main: Prompt Editor ── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-bg">

        {/* Top bar: tabs + actions */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-light bg-bg-panel">
          {/* Tabs — underline style */}
          <div className="flex items-center gap-0.5" role="tablist">
            {PROMPT_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                role="tab"
                aria-selected={activeTab === key}
                className={cn(
                  'px-4 py-2 text-[13px] font-medium transition-all relative',
                  'hover:text-text-primary',
                  activeTab === key
                    ? 'text-accent'
                    : 'text-text-tertiary'
                )}
              >
                {label}
                {/* Underline indicator */}
                {activeTab === key && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {isDefault && (
              <span className="text-[11px] px-2.5 py-1 rounded-md bg-bg-secondary text-text-tertiary font-medium">
                只读
              </span>
            )}
            {hasUnsavedChanges && (
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" title="有未保存的更改" />
            )}
            <button
              onClick={handleResetPrompt}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                'text-text-secondary border border-border-light',
                'hover:bg-bg-hover hover:text-accent hover:border-accent/30 hover:shadow-sm',
                'transition-all'
              )}
            >
              <RotateCcw className="w-3.5 h-3.5" /> 恢复默认
            </button>
            <button
              onClick={handleSavePrompt}
              disabled={isDefault}
              className={cn(
                'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all',
                isDefault
                  ? 'bg-bg-secondary text-text-tertiary cursor-not-allowed'
                  : 'bg-accent text-text-inverse hover:bg-accent-hover shadow-sm hover:shadow-md'
              )}
            >
              <Save className="w-3.5 h-3.5" /> 保存
            </button>
            <button
              onClick={() => setFullscreenOpen(true)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                'text-text-secondary border border-border-light',
                'hover:bg-bg-hover hover:text-text-primary hover:shadow-sm',
                'transition-all'
              )}
            >
              <Maximize2 className="w-3.5 h-3.5" /> 全屏
            </button>
          </div>
        </div>

        {/* Editor area — fills remaining height, minimal padding */}
        <div className="flex-1 min-h-0 p-3" role="tabpanel">
          <div
            className={cn(
              'prompt-highlight-container h-full rounded-xl border overflow-hidden',
              'shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
              isDefault
                ? 'border-border-light bg-bg'
                : 'border-accent/30 ring-2 ring-accent/8 bg-bg-panel'
            )}
          >
            <div
              ref={backdropRef}
              className={cn(
                'prompt-highlight-backdrop p-5',
                'font-[Consolas,Monaco,JetBrains_Mono,monospace] text-sm leading-[1.6]',
                isDefault ? 'text-text-secondary' : 'text-text-primary'
              )}
              dangerouslySetInnerHTML={{ __html: highlightPrompt(promptValue) }}
            />
            <textarea
              ref={textareaRef}
              value={promptValue}
              onChange={(e) => {
                setPromptValue(e.target.value)
                setIsDefault(false)
              }}
              onScroll={syncScroll}
              className={cn(
                'prompt-highlight-textarea absolute inset-0 w-full h-full p-5',
                'font-[Consolas,Monaco,JetBrains_Mono,monospace] text-sm leading-[1.6]',
                'focus:outline-none'
              )}
              aria-label={`${activeTab} 提示词编辑器`}
            />
          </div>
        </div>

        {/* Bottom status bar */}
        <div className="flex items-center justify-between px-5 py-2 border-t border-border-light bg-bg-panel text-xs text-text-tertiary">
          <span>Agent 提示词配置 · {activeTabLabel}</span>
          <span className="font-mono">{promptValue.length} 字符</span>
        </div>
      </main>

      {/* Fullscreen prompt editor modal */}
      <FullscreenPromptEditor
        open={fullscreenOpen}
        onOpenChange={setFullscreenOpen}
        tabLabel={activeTabLabel}
        value={promptValue}
        onChange={(val) => {
          setPromptValue(val)
          setIsDefault(false)
        }}
        isDefault={isDefault}
        onSave={handleSavePrompt}
        onReset={handleResetPrompt}
      />
    </div>
  )
}
