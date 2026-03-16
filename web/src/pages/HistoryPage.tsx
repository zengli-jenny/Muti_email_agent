import { useState, useMemo } from 'react'
import { Clock, Trash2, ExternalLink, Search, X } from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { toast } from '@/components/Toast'

export function HistoryPage() {
  const { history, clearHistory, removeHistory, setActiveView, setFullState } = useStore()
  const [search, setSearch] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return history
    const q = search.toLowerCase()
    return history.filter(
      (h) =>
        h.body.toLowerCase().includes(q) ||
        h.reply.toLowerCase().includes(q) ||
        (h.data?.selected_policy || '').toLowerCase().includes(q)
    )
  }, [history, search])

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

  const handleClearConfirm = () => {
    clearHistory()
    setConfirmClear(false)
    toast('success', '历史记录已清除')
  }

  const handleDelete = (id: number) => {
    removeHistory(id)
    toast('success', '已删除记录')
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-sm font-semibold text-text-primary shrink-0">共 {filtered.length} 条记录</h2>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索邮件内容、回复、策略..."
            className={cn(
              'w-full pl-9 pr-8 py-1.5 rounded-lg border border-border-light bg-bg-secondary/50',
              'text-xs text-text-primary placeholder:text-text-tertiary',
              'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent'
            )}
            aria-label="搜索历史记录"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-bg-hover"
              aria-label="清除搜索"
            >
              <X className="w-3 h-3 text-text-tertiary" />
            </button>
          )}
        </div>

        <button
          onClick={() => setConfirmClear(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-tertiary hover:text-error hover:bg-error/5 transition-all shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
          清除全部
        </button>
      </div>

      <div className="space-y-3 max-w-2xl">
        {filtered.map((entry) => (
          <div
            key={entry.id}
            className={cn(
              'w-full text-left bg-bg-panel rounded-xl border border-border-light p-4',
              'hover:border-accent/30 hover:shadow-sm transition-all duration-200',
              'group relative'
            )}
          >
            <button
              onClick={() => {
                setFullState(entry.data)
                setActiveView('compose')
              }}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-tertiary">{formatTime(entry.timestamp)}</span>
                <div className="flex items-center gap-2">
                  {entry.data?.selected_policy && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-node-router/10 text-node-router">
                      {entry.data.selected_policy.replace('.md', '')}
                    </span>
                  )}
                  <ExternalLink className="w-3.5 h-3.5 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <p className="text-sm text-text-primary line-clamp-2 mb-2">{entry.body?.substring(0, 120)}</p>
              {entry.reply && (
                <p className="text-xs text-text-secondary line-clamp-2 bg-bg-secondary rounded-lg px-3 py-2">
                  {entry.reply.substring(0, 150)}
                </p>
              )}
            </button>
            {/* Delete single entry */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleDelete(entry.id)
              }}
              className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-error/10 text-text-tertiary hover:text-error transition-all"
              aria-label="删除此记录"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {filtered.length === 0 && search && (
          <div className="text-center py-12 text-text-tertiary text-sm">
            未找到匹配「{search}」的记录
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="清除全部历史记录"
        message={`确定要删除全部 ${history.length} 条历史记录吗？此操作不可撤销。`}
        confirmLabel="清除全部"
        variant="danger"
        onConfirm={handleClearConfirm}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  )
}
