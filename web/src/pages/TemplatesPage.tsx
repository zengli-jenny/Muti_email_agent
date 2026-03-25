import { useState, useMemo } from 'react'
import {
  FileText, Plus, Trash2, Edit3, Copy, Search,
  Package, RefreshCw, HelpCircle, AlertCircle, Star, X,
  Truck, Receipt, ArrowLeftRight, Mail, ShieldCheck, Palette,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore, type EmailTemplate } from '@/store/useStore'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { toast } from '@/components/Toast'

const CATEGORIES = [
  { key: 'all', label: '全部', icon: FileText },
  { key: 'refund', label: '退款退货', icon: RefreshCw },
  { key: 'shipping', label: '物流配送', icon: Truck },
  { key: 'product', label: '产品咨询', icon: HelpCircle },
  { key: 'complaint', label: '质量投诉', icon: AlertCircle },
  { key: 'order', label: '订单修改', icon: Receipt },
  { key: 'exchange', label: '换货处理', icon: ArrowLeftRight },
  { key: 'invoice', label: '发票索取', icon: Mail },
  { key: 'warranty', label: '售后保修', icon: ShieldCheck },
  { key: 'design', label: '描述差异', icon: Palette },
  { key: 'custom', label: '自定义', icon: Star },
]

// ── Realistic templates extracted from actual business scenarios ──
const BUILTIN_TEMPLATES: EmailTemplate[] = [
  {
    id: 'builtin-refund-full',
    name: '客户退款 — 产品不满意',
    category: 'refund',
    description: '客户收到 Ohuhu Marker Set 48 后对产品不满意，要求全额退款。订单已签收。',
    body: `Dear Customer Service,

I recently received my order #OHU290027 (Ohuhu Marker Set 48). Unfortunately, the markers don't blend as smoothly as I expected based on the product description. Several colors appear different from what was shown on the listing.

I would like to request a full refund. The tracking number is TRK1001 and it was delivered on March 10th.

Please let me know the return process.

Best regards,
Alice`,
    instructions: '查询订单 OHU290027 的基本信息和补充信息，确认已签收状态。按照客户原因退换货处理流程，提供全额退款方案，说明退货流程和预计退款时间（5-7个工作日）。语气友好，表达对客户体验的重视。',
  },
  {
    id: 'builtin-shipping-delay',
    name: '物流延迟 — 包裹在途未到',
    category: 'shipping',
    description: '客户购买 Tribit XSound Go 蓝牙音箱，包裹显示在途但已超过预计到达时间。',
    body: `Hello,

I placed an order for a Tribit XSound Go speaker (Order #TRB998877) about two weeks ago. The tracking number TRK2001 shows it's still "in transit" but it should have arrived by now.

Could you please check the status of my package? I need it for an upcoming trip.

Thanks,
Bob`,
    instructions: '查询订单 TRB998877 和物流 TRK2001 的状态。按照物流问题处理流程，解释当前物流状态，提供预计到达时间。如超过承诺时效，提供补偿方案（优惠券或部分退款）。',
  },
  {
    id: 'builtin-product-inquiry',
    name: '产品咨询 — 规格与兼容性',
    category: 'product',
    description: '客户咨询 Ohuhu 水彩笔套装的规格、与其他品牌的兼容性以及库存情况。',
    body: `Hi there,

I'm an art teacher and I'm considering purchasing the Ohuhu Watercolor Set (SKU: OHU-WATERCOLOR-24) for my classroom. I have a few questions:

1. Are these watercolors compatible with standard watercolor paper (300gsm)?
2. Are the colors lightfast for student exhibitions?
3. Do you have enough stock for a bulk order of 15 sets?
4. Is there any educational discount available?

Looking forward to your response.

Best,
Sarah Miller
Art Department, Lincoln Elementary`,
    instructions: '通过 SKU 查询 OHU-WATERCOLOR-24 的产品信息和库存。按照售前咨询处理流程回答产品规格问题。对于批量采购和教育折扣，如无明确政策则标记需要人工处理。',
  },
  {
    id: 'builtin-quality-complaint',
    name: '质量投诉 — 产品损坏',
    category: 'complaint',
    description: '客户收到的 Tribit StormBox 音箱存在严重质量问题，使用一周后无法开机。',
    body: `To Whom It May Concern,

I purchased a Tribit StormBox Bluetooth Speaker and it stopped working completely after just one week of normal use. The speaker won't turn on even when fully charged, and there's a rattling sound inside when I shake it.

This is extremely disappointing for a product at this price point. I've attached photos of the product and my order confirmation.

Order details:
- Product: Tribit StormBox (SKU: TRB-STORMBOX)
- Purchase date: March 1, 2026
- Issue: Device won't power on, internal rattling noise

I expect a full refund AND a replacement, or I will be filing a complaint with consumer protection.

Regards,
David Chen`,
    instructions: '查询相关订单信息和产品信息。按照商品质量问题处理流程，以最高优先级处理。真诚道歉，提供全额退款+免费换货方案。如货值超过审批阈值，标记需要主管审批。确认保修状态。',
  },
  {
    id: 'builtin-order-modify',
    name: '订单修改 — 取消或更改地址',
    category: 'order',
    description: '客户要求修改已下单但尚未发货的订单收货地址，或取消订单。',
    body: `Hi Support,

I just placed order #TRB998877 for a Tribit XSound Go, but I realized I entered the wrong shipping address. The package should go to:

New Address:
456 Oak Avenue, Apt 12B
San Francisco, CA 94102

If the order hasn't shipped yet, could you please update the address? If it's already shipped, please let me know what options I have.

Also, if the address can't be changed, I'd rather cancel the order and reorder with the correct address.

Thank you,
Bob`,
    instructions: '查询订单 TRB998877 状态。按照订单修改与取消流程处理。如未发货，协助修改地址；如已发货，说明无法修改并提供替代方案（拦截包裹或等待退回）。',
  },
  {
    id: 'builtin-exchange',
    name: '换货处理 — 收到错误商品',
    category: 'exchange',
    description: '客户订购了 Ohuhu Marker Set 48 色但收到了 24 色套装，要求换货。',
    body: `Dear Ohuhu Support,

I ordered the Ohuhu Marker Set 48 colors (Order #OHU290027) but received the 24-color set instead. The tracking number TRK1001 shows delivered on March 10.

I specifically needed the 48-color set for my illustration work. Could you please send me the correct product? I'm happy to return the wrong one.

Please advise on the next steps.

Thank you,
Alice`,
    instructions: '查询订单 OHU290027 确认订购的是 48 色套装。按照发货差错问题处理流程，道歉并安排正确商品重新发货。提供退回错误商品的预付运费标签。查询 OHU-MARKER-48 库存确认有货。',
  },
  {
    id: 'builtin-invoice',
    name: '发票索取 — 企业采购',
    category: 'invoice',
    description: '企业客户购买产品后需要正式发票用于报销或税务用途。',
    body: `Hello,

I purchased several Ohuhu products for our company's design department. I need an official invoice for tax purposes.

Order #OHU290027
Company: Creative Design Studio LLC
Tax ID: 12-3456789
Billing Address: 789 Business Park Dr, Suite 200, Austin, TX 78701

Could you please issue a formal invoice with the above company details? We need it before the end of this month for our quarterly filing.

Best regards,
Alice Johnson
Procurement Manager
Creative Design Studio LLC`,
    instructions: '查询订单 OHU290027 信息。按照客户索要发票处理流程，确认订单金额和商品明细，说明发票开具流程和预计时间。如需要特殊格式发票，标记人工处理。',
  },
  {
    id: 'builtin-warranty',
    name: '售后保修 — 保修期内维修',
    category: 'warranty',
    description: '客户的 Tribit 蓝牙音箱在保修期内出现充电问题，申请保修服务。',
    body: `Hi Tribit Support,

My Tribit XSound Go (purchased 3 months ago) is having charging issues. The USB-C port seems loose and the speaker only charges intermittently. I've tried multiple cables and chargers.

Product: Tribit XSound Go (SKU: TRB-XSOUND-GO)
Purchase Order: #TRB998877
Issue: Intermittent charging, loose USB-C port

Is this covered under warranty? What's the process for getting a repair or replacement?

Thanks,
Bob`,
    instructions: '查询订单 TRB998877 的补充信息确认保修状态。按照售后咨询处理流程，确认产品在保修期内。提供保修维修/换货方案，说明寄回流程。如需要查询库存确认换货可用性。',
  },
  {
    id: 'builtin-design-diff',
    name: '描述差异 — 产品与图片不符',
    category: 'design',
    description: '客户反映收到的产品颜色/外观与网页展示图片存在明显差异。',
    body: `Hello,

I received my Ohuhu Marker Set 48 (Order #OHU290027) today, but the marker case color is completely different from what's shown on your website. The listing shows a sleek black case, but I received a dark grey one with a different texture.

Also, the tip shapes on markers #15 and #23 look different from the product photos — they appear to be chisel tips instead of the brush tips shown.

I feel misled by the product images. What can you do about this?

Photos attached for reference.

Alice`,
    instructions: '查询订单 OHU290027 和产品 OHU-MARKER-48 信息。按照设计与描述差异问题处理流程，确认客户反映的差异是否属实。如确认存在差异，提供退货退款或部分补偿方案。表达对产品展示准确性的重视。',
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
    toast('success', `模板「${name}」已创建`)
    onClose()
  }

  return (
    <div className="bg-bg-panel rounded-xl border border-accent/20 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">创建自定义模板</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-bg-hover text-text-tertiary">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium text-text-secondary mb-1 block">模板名称</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="例：客户催单回复"
            className="w-full px-3 py-1.5 text-xs border border-border rounded-lg bg-bg-secondary focus:outline-none focus:border-accent" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-text-secondary mb-1 block">分类</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full px-3 py-1.5 text-xs border border-border rounded-lg bg-bg-secondary focus:outline-none focus:border-accent">
            {CATEGORIES.filter(c => c.key !== 'all').map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-[11px] font-medium text-text-secondary mb-1 block">场景描述</label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="简要描述使用场景"
          className="w-full px-3 py-1.5 text-xs border border-border rounded-lg bg-bg-secondary focus:outline-none focus:border-accent" />
      </div>
      <div>
        <label className="text-[11px] font-medium text-text-secondary mb-1 block">客户邮件内容</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} placeholder="粘贴或输入客户邮件..."
          className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-bg-secondary focus:outline-none focus:border-accent resize-none" />
      </div>
      <div>
        <label className="text-[11px] font-medium text-text-secondary mb-1 block">处理指令（可选）</label>
        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2} placeholder="给 AI 的处理指令..."
          className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-bg-secondary focus:outline-none focus:border-accent resize-none" />
      </div>
      <button onClick={handleSave} disabled={!name.trim() || !body.trim()}
        className={cn('w-full py-2 rounded-xl text-sm font-medium transition-all',
          'bg-accent text-text-inverse hover:bg-accent-hover',
          'disabled:opacity-50 disabled:cursor-not-allowed')}>
        保存模板
      </button>
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
              基于真实业务场景的邮件模板，覆盖 {BUILTIN_TEMPLATES.length} 种常见客服流程
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
                  onEdit={isBuiltin ? undefined : () => toast('info', '编辑功能开发中')}
                  onDelete={isBuiltin ? undefined : () => setDeleteTarget(template.id)}
                />
              )
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-text-tertiary">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">没有匹配的模板</p>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          title="删除模板"
          message="确定要删除这个模板吗？此操作不可撤销。"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
