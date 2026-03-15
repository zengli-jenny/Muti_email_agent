import { useStore } from '@/store/useStore'

const VIEW_TITLES: Record<string, string> = {
  compose: '新建回复',
  history: '历史记录',
  settings: '设置',
}

export function Header() {
  const { activeView, llmModel } = useStore()

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border-light bg-bg-panel/80 backdrop-blur-sm">
      <h1 className="text-[15px] font-semibold text-text-primary">
        {VIEW_TITLES[activeView] || ''}
      </h1>
      <div className="flex items-center gap-3">
        <span className="text-xs px-2.5 py-1 rounded-md bg-bg-secondary text-text-secondary font-mono">
          {llmModel}
        </span>
      </div>
    </header>
  )
}
