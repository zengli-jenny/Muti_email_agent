import { useEffect, useState } from 'react'
import { Keyboard, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'

const SHORTCUTS = [
  { keys: ['Ctrl', 'Enter'], description: '发送邮件 / 生成回复' },
  { keys: ['Ctrl', 'K'], description: '打开快捷键面板' },
  { keys: ['Ctrl', '1'], description: '切换到新建回复' },
  { keys: ['Ctrl', '2'], description: '切换到控制台' },
  { keys: ['Ctrl', '3'], description: '切换到邮件模板' },
  { keys: ['Ctrl', '4'], description: '切换到批量处理' },
  { keys: ['Ctrl', '5'], description: '切换到历史记录' },
  { keys: ['Ctrl', '6'], description: '切换到设置' },
]

const VIEW_MAP: Record<string, string> = {
  '1': 'compose',
  '2': 'dashboard',
  '3': 'templates',
  '4': 'batch',
  '5': 'history',
  '6': 'settings',
}

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)
  const { setActiveView } = useStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'k') {
          e.preventDefault()
          setOpen((v) => !v)
        }
        if (VIEW_MAP[e.key]) {
          e.preventDefault()
          setActiveView(VIEW_MAP[e.key] as ReturnType<typeof useStore.getState>['activeView'])
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setActiveView])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-bg-panel rounded-2xl border border-border shadow-xl w-[420px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'fade-in 0.15s ease-out' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-light">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-text-primary">快捷键</span>
          </div>
          <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-bg-hover text-text-tertiary">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-1.5">
          {SHORTCUTS.map(({ keys, description }) => (
            <div key={description} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-bg-hover">
              <span className="text-sm text-text-secondary">{description}</span>
              <div className="flex items-center gap-1">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className={cn(
                      'inline-flex items-center justify-center min-w-[28px] h-6 px-1.5',
                      'rounded-md border border-border bg-bg-secondary',
                      'text-xs font-mono text-text-secondary'
                    )}
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-2.5 border-t border-border-light">
          <p className="text-xs text-text-tertiary text-center">
            按 <kbd className="px-1 py-0.5 rounded border border-border bg-bg-secondary text-[10px] font-mono">Esc</kbd> 或点击外部关闭
          </p>
        </div>
      </div>
    </div>
  )
}
