import { useState, useEffect } from 'react'
import { Wrench, Search, Package, Truck, Database, ShoppingCart, BookOpen, Mail, GitBranch, HelpCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolEntry {
  name: string
  description: string
  category: string
  params: string
  registered: boolean
}

const CATEGORY_META: Record<string, { label: string; icon: typeof Wrench; color: string }> = {
  order:      { label: '订单查询',   icon: ShoppingCart, color: 'bg-blue-50 text-blue-600 border-blue-200' },
  logistics:  { label: '物流查询',   icon: Truck,        color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  inventory:  { label: '库存查询',   icon: Database,     color: 'bg-amber-50 text-amber-600 border-amber-200' },
  product:    { label: '产品查询',   icon: Package,      color: 'bg-purple-50 text-purple-600 border-purple-200' },
  knowledge:  { label: '知识检索',   icon: Search,       color: 'bg-cyan-50 text-cyan-600 border-cyan-200' },
  skill:      { label: '流程加载',   icon: BookOpen,     color: 'bg-rose-50 text-rose-600 border-rose-200' },
  account:    { label: '账号查询',   icon: Mail,         color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  channel:    { label: '渠道查询',   icon: GitBranch,    color: 'bg-orange-50 text-orange-600 border-orange-200' },
  other:      { label: '其他',       icon: HelpCircle,   color: 'bg-gray-50 text-gray-600 border-gray-200' },
}

function getApiUrl(): string {
  return ''
}

function CategoryBadge({ category }: { category: string }) {
  const meta = CATEGORY_META[category] || CATEGORY_META.other
  const Icon = meta.icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border', meta.color)}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  )
}

function ToolCard({ tool, expanded, onToggle }: { tool: ToolEntry; expanded: boolean; onToggle: () => void }) {
  // Split description: main text vs params
  const mainDesc = tool.description.split('参数:')[0].trim()

  return (
    <button
      onClick={onToggle}
      className={cn(
        'w-full text-left rounded-xl border transition-all duration-150',
        expanded
          ? 'bg-bg-panel border-accent/30 shadow-sm'
          : 'bg-bg-panel border-border hover:border-border-light hover:shadow-sm'
      )}
    >
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn(
                'text-[13px] font-semibold font-mono',
                expanded ? 'text-accent' : 'text-text-primary'
              )}>
                {tool.name}
              </span>
              <CategoryBadge category={tool.category} />
              {tool.registered && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-success/10 text-success border border-success/20">
                  已注册
                </span>
              )}
            </div>
            <p className="text-[12px] text-text-secondary mt-1 leading-relaxed">
              {mainDesc}
            </p>
          </div>
        </div>

        {expanded && tool.params && (
          <div className="mt-3 pt-3 border-t border-border-light">
            <div className="text-[11px] font-medium text-text-tertiary mb-1.5">参数签名</div>
            <code className="block text-[12px] font-mono text-text-secondary bg-bg-secondary rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap">
              {tool.params}
            </code>
          </div>
        )}
      </div>
    </button>
  )
}

export function ToolsPage() {
  const [tools, setTools] = useState<ToolEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedTool, setExpandedTool] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const loadTools = async () => {
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`${getApiUrl()}/api/tools`)
      if (!r.ok) throw new Error('Failed to fetch tools')
      const data = await r.json()
      setTools(data.tools)
    } catch {
      setError('无法加载工具列表，请检查后端服务是否运行')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTools() }, [])

  // Derive categories from loaded tools
  const categories = [...new Set(tools.map(t => t.category))]

  // Filter
  const filtered = tools.filter(t => {
    if (filterCategory && t.category !== filterCategory) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    }
    return true
  })

  // Group by category for display
  const grouped = new Map<string, ToolEntry[]>()
  for (const t of filtered) {
    const list = grouped.get(t.category) || []
    list.push(t)
    grouped.set(t.category, list)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> 加载工具列表...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-tertiary">
        <Wrench className="w-8 h-8 opacity-40" />
        <p className="text-sm">{error}</p>
        <button onClick={loadTools} className="text-xs text-accent hover:underline">重试</button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 gap-5">
      {/* Header */}
      <div className="shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <Wrench className="w-5 h-5 text-accent" />
              工具注册表
            </h1>
            <p className="text-xs text-text-tertiary mt-0.5">
              Solver 可调用的所有工具一览 · 共 {tools.length} 个工具
            </p>
          </div>
          <button
            onClick={loadTools}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover border border-border transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 刷新
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mt-4">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索工具名称或描述..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-bg-secondary border border-border rounded-lg focus:outline-none focus:border-accent"
            />
          </div>

          {/* Category chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterCategory(null)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border',
                !filterCategory
                  ? 'bg-accent text-white border-accent'
                  : 'bg-bg-secondary text-text-secondary border-border hover:border-border-light'
              )}
            >
              全部
            </button>
            {categories.map(cat => {
              const meta = CATEGORY_META[cat] || CATEGORY_META.other
              return (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border',
                    filterCategory === cat
                      ? 'bg-accent text-white border-accent'
                      : 'bg-bg-secondary text-text-secondary border-border hover:border-border-light'
                  )}
                >
                  {meta.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tool list */}
      <div className="flex-1 overflow-y-auto space-y-6 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
            <Search className="w-6 h-6 opacity-40 mb-2" />
            <p className="text-sm">没有匹配的工具</p>
          </div>
        ) : (
          [...grouped.entries()].map(([cat, catTools]) => {
            const meta = CATEGORY_META[cat] || CATEGORY_META.other
            const Icon = meta.icon
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2.5 px-1">
                  <Icon className="w-3.5 h-3.5 text-text-tertiary" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    {meta.label}
                  </span>
                  <span className="text-[10px] text-text-tertiary/60">{catTools.length}</span>
                </div>
                <div className="space-y-2">
                  {catTools.map(tool => (
                    <ToolCard
                      key={tool.name}
                      tool={tool}
                      expanded={expandedTool === tool.name}
                      onToggle={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                    />
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
