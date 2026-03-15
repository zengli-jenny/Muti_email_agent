import { PenSquare, Clock, Settings, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore, type View } from '@/store/useStore'

const NAV_ITEMS: { key: View; label: string; icon: typeof PenSquare }[] = [
  { key: 'compose', label: '新建回复', icon: PenSquare },
  { key: 'history', label: '历史记录', icon: Clock },
  { key: 'settings', label: '设置', icon: Settings },
]

export function Sidebar() {
  const { activeView, setActiveView, systemOnline } = useStore()

  return (
    <aside className="w-[220px] h-full flex flex-col bg-bg-panel border-r border-border shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border-light">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <Plus className="w-4 h-4 text-text-inverse" strokeWidth={2.5} />
        </div>
        <span className="font-semibold text-sm text-text-primary tracking-tight">Smart CS</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
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
        ))}
      </nav>

      {/* Status */}
      <div className="px-4 py-3 border-t border-border-light">
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
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
