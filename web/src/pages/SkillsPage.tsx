import { useState, useEffect, useCallback } from 'react'
import { BookOpen, ChevronRight, Edit3, Save, X, RefreshCw, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/Toast'

interface SkillEntry {
  id: string
  name: string
  file: string
  trigger: string
  l1_summary: string
  l2_section: string
  l3_sections: string[]
}

interface SkillDetail extends SkillEntry {
  l2_content: string
  full_content: string
}

type EditMode = 'meta' | 'content' | null

function getApiUrl(): string {
  return ''
}

async function fetchSkills(): Promise<SkillEntry[]> {
  const r = await fetch(`${getApiUrl()}/api/skills`)
  if (!r.ok) throw new Error('Failed to fetch skills')
  const data = await r.json()
  return data.skills
}

async function fetchSkillDetail(id: string): Promise<SkillDetail> {
  const r = await fetch(`${getApiUrl()}/api/skills/${id}`)
  if (!r.ok) throw new Error('Failed to fetch skill detail')
  return r.json()
}

async function patchSkillMeta(id: string, updates: Partial<SkillEntry>): Promise<void> {
  const r = await fetch(`${getApiUrl()}/api/skills/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!r.ok) throw new Error('Failed to update skill')
}

async function putSkillContent(id: string, content: string): Promise<void> {
  const r = await fetch(`${getApiUrl()}/api/skills/${id}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!r.ok) throw new Error('Failed to update skill content')
}

// ── Level badge ──
function LevelBadge({ level, label }: { level: 'L1' | 'L2' | 'L3'; label: string }) {
  const colors = {
    L1: 'bg-blue-50 text-blue-600 border-blue-200',
    L2: 'bg-amber-50 text-amber-600 border-amber-200',
    L3: 'bg-purple-50 text-purple-600 border-purple-200',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border', colors[level])}>
      <span className="font-mono">{level}</span>
      <span className="font-normal">{label}</span>
    </span>
  )
}

// ── Skill list item ──
function SkillListItem({
  skill,
  selected,
  onClick,
}: {
  skill: SkillEntry
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-3 rounded-lg transition-all duration-150 group',
        selected
          ? 'bg-accent-bg border border-accent/30'
          : 'hover:bg-bg-hover border border-transparent'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className={cn('text-[13px] font-semibold leading-snug', selected ? 'text-accent' : 'text-text-primary')}>
            {skill.name}
          </div>
          <div className="text-[11px] text-text-tertiary mt-0.5 leading-snug line-clamp-2">
            {skill.l1_summary}
          </div>
        </div>
        <ChevronRight className={cn('w-3.5 h-3.5 shrink-0 mt-0.5 transition-transform', selected ? 'text-accent rotate-90' : 'text-text-tertiary group-hover:translate-x-0.5')} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <span className="text-[10px] font-mono text-text-tertiary/70 bg-bg-secondary px-1.5 py-0.5 rounded">
          {skill.id}
        </span>
      </div>
    </button>
  )
}

// ── Meta editor ──
function MetaEditor({
  skill,
  onSave,
  onCancel,
}: {
  skill: SkillDetail
  onSave: (updates: Partial<SkillEntry>) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(skill.name)
  const [trigger, setTrigger] = useState(skill.trigger)
  const [l1Summary, setL1Summary] = useState(skill.l1_summary)
  const [l2Section, setL2Section] = useState(skill.l2_section)
  const [l3Sections, setL3Sections] = useState(skill.l3_sections.join('\n'))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        name,
        trigger,
        l1_summary: l1Summary,
        l2_section: l2Section,
        l3_sections: l3Sections.split('\n').map(s => s.trim()).filter(Boolean),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">编辑注册表元数据</h3>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-all">
            <X className="w-3.5 h-3.5" /> 取消
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 transition-all disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-text-secondary mb-1">技能名称</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded-lg focus:outline-none focus:border-accent" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-text-secondary mb-1">L2 核心章节名</label>
          <input value={l2Section} onChange={e => setL2Section(e.target.value)} className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded-lg focus:outline-none focus:border-accent" />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-text-secondary mb-1">
          L1 触发条件 <span className="text-text-tertiary font-normal">（注入到 Solver 的技能表，用于意图识别）</span>
        </label>
        <input value={trigger} onChange={e => setTrigger(e.target.value)} className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded-lg focus:outline-none focus:border-accent" />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-text-secondary mb-1">
          L1 一句话说明 <span className="text-text-tertiary font-normal">（Solver 看到的技能描述）</span>
        </label>
        <input value={l1Summary} onChange={e => setL1Summary(e.target.value)} className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded-lg focus:outline-none focus:border-accent" />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-text-secondary mb-1">
          L3 可按需加载的章节 <span className="text-text-tertiary font-normal">（每行一个章节名）</span>
        </label>
        <textarea
          value={l3Sections}
          onChange={e => setL3Sections(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded-lg focus:outline-none focus:border-accent font-mono resize-none"
        />
      </div>
    </div>
  )
}

// ── Content editor ──
function ContentEditor({
  skill,
  onSave,
  onCancel,
}: {
  skill: SkillDetail
  onSave: (content: string) => Promise<void>
  onCancel: () => void
}) {
  const [content, setContent] = useState(skill.full_content)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(content)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="text-sm font-semibold text-text-primary">编辑流程文件 <span className="font-mono text-text-tertiary text-xs">{skill.file}</span></h3>
        <div className="flex gap-2">
          <button onClick={() => setPreview(!preview)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-all">
            {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {preview ? '编辑' : '预览'}
          </button>
          <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-all">
            <X className="w-3.5 h-3.5" /> 取消
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 transition-all disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {saving ? '保存中...' : '保存文件'}
          </button>
        </div>
      </div>

      {preview ? (
        <div className="flex-1 overflow-y-auto bg-bg-secondary rounded-xl p-4 text-sm text-text-primary whitespace-pre-wrap font-mono leading-relaxed border border-border">
          {content}
        </div>
      ) : (
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="flex-1 w-full px-4 py-3 text-sm bg-bg-secondary border border-border rounded-xl focus:outline-none focus:border-accent font-mono resize-none leading-relaxed"
          spellCheck={false}
        />
      )}
    </div>
  )
}

// ── Skill detail panel ──
function SkillDetailPanel({ skillId, onRefresh }: { skillId: string; onRefresh: () => void }) {
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [editMode, setEditMode] = useState<EditMode>(null)
  const [showL2, setShowL2] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetchSkillDetail(skillId)
      setDetail(d)
    } catch {
      toast('error', '加载技能详情失败')
    } finally {
      setLoading(false)
    }
  }, [skillId])

  useEffect(() => {
    setEditMode(null)
    setShowL2(false)
    load()
  }, [skillId, load])

  const handleSaveMeta = async (updates: Partial<SkillEntry>) => {
    await patchSkillMeta(skillId, updates)
    toast('success', '注册表元数据已更新')
    setEditMode(null)
    await load()
    onRefresh()
  }

  const handleSaveContent = async (content: string) => {
    await putSkillContent(skillId, content)
    toast('success', '流程文件已保存')
    setEditMode(null)
    await load()
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> 加载中...
      </div>
    )
  }

  if (!detail) return null

  if (editMode === 'meta') {
    return (
      <div className="flex-1 overflow-y-auto p-5">
        <MetaEditor skill={detail} onSave={handleSaveMeta} onCancel={() => setEditMode(null)} />
      </div>
    )
  }

  if (editMode === 'content') {
    return (
      <div className="flex-1 flex flex-col p-5 min-h-0">
        <ContentEditor skill={detail} onSave={handleSaveContent} onCancel={() => setEditMode(null)} />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-text-primary">{detail.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] font-mono text-text-tertiary bg-bg-secondary px-2 py-0.5 rounded border border-border">{detail.id}</span>
            <span className="text-[11px] text-text-tertiary">{detail.file}</span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setEditMode('meta')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover border border-border transition-all">
            <Edit3 className="w-3.5 h-3.5" /> 编辑元数据
          </button>
          <button onClick={() => setEditMode('content')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 transition-all">
            <Edit3 className="w-3.5 h-3.5" /> 编辑流程文件
          </button>
        </div>
      </div>

      {/* Progressive disclosure levels */}
      <div className="space-y-3">
        {/* L1 */}
        <div className="bg-bg-panel rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border-light flex items-center gap-2">
            <LevelBadge level="L1" label="始终注入" />
            <span className="text-xs text-text-tertiary">每次 Solver 调用都可见，约 50 tokens</span>
          </div>
          <div className="px-4 py-3 space-y-2">
            <div>
              <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">触发条件</div>
              <div className="text-sm text-text-primary">{detail.trigger}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">一句话说明</div>
              <div className="text-sm text-text-primary">{detail.l1_summary}</div>
            </div>
          </div>
        </div>

        {/* L2 */}
        <div className="bg-bg-panel rounded-xl border border-border overflow-hidden">
          <button
            onClick={() => setShowL2(!showL2)}
            className="w-full px-4 py-3 border-b border-border-light flex items-center justify-between hover:bg-bg-hover transition-colors"
          >
            <div className="flex items-center gap-2">
              <LevelBadge level="L2" label="按需加载" />
              <span className="text-xs text-text-tertiary">Solver 调用 load_skill(id) 时注入，章节: {detail.l2_section}</span>
            </div>
            <ChevronRight className={cn('w-4 h-4 text-text-tertiary transition-transform', showL2 && 'rotate-90')} />
          </button>
          {showL2 && (
            <div className="px-4 py-3">
              <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                {detail.l2_content || '（该章节内容为空）'}
              </pre>
            </div>
          )}
        </div>

        {/* L3 */}
        <div className="bg-bg-panel rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border-light flex items-center gap-2">
            <LevelBadge level="L3" label="深度按需" />
            <span className="text-xs text-text-tertiary">Solver 调用 load_skill_section(id, section) 时注入</span>
          </div>
          <div className="px-4 py-3">
            {detail.l3_sections.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {detail.l3_sections.map(s => (
                  <span key={s} className="text-xs font-mono bg-purple-50 text-purple-600 border border-purple-200 px-2 py-1 rounded-md">
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-text-tertiary">无 L3 章节（完整流程在 L2 已覆盖）</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── L1 Table Preview ──
function L1TablePreview() {
  const [table, setTable] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${getApiUrl()}/api/skills/meta/l1_table`)
      if (r.ok) {
        const data = await r.json()
        setTable(data.table || '')
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="bg-bg-panel rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <LevelBadge level="L1" label="注入预览" />
          <span className="text-xs text-text-tertiary">以下内容将注入到每次 Solver 的系统提示词中</span>
        </div>
        <button onClick={load} disabled={loading} className="text-xs text-text-tertiary hover:text-text-secondary transition-colors">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </button>
      </div>
      <pre className="text-xs font-mono text-text-secondary whitespace-pre overflow-x-auto leading-relaxed">
        {table || '（加载中...）'}
      </pre>
    </div>
  )
}

// ── Main page ──
export function SkillsPage() {
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showL1Preview, setShowL1Preview] = useState(false)

  const loadSkills = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchSkills()
      setSkills(list)
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id)
      }
    } catch {
      toast('error', '加载技能列表失败，请确认后端已启动')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => { loadSkills() }, [])

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="px-5 py-3 border-b border-border-light bg-bg flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-4 h-4 text-accent" />
          <h1 className="text-sm font-semibold text-text-primary">技能注册表</h1>
          <span className="text-xs text-text-tertiary">Skills Registry — Progressive Disclosure</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowL1Preview(!showL1Preview)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all',
              showL1Preview
                ? 'bg-blue-50 text-blue-600 border-blue-200'
                : 'text-text-secondary border-border hover:bg-bg-hover'
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            L1 注入预览
          </button>
          <button onClick={loadSkills} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary border border-border rounded-lg hover:bg-bg-hover transition-all disabled:opacity-50">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            刷新
          </button>
        </div>
      </div>

      {/* L1 preview banner */}
      {showL1Preview && (
        <div className="px-5 py-3 border-b border-border-light bg-bg overflow-y-auto max-h-48 shrink-0">
          <L1TablePreview />
        </div>
      )}

      {/* Design info banner */}
      <div className="px-5 py-2.5 bg-blue-50/50 border-b border-blue-100 shrink-0">
        <div className="flex items-start gap-2 text-xs text-blue-700">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            <strong>渐进式披露设计：</strong>
            L1（始终注入，~750 tokens）→ L2（Solver 调用 load_skill 时加载核心规则）→ L3（按需加载具体步骤章节）。
            相比旧版路由 Agent + 全量注入，平均节省 60-80% 提示词 token。
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Skill list */}
        <aside className="w-[240px] shrink-0 border-r border-border-light bg-bg overflow-y-auto">
          <div className="p-2 space-y-0.5">
            {loading && skills.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-text-tertiary text-xs">
                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" /> 加载中...
              </div>
            ) : skills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-text-tertiary text-xs gap-2">
                <AlertCircle className="w-5 h-5" />
                <span>无法加载技能列表</span>
              </div>
            ) : (
              skills.map(skill => (
                <SkillListItem
                  key={skill.id}
                  skill={skill}
                  selected={selectedId === skill.id}
                  onClick={() => setSelectedId(skill.id)}
                />
              ))
            )}
          </div>
        </aside>

        {/* Detail panel */}
        <div className="flex-1 flex flex-col min-w-0 bg-bg">
          {selectedId ? (
            <SkillDetailPanel key={selectedId} skillId={selectedId} onRefresh={loadSkills} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-text-tertiary gap-3">
              <BookOpen className="w-8 h-8 opacity-30" />
              <span className="text-sm">选择左侧技能查看详情</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
