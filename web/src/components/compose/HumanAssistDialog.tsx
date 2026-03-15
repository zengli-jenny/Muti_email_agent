import { useState } from 'react'
import { UserCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'

export function HumanAssistDialog() {
  const { humanDialogOpen, humanDialogTasks, closeHumanDialog, humanDialogResolve } = useStore()
  const [input, setInput] = useState('')

  if (!humanDialogOpen) return null

  const tasks = humanDialogTasks as Array<string | { task?: string; description?: string; question?: string; options?: string[] }>

  const handleSubmit = () => {
    const val = input.trim() || null
    closeHumanDialog()
    humanDialogResolve?.(val)
    setInput('')
  }

  const handleSkip = () => {
    closeHumanDialog()
    humanDialogResolve?.(null)
    setInput('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <div className="w-full max-w-lg mx-4 bg-bg-panel rounded-2xl shadow-xl border border-border" style={{ animation: 'fade-in 0.3s ease-out' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border-light">
          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
            <UserCircle className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-text-primary">需要人工客服协助</h3>
            <p className="text-xs text-text-tertiary mt-0.5">AI 无法独立完成此请求，请提供指导</p>
          </div>
          <button onClick={handleSkip} className="p-1.5 rounded-lg hover:bg-bg-hover transition-colors">
            <X className="w-4 h-4 text-text-tertiary" />
          </button>
        </div>

        {/* Tasks */}
        {tasks.length > 0 && (
          <div className="px-6 py-4 border-b border-border-light">
            <h4 className="text-xs font-semibold text-text-secondary mb-2">待处理事项</h4>
            <ul className="space-y-2">
              {tasks.map((t, i) => {
                const text = typeof t === 'string' ? t : (t.description || t.task || JSON.stringify(t))
                return (
                  <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                    {text}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Input */}
        <div className="px-6 py-4">
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">请输入处理指令</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="例如：已确认客户订单，同意全额退款并重新发货..."
            rows={4}
            autoFocus
            className={cn(
              'w-full rounded-xl border border-border-light bg-bg-secondary/50 px-4 py-3',
              'text-sm text-text-primary placeholder:text-text-tertiary',
              'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
              'resize-none transition-all'
            )}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border-light">
          <button
            onClick={handleSkip}
            className="px-4 py-2 rounded-xl text-xs font-medium text-text-secondary border border-border-light hover:bg-bg-hover transition-all"
          >
            跳过（不处理）
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-accent text-text-inverse hover:bg-accent-hover transition-all"
          >
            提交并继续生成
          </button>
        </div>
      </div>
    </div>
  )
}
