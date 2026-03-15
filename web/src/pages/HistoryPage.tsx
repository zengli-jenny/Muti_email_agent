import { Clock, Trash2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/utils'
import { useStore } from '@/store/useStore'

export function HistoryPage() {
  const { history, clearHistory, setActiveView } = useStore()

  if (history.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-bg-secondary flex items-center justify-center mb-4">
          <Clock className="w-7 h-7 text-text-tertiary" strokeWidth={1.5} />
        </div>
        <h3 className="text-base font-semibold text-text-primary mb-1.5">暂无历史记录</h3>
        <p className="text-sm text-text-tertiary max-w-xs">
          处理过的邮件会自动保存在这里，方便您回顾。
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-primary">共 {history.length} 条记录</h2>
        <button
          onClick={clearHistory}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-tertiary hover:text-error hover:bg-error/5 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
          清除全部
        </button>
      </div>

      <div className="space-y-3 max-w-2xl">
        {history.map((entry) => (
          <button
            key={entry.id}
            onClick={() => {
              useStore.getState().setFullState(entry.data)
              setActiveView('compose')
            }}
            className={cn(
              'w-full text-left bg-bg-panel rounded-xl border border-border-light p-4',
              'hover:border-accent/30 hover:shadow-sm transition-all duration-200',
              'group'
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-tertiary">{formatTime(entry.timestamp)}</span>
              <ExternalLink className="w-3.5 h-3.5 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-sm text-text-primary line-clamp-2 mb-2">{entry.body?.substring(0, 120)}</p>
            {entry.reply && (
              <p className="text-xs text-text-secondary line-clamp-2 bg-bg-secondary rounded-lg px-3 py-2">
                {entry.reply.substring(0, 150)}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
