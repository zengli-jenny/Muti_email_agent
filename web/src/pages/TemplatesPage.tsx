import { useState, useMemo } from 'react'
import {
  FileText, Plus, Trash2, Edit3, Copy, ChevronRight, Search,
  Package, RefreshCw, HelpCircle, AlertCircle, Star, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore, type EmailTemplate } from '@/store/useStore'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { toast } from '@/components/Toast'

const CATEGORIES = [
  { key: 'all', label: '全部', icon: FileText },
  { key: 'refund', label: '退款退货', icon: RefreshCw },
  { key: 'shipping', label: '物流配送', icon: Package },
  { key: 'product', label: '产品咨询', icon: HelpCircle },
  { key: 'complaint', label: '投诉处理', icon: AlertCircle },
  { key: 'custom', label: '自定义', icon: Star },
]

const BUILTIN_TEMPLATES: EmailTemplate[] = [
  {
    id: 'builtin-refund-agree',
    name: '同意退款',
    category: 'refund',
    description: '客户要求退款，同意全额退款并提供退货流程',
    body: 'Dear Customer Service,\n\nI would like to request a refund for my recent order #[ORDER_ID]. The product did not meet my expectations.\n\nPlease process the refund at your earliest convenience.\n\nThank you.',
    instructions: '同意退款请求，表达歉意，提供退货地址和退款流程说明，预计退款时间为5-7个工作日',
  },
  {
    id: 'builtin-refund-partial',
    name: '部分退款',
    category: 'refund',
    description: '产品有轻微瑕疵，提供部分退款方案',
    body: 'Hi,\n\nI received my order but noticed some minor defects on the product. While it\'s still usable, I\'m not fully satisfied with the quality.\n\nCan you offer any compensation?',
    instructions: '提供部分退款方案（20-30%），表示理解客户不满，同时提供换货选项作为替代方案',
  },
  {
    id: 'builtin-shipping-delay',
    name: '物流延迟',
    category: 'shipping',
    description: '客户询问包裹延迟，查询物流状态并解释',
    body: 'Hello,\n\nI ordered my package 3 weeks ago and it still hasn\'t arrived. The tracking shows it\'s stuck in transit.\n\nWhen can I expect to receive it?',
    instructions: '查询订单物流状态，解释可能的延迟原因，提供预计到达时间，如超过承诺时效则提供补偿方案',
  },
  {
    id: 'builtin-shipping-wrong',
    name: '错发/漏发',
    category: 'shipping',
    description: '客户收到错误商品或缺少商品',
    body: 'Dear Support,\n\nI received my order today but the items are wrong. I ordered Product A but received Product B instead.\n\nPlease help resolve this issue.',
    instructions: '表示歉意，确认订单信息，安排正确商品重新发货，提供退回错误商品的预付运费标签',
  },
  {
    id: 'builtin-product-inquiry',
    name: '产品咨询',
    category: 'product',
    description: '客户咨询产品规格、库存或兼容性',
    body: 'Hi there,\n\nI\'m interested in purchasing [PRODUCT_NAME] but I have a few questions:\n- Is this compatible with [DEVICE]?\n- When will it be back in stock?\n- Do you offer any bundle discounts?',
    instructions: '详细回答产品相关问题，提供准确的规格信息，如有库存问题给出预计补货时间，推荐相关产品',
  },
  {
    id: 'builtin-complaint-quality',
    name: '质量投诉',
    category: 'complaint',
    description: '客户对产品质量严重不满，要求处理',
    body: 'To Whom It May Concern,\n\nI am extremely disappointed with the quality of my purchase. The product broke after just one week of normal use.\n\nThis is unacceptable and I demand a full refund and compensation for my inconvenience.',
    instructions: '以最高优先级处理，真诚道歉，提供全额退款+额外补偿（优惠券或赠品），承诺产品质量改进，升级客户VIP等级',
  },
]

