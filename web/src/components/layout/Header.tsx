import { Menu, PanelLeftClose } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'

const VIEW_TITLES: Record<string, string> = {
  compose: '新建回复',
  dashboard: '控制台',
  templates: '邮件模板',
  batch: '批量处理',
  history: '历史记录',
  settings: '设置',
  about: '系统介绍',
}

export function Header() {
  const activeView = useStore((s) => s.activeView)
  const llmModel = useStore((s) => s.llmModel)
  const systemOnline = useStore((s) => s.systemOnline)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const toggleSidebar = useStore((s) => s.toggleSidebar)

  return (
    <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-border-light bg-bg-panel/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg hover:bg-bg-hover transition-colors text-text-secondary"
          aria-label={sidebarOpen ? '收起侧栏' : '展开侧栏'}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-4 h-4" />
          ) : (
            <Menu className="w-4 h-4" />
          )}
        </button>
        <h1 className="text-[15px] font-semibold text-text-primary">
          {VIEW_TITLES[activeView] || ''}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <div className={cn(
          'w-2 h-2 rounded-full',
          systemOnline ? 'bg-success' : 'bg-error'
        )} />
        <span className="text-xs px-2.5 py-1 rounded-md bg-bg-secondary text-text-secondary font-mono">
          {llmModel}
        </span>
      </div>
    </header>
  )
}
