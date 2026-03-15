import {
  PenSquare, Clock, Settings, Plus,
  LayoutDashboard, FileText, Layers, Keyboard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore, type View } from '@/store/useStore'

const NAV_ITEMS: { key: View; label: string; icon: typeof PenSquare; group?: string }[] = [
  { key: 'compose', label: '新建回复', icon: PenSquare },
  { key: 'dashboard', label: '控制台', icon: LayoutDashboard },
  { key: 'templates', label: '邮件模板', icon: FileText, group: '工具' },
  { key: 'batch', label: '批量处理', icon: Layers },
  { key: 'history', label: '历史记录', icon: Clock, group: '管理' },
  { key: 'settings', label: '设置', icon: Settings },
]

export function Sidebar() {
  const { activeView, setActiveView, systemOnline } = useStore()

  let lastGroup: string | undefined

  return (
    <aside className="w-[220px] h-full flex flex-col bg-bg-panel border-r border-border shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border-light">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <Plus className="w-4 h-4 text-text-inverse" strokeWidth={2.5} />
        </div>
        <div>
          <span className="font-semibold text-sm text-text-primary tracking-tight block leading-tight">Smart CS</span>
          <span className="text-[10px] text-text-tertiary">v4.0</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ key, label, icon: Icon, group }) => {
          const showGroup = group && group !== lastGroup
          if (group) lastGroup = group
          return (
            <div key={key}>
              {showGroup && (
                <div className="px-3 pt-3 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary/70">
                    {group}
                  </span>
                </div>
              )}
              <button
                onClick={() => setActiveView(key)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                  activeView === key
                    ? 'bg-accent-bg text-accent'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                )}
              >
                <Icon className="w-4 h-4" strokeWidth={1.8} />
                {label}
              </button>
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border-light space-y-2">
        {/* Keyboard shortcut hint */}
        <button
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
          }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-all"
        >
          <Keyboard className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">快捷键</span>
          <kbd className="text-[10px] font-mono px-1 py-0.5 rounded border border-border bg-bg-secondary">⌘K</kbd>
        </button>

        {/* Status */}
        <div className="flex items-center gap-2 px-2 text-xs text-text-tertiary">
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              systemOnline ? 'bg-success' : 'bg-error'
            )}
          />
          {systemOnline ? '系统在线' : '连接断开'}
        </div>
      </div>
    </aside>
  )
}
