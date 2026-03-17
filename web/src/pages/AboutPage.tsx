import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowDown, Zap, Brain, Mail, ShieldCheck, GitFork, ChevronDown, ExternalLink, Search, Database, Globe, Settings, CheckCircle, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'

/* ─── Scroll reveal hook ─── */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('revealed')
            observer.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12 }
    )
    const targets = el.querySelectorAll('.about-reveal, .about-scale-reveal')
    targets.forEach((t) => observer.observe(t))
    return () => observer.disconnect()
  }, [])
  return ref
}

/* ─── Section heading helper ─── */
function SectionHeading({ tag, tagColor, title, desc }: { tag: string; tagColor: string; title: string; desc?: string }) {
  return (
    <div className="text-center mb-16 about-reveal">
      <p className={cn('text-xs font-semibold uppercase tracking-widest mb-3', tagColor)}>{tag}</p>
      <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">{title}</h2>
      {desc && <p className="text-sm text-gray-400 max-w-xl mx-auto leading-relaxed">{desc}</p>}
    </div>
  )
}

/* ─── Accordion ─── */
function Accordion({ title, items }: { title: string; items: { what: string; where: string }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-700/50 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.03] transition-colors">
        <span className="text-sm font-semibold text-gray-100">{title}</span>
        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform duration-300', open && 'rotate-180')} />
      </button>
      <div className={cn('overflow-hidden transition-all duration-300', open ? 'max-h-[500px]' : 'max-h-0')}>
        <div className="px-5 pb-4">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b border-gray-700/50"><th className="text-left py-2 font-medium">改什么</th><th className="text-left py-2 font-medium">改哪个文件</th></tr></thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-gray-800/50 last:border-0">
                  <td className="py-2.5 text-gray-300">{item.what}</td>
                  <td className="py-2.5 font-mono text-[11px] text-cyan-400/80">{item.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   DATA CONSTANTS
   ═══════════════════════════════════════════════════════════ */

const ARCH_NODES = [
  { id: 'ctx', label: 'Load Context', sub: '上下文加载', x: 400, y: 50, color: '#6366F1',
    read: ['OldEmail (原始邮件)'], write: ['old_email', 'skill_profile', 'detected_language', 'customer_memory', 'policy_routing_rules'] },
  { id: 'router', label: 'Router', sub: '意图识别与路由', x: 400, y: 170, color: '#8B5CF6',
    read: ['old_email', 'policy_routing_rules'], write: ['basic_info (结构化)', 'selected_policy'] },
  { id: 'solver', label: 'Solver', sub: 'ReAct 推理引擎', x: 400, y: 310, color: '#F59E0B',
    read: ['selected_policy', 'skill_profile', 'old_email', 'tool_list', 'review_feedback'], write: ['solver_thoughts', 'tool_results', 'reply_draft'] },
  { id: 'tool', label: 'Tool Executor', sub: '工具执行 / 知识检索', x: 700, y: 310, color: '#10B981',
    read: ['solver 工具调用指令'], write: ['tool_results'] },
  { id: 'gen', label: 'Generator', sub: '邮件生成', x: 400, y: 450, color: '#3B82F6',
    read: ['reply_draft', 'skill_profile', 'detected_language'], write: ['final_reply_draft'] },
  { id: 'rev', label: 'Reviewer', sub: '质量审核', x: 400, y: 580, color: '#EC4899',
    read: ['final_reply_draft', 'skill_profile', 'selected_policy', 'tool_results'], write: ['review_result', 'review_feedback'] },
  { id: 'end', label: 'END', sub: '完成', x: 400, y: 700, color: '#22C55E',
    read: ['final_reply_draft'], write: ['final_reply'] },
]

const SKILL_MODULES = [
  { key: 'rules', label: 'Rules', sub: '合规规则', color: '#EC4899', target: 'Reviewer', impact: '合规性审核' },
  { key: 'style', label: 'ReplyStyle', sub: '语气风格', color: '#3B82F6', target: 'Generator', impact: '邮件语气' },
  { key: 'greet', label: 'Greeting/Closing', sub: '称呼落款', color: '#3B82F6', target: 'Generator', impact: '格式化' },
  { key: 'forbidden', label: 'ForbiddenWords', sub: '禁用词', color: '#EC4899', target: 'Reviewer', impact: '用词审核' },
  { key: 'brand', label: 'BrandInfo', sub: '品牌基础信息', color: '#F59E0B', target: 'Solver', impact: '推理决策' },
]

const BRAND_DATA: Record<string, Record<string, string>> = {
  ohuhu: { Rules: '退款 ≤$50 自动审批', ReplyStyle: '短段落、共情措辞', 'Greeting/Closing': 'Hi there, / Warm regards,', ForbiddenWords: 'cheap, broken', BrandInfo: 'Art supplies brand' },
  tribit: { Rules: '换货前查库存', ReplyStyle: '正式语气、事实先行', 'Greeting/Closing': 'Hello, / Best regards,', ForbiddenWords: 'defective, fault', BrandInfo: 'Audio electronics brand' },
}

const AGENTS = [
  { name: 'Router', icon: GitFork, color: '#8B5CF6', desc: '识别客诉场景，提取关键信息，匹配标准处理流程。', code: 'ROUTER_SYSTEM' },
  { name: 'Solver', icon: Brain, color: '#F59E0B', desc: 'ReAct 推理核心：思考 → 决策 → 工具调用 / 生成回复 / 转人工。', code: 'SOLVER_SYSTEM' },
  { name: 'Generator', icon: Mail, color: '#3B82F6', desc: '将草稿格式化为完整客服邮件，控制称呼、语气与签名。', code: 'REPLY_GENERATOR_SYSTEM' },
  { name: 'Reviewer', icon: ShieldCheck, color: '#EC4899', desc: '审核事实一致性、方案合规性、品牌调性，不合格则打回重写。', code: 'REVIEWER_SYSTEM' },
]

const CONFIG_SECTIONS = [
  { title: '改 Prompt', items: [
    { what: 'Router 意图识别指令', where: 'prompt_templates.py → ROUTER_SYSTEM' },
    { what: 'Solver ReAct 行为原则', where: 'prompt_templates.py → SOLVER_SYSTEM' },
    { what: 'Generator 邮件格式化', where: 'prompt_templates.py → REPLY_GENERATOR_SYSTEM' },
    { what: 'Reviewer 审核维度', where: 'prompt_templates.py → REVIEWER_SYSTEM' },
  ]},
  { title: '改 Skill', items: [
    { what: '品牌语气 / 称呼 / 规则', where: 'skills/ohuhu.md 或 skills/tribit.md' },
    { what: '新增品牌', where: 'skills/{brand}.md（新建文件）' },
    { what: 'Skill 解析逻辑', where: 'skills.py → _parse_markdown()' },
  ]},
  { title: '改流程', items: [
    { what: '路由规则', where: '政策路由.md' },
    { what: '处理步骤', where: '标准流程/*.md（15 个文件）' },
    { what: '新增流程', where: '标准流程/xxx.md + 政策路由.md' },
  ]},
  { title: '改工具', items: [
    { what: '工具名称 / 描述', where: 'tool_registry.py → TOOL_DESCRIPTIONS' },
    { what: '知识库内容', where: 'data/knowledge_base_full.json' },
    { what: '检索算法 / 返回条数', where: 'knowledge_retriever.py → top_k' },
  ]},
]

/* ═══ Architecture Diagram with State R/W cards ═══ */
function ArchitectureDiagram({ activeNode }: { activeNode: string | null }) {
  return (
    <div className="relative w-full max-w-[900px] mx-auto">
      <svg viewBox="0 0 900 760" className="w-full" style={{ filter: 'drop-shadow(0 0 40px rgba(99,102,241,0.12))' }}>
        <defs>
          <marker id="a" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 3.5L0 7z" fill="#475569"/></marker>
          <marker id="aa" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 3.5L0 7z" fill="#F59E0B"/></marker>
          <marker id="ap" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 3.5L0 7z" fill="#EC4899"/></marker>
        </defs>
        {/* Main vertical lines */}
        <line x1="400" y1="82" x2="400" y2="138" stroke="#475569" strokeWidth="2" markerEnd="url(#a)"/>
        <line x1="400" y1="202" x2="400" y2="268" stroke="#475569" strokeWidth="2" markerEnd="url(#a)"/>
        <line x1="400" y1="342" x2="400" y2="408" stroke="#475569" strokeWidth="2" markerEnd="url(#a)"/>
        <line x1="400" y1="482" x2="400" y2="538" stroke="#475569" strokeWidth="2" markerEnd="url(#a)"/>
        <line x1="400" y1="612" x2="400" y2="658" stroke="#475569" strokeWidth="2" markerEnd="url(#a)"/>
        {/* Solver ↔ Tool */}
        <line x1="510" y1="300" x2="620" y2="300" stroke="#F59E0B" strokeWidth="2" strokeDasharray="6 3" markerEnd="url(#aa)"/>
        <line x1="620" y1="325" x2="510" y2="325" stroke="#F59E0B" strokeWidth="2" strokeDasharray="6 3" markerEnd="url(#aa)"/>
        <text x="565" y="290" textAnchor="middle" fill="#F59E0B" fontSize="10" fontWeight="600">ReAct Loop</text>
        {/* Reviewer → Solver feedback */}
        <path d="M290 580Q200 580 200 445Q200 310 290 310" fill="none" stroke="#EC4899" strokeWidth="2" strokeDasharray="6 3" markerEnd="url(#ap)"/>
        <text x="170" y="445" textAnchor="middle" fill="#EC4899" fontSize="10" fontWeight="600" transform="rotate(-90 170 445)">Feedback Loop</text>
        {/* Policy badge */}
        <rect x="560" y="158" width="100" height="28" rx="6" fill="#8B5CF620" stroke="#8B5CF6" strokeWidth="1"/>
        <text x="610" y="176" textAnchor="middle" fill="#8B5CF6" fontSize="10" fontWeight="500">匹配 Policy</text>
        <line x1="510" y1="172" x2="558" y2="172" stroke="#8B5CF6" strokeWidth="1" strokeDasharray="4 2"/>
        {/* Nodes */}
        {ARCH_NODES.map((n) => {
          const lit = activeNode === n.id || activeNode === null
          return (
            <g key={n.id} opacity={lit ? 1 : 0.3} style={{ transition: 'opacity 0.4s' }}>
              <rect x={n.x-95} y={n.y-25} width="190" height="50" rx="10" fill={n.color} opacity="0.08"/>
              <rect x={n.x-91} y={n.y-21} width="182" height="42" rx="8" fill="#1E293B" stroke={n.color} strokeWidth="1.5"/>
              <text x={n.x} y={n.y-3} textAnchor="middle" fill="#F1F5F9" fontSize="13" fontWeight="600">{n.label}</text>
              <text x={n.x} y={n.y+13} textAnchor="middle" fill="#94A3B8" fontSize="9">{n.sub}</text>
            </g>
          )
        })}
      </svg>
      {/* State R/W cards — HTML overlay positioned absolutely */}
      {ARCH_NODES.filter(n => n.id !== 'end').map((n) => {
        const lit = activeNode === n.id || activeNode === null
        // Convert SVG coords to percentage positions
        const topPct = ((n.y - 10) / 760) * 100
        return (
          <div key={n.id} className={cn('absolute flex gap-2 pointer-events-none transition-opacity duration-500', lit ? 'opacity-100' : 'opacity-0')}
            style={{ top: `${topPct}%`, left: n.id === 'tool' ? '82%' : n.x > 500 ? '82%' : '0%', transform: 'translateY(-50%)' }}>
            {n.id !== 'tool' && (
              <div className="rounded-lg border bg-gray-900/90 backdrop-blur-sm px-2 py-1.5 min-w-[120px]" style={{ borderColor: `${n.color}30` }}>
                <div className="text-[8px] font-bold uppercase tracking-wider mb-0.5 text-emerald-400">📖 Read</div>
                {n.read.map((f,i) => <div key={i} className="text-[8px] text-gray-400 font-mono leading-snug">{f}</div>)}
              </div>
            )}
            {n.id !== 'tool' && (
              <div className="rounded-lg border bg-gray-900/90 backdrop-blur-sm px-2 py-1.5 min-w-[120px]" style={{ borderColor: `${n.color}30` }}>
                <div className="text-[8px] font-bold uppercase tracking-wider mb-0.5 text-amber-400">✏️ Write</div>
                {n.write.map((f,i) => <div key={i} className="text-[8px] text-gray-400 font-mono leading-snug">{f}</div>)}
              </div>
            )}
            {n.id === 'tool' && (
              <div className="rounded-lg border bg-gray-900/90 backdrop-blur-sm px-2 py-1.5" style={{ borderColor: `${n.color}30` }}>
                <div className="text-[8px] font-bold uppercase tracking-wider mb-0.5 text-amber-400">✏️ Write</div>
                {n.write.map((f,i) => <div key={i} className="text-[8px] text-gray-400 font-mono leading-snug">{f}</div>)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ═══ Skill Diagram with sub-modules + brand switching ═══ */
function SkillSection() {
  const [brand, setBrand] = useState<'ohuhu' | 'tribit'>('ohuhu')
  const data = BRAND_DATA[brand]
  return (
    <div className="space-y-10">
      {/* Sub-module → Agent diagram */}
      <div className="about-scale-reveal grid md:grid-cols-[240px_1fr] gap-8 items-start max-w-4xl mx-auto">
        {/* Left: Skill sub-modules */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">Skill 子模块</div>
          {SKILL_MODULES.map((m) => (
            <div key={m.key} className="rounded-lg border border-gray-700/50 bg-white/[0.02] px-3 py-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-gray-200">{m.label}</div>
                <div className="text-[10px] text-gray-500">{m.sub}</div>
                <div className="text-[9px] font-mono mt-0.5 transition-all duration-300" style={{ color: m.color }}>{data[m.label] || '—'}</div>
              </div>
              <div className="text-[9px] text-gray-600 shrink-0">→ {m.target}</div>
            </div>
          ))}
        </div>
        {/* Right: Impact visualization */}
        <div className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">影响链路</div>
          {[
            { agent: 'Solver', color: '#F59E0B', impacts: ['BrandInfo → 推理决策约束'] },
            { agent: 'Generator', color: '#3B82F6', impacts: ['ReplyStyle → 邮件语气', 'Greeting/Closing → 格式化'] },
            { agent: 'Reviewer', color: '#EC4899', impacts: ['Rules → 合规性审核', 'ForbiddenWords → 用词审核'] },
          ].map((a) => (
            <div key={a.agent} className="rounded-xl border bg-white/[0.02] p-4" style={{ borderColor: `${a.color}30` }}>
              <div className="text-sm font-bold mb-2" style={{ color: a.color }}>{a.agent}</div>
              {a.impacts.map((imp, i) => (
                <div key={i} className="text-xs text-gray-400 flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full shrink-0" style={{ background: a.color }} />
                  {imp}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* Brand switcher cards */}
      <div className="about-reveal flex justify-center gap-4">
        {(['ohuhu', 'tribit'] as const).map((b) => (
          <button key={b} onClick={() => setBrand(b)}
            className={cn('rounded-xl border px-5 py-3 text-left transition-all min-w-[180px]',
              brand === b ? 'border-amber-500/50 bg-amber-500/5 shadow-lg shadow-amber-500/10' : 'border-gray-700/50 bg-white/[0.02] hover:bg-white/[0.04]')}>
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('w-2 h-2 rounded-full', brand === b ? 'bg-amber-400' : 'bg-gray-600')} />
              <span className="text-sm font-semibold text-white">{b}</span>
            </div>
            <div className="text-[10px] text-gray-500 font-mono">skills/{b}.md</div>
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-gray-500 about-reveal">点击切换品牌，上方子模块内容同步变化 — 零代码换品牌人格</p>
    </div>
  )
}

/* ═══ Module A: Global State Graph ═══ */
function StateGraphSection() {
  const stateFields = [
    { field: 'customer_email', desc: '客户原始邮件内容', rw: 'R', agents: ['Load Context'] },
    { field: 'skill_profile', desc: '品牌人格配置文件', rw: 'RW', agents: ['Load Context', 'Solver', 'Generator', 'Reviewer'] },
    { field: 'basic_info', desc: '邮件提取的结构化基础信息', rw: 'W', agents: ['Router'] },
    { field: 'selected_policy', desc: '匹配的标准处理流程', rw: 'RW', agents: ['Router', 'Solver', 'Reviewer'] },
    { field: 'thought_history', desc: 'Solver 推理思考历史', rw: 'W', agents: ['Solver'] },
    { field: 'tool_results', desc: '工具调用 / 知识库检索返回结果', rw: 'RW', agents: ['Tool Executor', 'Solver', 'Reviewer'] },
    { field: 'draft_reply', desc: 'Solver 生成的回复草稿', rw: 'RW', agents: ['Solver', 'Generator'] },
    { field: 'final_reply', desc: '格式化后的最终邮件', rw: 'W', agents: ['Generator'] },
    { field: 'review_feedback', desc: '审核不通过的反馈意见', rw: 'RW', agents: ['Reviewer', 'Solver'] },
    { field: 'review_passed', desc: '审核是否通过标记', rw: 'W', agents: ['Reviewer'] },
  ]
  return (
    <div className="about-scale-reveal max-w-4xl mx-auto">
      <div className="rounded-2xl border border-gray-700/50 bg-white/[0.02] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-700/50 flex items-center gap-2">
          <Database className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold text-white font-mono">CustomerServiceState</span>
          <span className="text-[10px] text-gray-500 ml-auto">TypedDict + Annotated Reducer</span>
        </div>
        {/* Fields grid */}
        <div className="grid md:grid-cols-2 gap-px bg-gray-800/30">
          {stateFields.map((s) => (
            <div key={s.field} className="px-4 py-3 bg-[#0F172A] hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2 mb-0.5">
                <code className="text-xs font-mono text-cyan-400">{s.field}</code>
                <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold',
                  s.rw === 'RW' ? 'bg-amber-500/15 text-amber-400' : s.rw === 'W' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-500/15 text-gray-400'
                )}>{s.rw}</span>
              </div>
              <div className="text-[10px] text-gray-500 mb-0.5">{s.desc}</div>
              <div className="text-[10px] text-gray-600">{s.agents.join(' · ')}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═══ Module B: Tool & RAG Pipeline ═══ */
function ToolPipelineSection() {
  return (
    <div className="about-scale-reveal max-w-5xl mx-auto space-y-8">
      <div className="grid md:grid-cols-3 gap-4">
        {/* Solver */}
        <div className="rounded-xl border border-amber-500/30 bg-white/[0.02] p-5">
          <div className="flex items-center gap-2 mb-3"><Brain className="w-4 h-4 text-amber-400"/><span className="text-sm font-bold text-white">Solver</span></div>
          <p className="text-xs text-gray-400 leading-relaxed">ReAct 推理引擎：思考 → 决策 → 调用工具 → 整合结果 → 生成回复</p>
        </div>
        {/* Tool Executor */}
        <div className="rounded-xl border border-emerald-500/30 bg-white/[0.02] p-5">
          <div className="flex items-center gap-2 mb-3"><Settings className="w-4 h-4 text-emerald-400"/><span className="text-sm font-bold text-white">Tool Executor</span></div>
          <p className="text-xs text-gray-400 leading-relaxed">接收 Solver 的工具调用指令，分发到对应工具，返回结构化结果</p>
        </div>
        {/* Tool Matrix */}
        <div className="rounded-xl border border-gray-700/50 bg-white/[0.02] p-5">
          <div className="text-sm font-bold text-white mb-3">工具矩阵 (12 个)</div>
          <div className="space-y-2">
            <div>
              <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">内部工具</div>
              <div className="text-[10px] text-gray-400 space-y-0.5">
                <div><Search className="w-3 h-3 inline mr-1 text-cyan-400/60"/>知识库检索 <span className="text-gray-600">(BM25+TF-IDF, 1546 FAQ)</span></div>
                <div>客户记忆 · Skill 加载 · 流程加载</div>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">外部工具</div>
              <div className="text-[10px] text-gray-400 space-y-0.5">
                <div><Globe className="w-3 h-3 inline mr-1 text-amber-400/60"/>TCS API</div>
                <div>订单 · 物流 · 库存 · 售后查询</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Case bubble */}
      <div className="about-reveal rounded-xl border border-gray-700/50 bg-white/[0.02] p-5 max-w-2xl mx-auto">
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">真实案例模拟</div>
        <div className="space-y-2.5">
          {[
            { role: '用户', color: 'text-blue-400', bg: 'bg-blue-500/10', text: '"我的耳机连不上 APP"' },
            { role: 'Solver', color: 'text-amber-400', bg: 'bg-amber-500/10', text: '[思考：需要查知识库确认型号兼容性，查订单获取 SKU]' },
            { role: 'Tool', color: 'text-emerald-400', bg: 'bg-emerald-500/10', text: '[知识库检索 → 旧版 X3 不支持 APP，需升级固件]' },
            { role: 'Solver', color: 'text-amber-400', bg: 'bg-amber-500/10', text: '[整合结果 → 生成包含固件升级步骤的回复草稿]' },
          ].map((msg, i) => (
            <div key={i} className={cn('rounded-lg px-3 py-2 text-xs', msg.bg)}>
              <span className={cn('font-bold mr-2', msg.color)}>{msg.role}:</span>
              <span className="text-gray-300">{msg.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═══ Module C: Zero-Code Config Pipeline ═══ */
function ConfigPipelineSection() {
  const layers = [
    { label: '前端 Settings', color: '#3B82F6', icon: '🖥️', items: ['4 个 Prompt 编辑器', '品牌选择', 'Temperature / 轮次滑块', 'Thinking 开关'] },
    { label: 'FastAPI 接口层', color: '#10B981', icon: '⚡', items: ['POST /api/reply/stream', '写入 state.node_config', '自定义 prompt 覆盖默认模板'] },
    { label: 'LangGraph 执行层', color: '#F59E0B', icon: '🔄', items: ['_get_custom_prompt() 读取配置', '非空 → 完全替换默认模板', '执行 Agent 链路'] },
  ]
  return (
    <div className="about-scale-reveal max-w-2xl mx-auto space-y-4">
      {layers.map((layer, i) => (
        <div key={i}>
          <div className="rounded-xl border bg-white/[0.02] p-5" style={{ borderColor: `${layer.color}30` }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{layer.icon}</span>
              <span className="text-sm font-bold" style={{ color: layer.color }}>{layer.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {layer.items.map((item, j) => (
                <div key={j} className="text-xs text-gray-400 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full shrink-0" style={{ background: layer.color }} />
                  {item}
                </div>
              ))}
            </div>
          </div>
          {i < layers.length - 1 && (
            <div className="flex justify-center py-1">
              <ArrowDown className="w-4 h-4 text-gray-600" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ═══ Module D: Safety Loop ═══ */
function SafetyLoopSection() {
  const checks = [
    { label: '事实一致性', desc: '回复内容与工具返回数据一致', icon: CheckCircle, color: '#10B981' },
    { label: '方案合规性', desc: '处理方案符合标准流程', icon: ShieldCheck, color: '#3B82F6' },
    { label: '品牌调性', desc: '语气、用词符合品牌 Skill', icon: UserCheck, color: '#EC4899' },
  ]
  return (
    <div className="about-scale-reveal max-w-2xl mx-auto space-y-4">
      {/* Generator */}
      <div className="rounded-xl border border-blue-500/30 bg-white/[0.02] p-4 text-center">
        <span className="text-sm font-bold text-blue-400">Generator 生成邮件</span>
      </div>
      <div className="flex justify-center"><ArrowDown className="w-4 h-4 text-gray-600"/></div>
      {/* 3 parallel checks */}
      <div className="grid grid-cols-3 gap-3">
        {checks.map((c) => (
          <div key={c.label} className="rounded-xl border bg-white/[0.02] p-4 text-center" style={{ borderColor: `${c.color}30` }}>
            <c.icon className="w-5 h-5 mx-auto mb-2" style={{ color: c.color }} />
            <div className="text-xs font-bold text-gray-200 mb-1">{c.label}</div>
            <div className="text-[10px] text-gray-500">{c.desc}</div>
          </div>
        ))}
      </div>
      <div className="flex justify-center"><ArrowDown className="w-4 h-4 text-gray-600"/></div>
      {/* Branch results */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
          <div className="text-lg mb-1">✅</div>
          <div className="text-xs font-bold text-emerald-400">全部通过</div>
          <div className="text-[10px] text-gray-500 mt-1">→ END</div>
        </div>
        <div className="rounded-xl border border-pink-500/30 bg-pink-500/5 p-4 text-center">
          <div className="text-lg mb-1">❌</div>
          <div className="text-xs font-bold text-pink-400">任意不通过</div>
          <div className="text-[10px] text-gray-500 mt-1">→ review_feedback → Solver 重写</div>
          <div className="text-[9px] text-pink-400/60 mt-0.5 font-mono">Feedback Loop</div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-center">
          <div className="text-lg mb-1">⚠️</div>
          <div className="text-xs font-bold text-amber-400">超最大轮次</div>
          <div className="text-[10px] text-gray-500 mt-1">→ 人工介入</div>
          <div className="text-[9px] text-amber-400/60 mt-0.5 font-mono">Need Human</div>
        </div>
      </div>
    </div>
  )
}

/* ═══ Navbar ═══ */
const NAV_LINKS = [
  { id: 'architecture', label: '系统架构' },
  { id: 'skills', label: 'Skill 机制' },
  { id: 'agents', label: '核心 Agent' },
  { id: 'state', label: 'State 图谱' },
  { id: 'tools', label: '工具链路' },
  { id: 'pipeline', label: '配置链路' },
  { id: 'safety', label: '审核闭环' },
  { id: 'config', label: '配置指南' },
]

function AboutNavbar({ onNavigate, activeSection }: { onNavigate: (id: string) => void; activeSection: string }) {
  const [scrolled, setScrolled] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = containerRef.current?.closest('.about-dark')
    if (!container) return
    const handler = () => setScrolled(container.scrollTop > 40)
    container.addEventListener('scroll', handler, { passive: true })
    return () => container.removeEventListener('scroll', handler)
  }, [])
  return (
    <nav ref={containerRef} className={cn('sticky top-0 z-40 transition-all duration-300 border-b',
      scrolled ? 'bg-gray-900/80 backdrop-blur-xl border-gray-700/50 shadow-lg shadow-black/20' : 'bg-transparent border-transparent')}>
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
        <span className="font-bold text-base text-white tracking-tight">Smart CS</span>
        <div className="hidden md:flex items-center gap-5">
          {NAV_LINKS.map((item) => (
            <button key={item.id} onClick={() => onNavigate(item.id)}
              className={cn('text-[11px] font-medium transition-colors',
                activeSection === item.id ? 'text-blue-400' : 'text-gray-400 hover:text-white'
              )}>{item.label}</button>
          ))}
        </div>
      </div>
    </nav>
  )
}

/* ═══════════════════════════════════════════════
   Main AboutPage
   ═══════════════════════════════════════════════ */
export function AboutPage() {
  const setActiveView = useStore((s) => s.setActiveView)
  const revealRef = useScrollReveal()
  const [activeArchNode, setActiveArchNode] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState('')
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Sequential node highlight on scroll into view
  const archRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = archRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          const ids = ARCH_NODES.map(n => n.id)
          let i = 0
          const interval = setInterval(() => {
            if (i < ids.length) { setActiveArchNode(ids[i]); i++ }
            else { setActiveArchNode(null); clearInterval(interval) }
          }, 600)
          observer.disconnect()
          return () => clearInterval(interval)
        }
      },
      { threshold: 0.2 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Track active section: whichever section occupies most of the viewport
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const sectionIds = NAV_LINKS.map(l => `about-${l.id}`)

    const handleScroll = () => {
      const vh = container.clientHeight
      const scrollTop = container.scrollTop
      let best = ''
      let bestOverlap = 0

      for (const id of sectionIds) {
        const el = document.getElementById(id)
        if (!el) continue
        const top = el.offsetTop - scrollTop
        const bottom = top + el.offsetHeight
        const visibleTop = Math.max(0, top)
        const visibleBottom = Math.min(vh, bottom)
        const overlap = Math.max(0, visibleBottom - visibleTop)
        if (overlap > bestOverlap) { bestOverlap = overlap; best = id.replace('about-', '') }
      }
      if (best) setActiveSection(best)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(`about-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  /* Section classes:
     - shortSection: content fits in viewport → 100vh centered
     - longSection: content may overflow → min-h-100vh, top-aligned with padding */
  const shortSection = 'min-h-[100vh] flex flex-col justify-center px-6 py-16'
  const longSection = 'min-h-[100vh] px-6 py-20'

  return (
    <div ref={scrollContainerRef} className="about-dark h-full overflow-y-auto bg-[#0F172A] text-gray-100 scroll-smooth">
      <div ref={revealRef}>
        <AboutNavbar onNavigate={scrollTo} activeSection={activeSection} />

        {/* ═══ Hero ═══ */}
        <section id="about-hero" className="relative min-h-[100vh] flex flex-col items-center justify-center px-6 overflow-hidden">
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'linear-gradient(#475569 1px, transparent 1px), linear-gradient(90deg, #475569 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }} />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-500/10 blur-[120px] about-glow" />
          <div className="absolute top-1/2 left-1/3 w-[400px] h-[400px] rounded-full bg-amber-500/8 blur-[100px] about-glow" />
          <div className="relative z-10 text-center max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] text-xs text-gray-400 mb-8">
              <Zap className="w-3 h-3 text-amber-400" /> Powered by LangGraph StateGraph
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-4">
              <span className="about-gradient-text">Smart CS</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-300 font-medium mb-3">基于 LangGraph 的多 Agent 智能客服引擎</p>
            <p className="text-sm text-gray-500 max-w-lg mx-auto mb-10 leading-relaxed">
              将杂乱的邮件，转化为标准化的、可观测的、自动化的智能处理流。<br/>Multi-Agent Customer Service Orchestration
            </p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => scrollTo('architecture')} className="px-6 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-400 transition-all shadow-lg shadow-blue-500/25">开始探索</button>
              <button onClick={() => setActiveView('compose')} className="px-6 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-sm font-medium text-gray-300 hover:bg-white/[0.1] transition-all">返回应用</button>
            </div>
          </div>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 about-float"><ArrowDown className="w-5 h-5 text-gray-600" /></div>
        </section>

        {/* ═══ Architecture with State R/W — LONG content ═══ */}
        <section id="about-architecture" className={longSection} ref={archRef}>
          <div className="max-w-6xl mx-auto w-full">
            <SectionHeading tag="Core Architecture" tagColor="text-blue-400" title="系统架构 · State 状态流转" desc="7 个节点由 LangGraph StateGraph 编排。每个节点的 Read/Write 标注展示了数据在全局 State 中的流转路径。" />
            <div className="about-scale-reveal">
              <ArchitectureDiagram activeNode={activeArchNode} />
            </div>
          </div>
        </section>

        {/* ═══ Skill System — LONG content ═══ */}
        <section id="about-skills" className={cn(longSection, 'bg-white/[0.02]')}>
          <div className="max-w-5xl mx-auto w-full">
            <SectionHeading tag="The Skill System" tagColor="text-amber-400" title="Skill = 系统的灵魂" desc="Brand Personality Injection — 5 个子模块贯穿 Solver / Generator / Reviewer，修改一个 Markdown 文件即可切换品牌人格。" />
            <SkillSection />
          </div>
        </section>

        {/* ═══ Agent Cards — short ═══ */}
        <section id="about-agents" className={shortSection}>
          <div className="max-w-5xl mx-auto w-full">
            <SectionHeading tag="The Agents" tagColor="text-emerald-400" title="四大核心 Agent" desc="每个 Agent 是 LangGraph 图中的一个节点，由 NodeFactory 通过依赖注入创建。" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
              {AGENTS.map((agent, i) => (
                <div key={agent.name} className="about-reveal rounded-xl border border-gray-700/50 bg-white/[0.02] p-5 hover:bg-white/[0.04] hover:border-gray-600/50 transition-all group flex flex-col" style={{ animationDelay: `${i * 100}ms` }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110" style={{ backgroundColor: `${agent.color}15`, border: `1px solid ${agent.color}30` }}>
                    <agent.icon className="w-5 h-5" style={{ color: agent.color }} />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1.5">{agent.name}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed mb-3 flex-1">{agent.desc}</p>
                  <code className="text-[10px] font-mono text-cyan-400/60 bg-white/[0.04] px-2 py-0.5 rounded self-start">{agent.code}</code>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ Module A: Global State Graph — LONG content ═══ */}
        <section id="about-state" className={cn(longSection, 'bg-white/[0.02]')}>
          <div className="max-w-5xl mx-auto w-full">
            <SectionHeading tag="Global State Graph" tagColor="text-indigo-400" title="全局 State 状态图谱" desc="全流程可追溯 — CustomerServiceState 中的每个字段都有明确的读写归属，消除黑盒。" />
            <StateGraphSection />
          </div>
        </section>

        {/* ═══ Module B: Tool & RAG Pipeline — LONG content ═══ */}
        <section id="about-tools" className={longSection}>
          <div className="max-w-5xl mx-auto w-full">
            <SectionHeading tag="Tool & RAG Pipeline" tagColor="text-emerald-400" title="工具调用与知识库检索链路" desc="不幻觉、有依据 — Solver 通过 ReAct 循环按需调用 12 个工具，每个决策都有数据支撑。" />
            <ToolPipelineSection />
          </div>
        </section>

        {/* ═══ Module C: Zero-Code Config — short ═══ */}
        <section id="about-pipeline" className={cn(shortSection, 'bg-white/[0.02]')}>
          <div className="max-w-5xl mx-auto w-full">
            <SectionHeading tag="Zero-Code Config Pipeline" tagColor="text-blue-400" title="前端配置 → 后端生效链路" desc="运营人员在 Settings 页面修改 Prompt / 参数，实时覆盖后端默认模板，零代码上线。" />
            <ConfigPipelineSection />
          </div>
        </section>

        {/* ═══ Module D: Safety Loop — short ═══ */}
        <section id="about-safety" className={shortSection}>
          <div className="max-w-5xl mx-auto w-full">
            <SectionHeading tag="The Safety Loop" tagColor="text-pink-400" title="审核反馈闭环" desc="三重审核 + 自动重写 + 人工兜底 — 确保每封邮件都经过事实、合规、品牌调性的严格检查。" />
            <SafetyLoopSection />
          </div>
        </section>

        {/* ═══ Config Guide — short ═══ */}
        <section id="about-config" className={cn(shortSection, 'bg-white/[0.02]')}>
          <div className="max-w-3xl mx-auto w-full">
            <SectionHeading tag="Config Guide" tagColor="text-cyan-400" title="为可观测性与可定制性而生" desc="Built for Observability & Hackability" />
            <div className="space-y-3 about-reveal">
              {CONFIG_SECTIONS.map((section) => (
                <Accordion key={section.title} title={section.title} items={section.items} />
              ))}
            </div>
          </div>
        </section>

        {/* ═══ Footer ═══ */}
        <footer id="about-footer" className="border-t border-gray-800/50 py-10 px-6">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-xs text-gray-500">Smart CS v4.0 — React 19 + FastAPI + LangGraph StateGraph</div>
            <div className="flex items-center gap-4">
              <button onClick={() => setActiveView('compose')} className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> 返回应用
              </button>
              <span className="text-xs text-gray-600">api/main.py · graph/builder.py</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