function TemplateCard({
  template,
  onUse,
  onEdit,
  onDelete,
  isBuiltin,
}: {
  template: EmailTemplate
  onUse: () => void
  onEdit?: () => void
  onDelete?: () => void
  isBuiltin: boolean
}) {
  return (
    <div className="bg-bg-panel rounded-xl border border-border p-4 hover:shadow-md transition-all group">
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-semibold text-text-primary">{template.name}</h4>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isBuiltin && onEdit && (
            <button onClick={onEdit} className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-secondary" aria-label="编辑模板">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
          {!isBuiltin && onDelete && (
            <button onClick={onDelete} className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-error" aria-label="删除模板">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-text-tertiary mb-3 line-clamp-2">{template.description}</p>
      {template.instructions && (
        <div className="text-xs text-accent bg-accent-bg/50 rounded-lg px-2.5 py-1.5 mb-3 line-clamp-2">
          {template.instructions}
        </div>
      )}
      <button
        onClick={onUse}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
      >
        <Copy className="w-3.5 h-3.5" />
        使用模板
      </button>
    </div>
  )
}

function CreateTemplateForm({ onClose }: { onClose: () => void }) {
  const { addTemplate } = useStore()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('custom')
  const [description, setDescription] = useState('')
  const [body, setBody] = useState('')
  const [instructions, setInstructions] = useState('')

  const handleSave = () => {
    if (!name.trim() || !body.trim()) return
    addTemplate({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      category,
      description: description.trim(),
      body: body.trim(),
      instructions: instructions.trim(),
    })
    toast('success', `模板「${name.trim()}」已创建`)
    onClose()
  }

  return (
    <div className="bg-bg-panel rounded-2xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary">创建自定义模板</h3>
        <button onClick={onClose} className="text-xs text-text-tertiary hover:text-text-secondary">
          取消
        </button>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">模板名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：退款确认"
              className="w-full rounded-lg border border-border-light bg-bg-secondary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">分类</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-border-light bg-bg-secondary/50 px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              {CATEGORIES.filter((c) => c.key !== 'all').map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1 block">描述</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简要描述模板用途"
            className="w-full rounded-lg border border-border-light bg-bg-secondary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1 block">邮件正文模板</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="客户邮件内容模板..."
            rows={4}
            className="w-full rounded-lg border border-border-light bg-bg-secondary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/20 resize-y"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1 block">回复要求（可选）</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="告诉 AI 如何回复..."
            rows={2}
            className="w-full rounded-lg border border-accent-light bg-accent-bg/30 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/20 resize-y"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={!name.trim() || !body.trim()}
          className={cn(
            'w-full py-2 rounded-xl text-sm font-medium transition-all',
            'bg-accent text-text-inverse hover:bg-accent-hover',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          保存模板
        </button>
      </div>
    </div>
  )
}

export function TemplatesPage() {
  const { templates, removeTemplate, setActiveView } = useStore()
  const [activeCategory, setActiveCategory] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const allTemplates = [...BUILTIN_TEMPLATES, ...templates]

  const filtered = useMemo(() => {
    let result = activeCategory === 'all'
      ? allTemplates
      : allTemplates.filter((t) => t.category === activeCategory)

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.body.toLowerCase().includes(q)
      )
    }

    return result
  }, [allTemplates, activeCategory, search])

  const handleUseTemplate = (template: EmailTemplate) => {
    sessionStorage.setItem('template-body', template.body)
    sessionStorage.setItem('template-instructions', template.instructions)
    setActiveView('compose')
    toast('info', `已加载模板「${template.name}」`)
  }

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      removeTemplate(deleteTarget)
      toast('success', '模板已删除')
      setDeleteTarget(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6" style={{ animation: 'fade-in 0.3s ease-out' }}>
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text-primary">邮件模板</h1>
            <p className="text-sm text-text-tertiary mt-1">
              快速使用预设模板处理常见客户邮件场景
            </p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              'bg-accent text-text-inverse hover:bg-accent-hover shadow-sm'
            )}
          >
            <Plus className="w-4 h-4" />
            创建模板
          </button>
        </div>

        {/* Create form */}
        {showCreate && <CreateTemplateForm onClose={() => setShowCreate(false)} />}

        {/* Search + Category filter */}
        <div className="space-y-3">
          {/* Search */}
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索模板..."
              className={cn(
                'w-full pl-9 pr-8 py-1.5 rounded-lg border border-border-light bg-bg-secondary/50',
                'text-xs text-text-primary placeholder:text-text-tertiary',
                'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent'
              )}
              aria-label="搜索模板"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-bg-hover">
                <X className="w-3 h-3 text-text-tertiary" />
              </button>
            )}
          </div>

          {/* Categories */}
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveCategory(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  activeCategory === key
                    ? 'bg-accent text-text-inverse'
                    : 'bg-bg-secondary text-text-secondary hover:bg-bg-hover'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Template grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((template) => {
              const isBuiltin = template.id.startsWith('builtin-')
              return (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isBuiltin={isBuiltin}
                  onUse={() => handleUseTemplate(template)}
                  onEdit={isBuiltin ? undefined : () => {}}
                  onDelete={isBuiltin ? undefined : () => setDeleteTarget(template.id)}
                />
              )
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-text-tertiary/30 mx-auto mb-3" />
            <p className="text-sm text-text-tertiary">
              {search ? `未找到匹配「${search}」的模板` : '该分类下暂无模板'}
            </p>
          </div>
        )}

        {/* Tip */}
        <div className="bg-accent-bg/50 rounded-xl border border-accent-light p-4 flex items-start gap-3">
          <ChevronRight className="w-4 h-4 text-accent mt-0.5 shrink-0" />
          <div className="text-xs text-text-secondary">
            <strong className="text-text-primary">提示：</strong>
            点击「使用模板」将自动填充邮件内容和回复要求到新建回复页面。
            你也可以创建自定义模板来保存常用的处理方案。
          </div>
        </div>

        <ConfirmDialog
          open={!!deleteTarget}
          title="删除模板"
          message="确定要删除此自定义模板吗？此操作不可撤销。"
          confirmLabel="删除"
          variant="danger"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    </div>
  )
}
