import { useMemo } from 'react'
import {
  Mail, CheckCircle, AlertTriangle, Clock, TrendingUp,
  BarChart3, Zap, Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore, type HistoryEntry } from '@/store/useStore'

interface StatCardProps {
  icon: typeof Mail
  label: string
  value: string | number
  sub?: string
  color: string
  bgColor: string
}

function StatCard({ icon: Icon, label, value, sub, color, bgColor }: StatCardProps) {
  return (
    <div className="bg-bg-panel rounded-2xl border border-border p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', bgColor)}>
        <Icon className={cn('w-5 h-5', color)} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-tertiary">{label}</p>
        <p className="text-2xl font-bold text-text-primary mt-0.5">{value}</p>
        {sub && <p className="text-xs text-text-tertiary mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function PolicyChart({ history }: { history: HistoryEntry[] }) {
  const policyCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    history.forEach((h) => {
      const policy = h.data?.selected_policy || '未匹配策略'
      counts[policy] = (counts[policy] || 0) + 1
    })
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
  }, [history])

  const max = Math.max(...policyCounts.map(([, c]) => c), 1)

  if (policyCounts.length === 0) {
    return (
      <div className="text-center py-8 text-text-tertiary text-sm">
        暂无策略数据
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {policyCounts.map(([policy, count]) => (
        <div key={policy}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-text-secondary truncate max-w-[200px]">
              {policy.replace('.md', '')}
            </span>
            <span className="text-text-tertiary font-mono">{count}</span>
          </div>
          <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function LanguageDistribution({ history }: { history: HistoryEntry[] }) {
  const langCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    history.forEach((h) => {
      const lang = h.data?.detected_language || 'unknown'
      counts[lang] = (counts[lang] || 0) + 1
    })
    return Object.entries(counts).sort(([, a], [, b]) => b - a)
  }, [history])

  const langNames: Record<string, string> = {
    en: 'English', zh: '中文', ja: '日本語', ko: '한국어',
    fr: 'Français', de: 'Deutsch', es: 'Español', unknown: '未知',
  }

  const colors = ['bg-accent', 'bg-info', 'bg-success', 'bg-warning', 'bg-error', 'bg-text-tertiary']

  return (
    <div className="space-y-2">
      {langCounts.map(([lang, count], i) => (
        <div key={lang} className="flex items-center gap-3">
          <div className={cn('w-3 h-3 rounded-full shrink-0', colors[i] || colors[5])} />
          <span className="text-sm text-text-secondary flex-1">{langNames[lang] || lang}</span>
          <span className="text-sm font-mono text-text-tertiary">{count}</span>
        </div>
      ))}
      {langCounts.length === 0 && (
        <p className="text-center text-text-tertiary text-sm py-4">暂无语言数据</p>
      )}
    </div>
  )
}

function RecentActivity({ history }: { history: HistoryEntry[] }) {
  const recent = history.slice(0, 8)

  if (recent.length === 0) {
    return (
      <div className="text-center py-8 text-text-tertiary text-sm">
        暂无处理记录，前往「新建回复」开始使用
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {recent.map((h) => (
        <div
          key={h.id}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-hover transition-colors"
        >
          <div className={cn(
            'w-2 h-2 rounded-full shrink-0',
            h.data?.review_passed ? 'bg-success' : 'bg-warning'
          )} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-text-primary truncate">
              {h.body.slice(0, 60)}{h.body.length > 60 ? '...' : ''}
            </p>
            <p className="text-xs text-text-tertiary mt-0.5">
              {new Date(h.timestamp).toLocaleString('zh-CN', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
              {h.data?.selected_policy && (
                <span className="ml-2 text-accent">
                  {h.data.selected_policy.replace('.md', '')}
                </span>
              )}
            </p>
          </div>
          {h.data?.review_passed ? (
            <CheckCircle className="w-4 h-4 text-success shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          )}
        </div>
      ))}
    </div>
  )
}

export function DashboardPage() {
  const history = useStore((s) => s.history)
  const llmModel = useStore((s) => s.llmModel)
  const systemOnline = useStore((s) => s.systemOnline)

  const stats = useMemo(() => {
    const total = history.length
    const passed = history.filter((h) => h.data?.review_passed).length
    const humanNeeded = history.filter((h) => h.data?.requires_human).length
    const avgThoughts = total > 0
      ? Math.round(history.reduce((sum, h) => sum + (h.data?.thought_history?.length || 0), 0) / total * 10) / 10
      : 0
    return { total, passed, humanNeeded, avgThoughts }
  }, [history])

  return (
    <div className="max-w-6xl mx-auto space-y-6" style={{ animation: 'fade-in 0.3s ease-out' }}>
      {/* Welcome banner */}
      <div className="bg-bg-panel rounded-2xl border border-border p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">控制台</h1>
            <p className="text-sm text-text-tertiary mt-1">
              Smart CS 智能客服系统运行概览
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium',
              systemOnline
                ? 'bg-success/10 text-success'
                : 'bg-error/10 text-error'
            )}>
              {systemOnline ? '系统运行中' : '系统离线'}
            </div>
            <div className="px-3 py-1.5 rounded-full bg-bg-secondary text-xs font-mono text-text-secondary">
              {llmModel}
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={Mail}
          label="处理邮件总数"
          value={stats.total}
          sub="全部历史记录"
          color="text-accent"
          bgColor="bg-accent-bg"
        />
        <StatCard
          icon={CheckCircle}
          label="审核通过率"
          value={stats.total > 0 ? `${Math.round((stats.passed / stats.total) * 100)}%` : '--'}
          sub={`${stats.passed}/${stats.total} 通过`}
          color="text-success"
          bgColor="bg-success/10"
        />
        <StatCard
          icon={AlertTriangle}
          label="人工介入"
          value={stats.humanNeeded}
          sub="需人工处理次数"
          color="text-warning"
          bgColor="bg-warning/10"
        />
        <StatCard
          icon={Zap}
          label="平均推理步数"
          value={stats.avgThoughts}
          sub="Solver 思考轮次"
          color="text-info"
          bgColor="bg-info/10"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Policy distribution */}
        <div className="bg-bg-panel rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold text-text-primary">策略匹配分布</h3>
          </div>
          <PolicyChart history={history} />
        </div>

        {/* Language distribution */}
        <div className="bg-bg-panel rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-info" />
            <h3 className="text-sm font-semibold text-text-primary">语言分布</h3>
          </div>
          <LanguageDistribution history={history} />
        </div>

        {/* Performance */}
        <div className="bg-bg-panel rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-success" />
            <h3 className="text-sm font-semibold text-text-primary">系统状态</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">LLM 模型</span>
              <span className="text-xs font-mono text-text-tertiary">{llmModel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">连接状态</span>
              <span className={cn('text-xs font-medium', systemOnline ? 'text-success' : 'text-error')}>
                {systemOnline ? '已连接' : '断开'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">历史记录</span>
              <span className="text-xs font-mono text-text-tertiary">{history.length}/50</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">审核通过</span>
              <span className="text-xs font-mono text-text-tertiary">
                {stats.passed}/{stats.total}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-bg-panel rounded-2xl border border-border p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-text-tertiary" />
          <h3 className="text-sm font-semibold text-text-primary">最近处理记录</h3>
        </div>
        <RecentActivity history={history} />
      </div>
    </div>
  )
}
