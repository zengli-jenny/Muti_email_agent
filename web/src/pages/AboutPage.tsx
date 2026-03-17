import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowDown, Zap, Brain, Mail, ShieldCheck, GitFork, ChevronDown, ExternalLink } from 'lucide-react'
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
      { threshold: 0.15 }
    )
    const targets = el.querySelectorAll('.about-reveal, .about-scale-reveal')
    targets.forEach((t) => observer.observe(t))
    return () => observer.disconnect()
  }, [])
  return ref
}

/* ─── Architecture SVG ─── */
function ArchitectureDiagram() {
  const nodes = [
    { id: 'ctx', label: 'Load Context', sub: '上下文加载', x: 400, y: 40, color: '#6366F1' },
    { id: 'router', label: 'Router', sub: '意图识别与路由', x: 400, y: 140, color: '#8B5CF6' },
    { id: 'solver', label: 'Solver', sub: 'ReAct 推理引擎', x: 400, y: 260, color: '#F59E0B' },
    { id: 'tool', label: 'Tool Executor', sub: '工具执行 / 知识检索', x: 680, y: 260, color: '#10B981' },
    { id: 'gen', label: 'Generator', sub: '邮件生成', x: 400, y: 380, color: '#3B82F6' },
    { id: 'rev', label: 'Reviewer', sub: '质量审核', x: 400, y: 490, color: '#EC4899' },
    { id: 'end', label: 'END', sub: '完成', x: 400, y: 590, color: '#22C55E' },
  ]

  return (
    <svg viewBox="0 0 800 640" className="w-full max-w-[700px] mx-auto" style={{ filter: 'drop-shadow(0 0 40px rgba(99,102,241,0.15))' }}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 3.5 L 0 7 z" fill="#475569" />
        </marker>
        <marker id="arrow-accent" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 3.5 L 0 7 z" fill="#F59E0B" />
        </marker>
        <marker id="arrow-pink" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 3.5 L 0 7 z" fill="#EC4899" />
        </marker>
      </defs>

      {/* Connections */}
      <line x1="400" y1="72" x2="400" y2="118" stroke="#475569" strokeWidth="2" markerEnd="url(#arrow)" />
      <line x1="400" y1="172" x2="400" y2="228" stroke="#475569" strokeWidth="2" markerEnd="url(#arrow)" />
      <line x1="400" y1="292" x2="400" y2="348" stroke="#475569" strokeWidth="2" markerEnd="url(#arrow)" />
      <line x1="400" y1="412" x2="400" y2="458" stroke="#475569" strokeWidth="2" markerEnd="url(#arrow)" />
      <line x1="400" y1="522" x2="400" y2="558" stroke="#475569" strokeWidth="2" markerEnd="url(#arrow)" />

      {/* Solver ↔ Tool (ReAct Loop) */}
      <line x1="500" y1="250" x2="610" y2="250" stroke="#F59E0B" strokeWidth="2" strokeDasharray="6 3" markerEnd="url(#arrow-accent)" />
      <line x1="610" y1="275" x2="500" y2="275" stroke="#F59E0B" strokeWidth="2" strokeDasharray="6 3" markerEnd="url(#arrow-accent)" />
      <text x="555" y="240" textAnchor="middle" fill="#F59E0B" fontSize="10" fontWeight="600">ReAct Loop</text>

      {/* Reviewer → Solver (Feedback Loop) */}
      <path d="M 310 490 Q 220 490 220 375 Q 220 260 310 260" fill="none" stroke="#EC4899" strokeWidth="2" strokeDasharray="6 3" markerEnd="url(#arrow-pink)" />
      <text x="190" y="375" textAnchor="middle" fill="#EC4899" fontSize="10" fontWeight="600" transform="rotate(-90 190 375)">Feedback Loop</text>

      {/* Policy badge near Router */}
      <rect x="560" y="128" width="100" height="28" rx="6" fill="#8B5CF620" stroke="#8B5CF6" strokeWidth="1" />
      <text x="610" y="146" textAnchor="middle" fill="#8B5CF6" fontSize="10" fontWeight="500">匹配 Policy</text>
      <line x1="500" y1="142" x2="558" y2="142" stroke="#8B5CF6" strokeWidth="1" strokeDasharray="4 2" />

      {/* Nodes */}
      {nodes.map((n) => (
        <g key={n.id}>
          {/* Glow */}
          <rect x={n.x - 90} y={n.y - 22} width="180" height="44" rx="10" fill={n.color} opacity="0.08" />
          {/* Card */}
          <rect x={n.x - 86} y={n.y - 18} width="172" height="36" rx="8" fill="#1E293B" stroke={n.color} strokeWidth="1.5" />
          <text x={n.x} y={n.y - 2} textAnchor="middle" fill="#F1F5F9" fontSize="13" fontWeight="600">{n.label}</text>
          <text x={n.x} y={n.y + 12} textAnchor="middle" fill="#94A3B8" fontSize="9">{n.sub}</text>
        </g>
      ))}
    </svg>
  )
}

/* ─── Skill Diagram SVG ─── */
function SkillDiagram() {
  return (
    <svg viewBox="0 0 600 280" className="w-full max-w-[520px] mx-auto">
      {/* Center node */}
      <rect x="40" y="105" width="150" height="50" rx="12" fill="#1E293B" stroke="#F59E0B" strokeWidth="2" />
      <text x="115" y="133" textAnchor="middle" fill="#F59E0B" fontSize="14" fontWeight="700">Skill Profile</text>
      <text x="115" y="148" textAnchor="middle" fill="#94A3B8" fontSize="9">brand.md</text>

      {/* Lines */}
      <line x1="190" y1="118" x2="310" y2="60" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="5 3" />
      <line x1="190" y1="130" x2="310" y2="130" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="5 3" />
      <line x1="190" y1="142" x2="310" y2="210" stroke="#EC4899" strokeWidth="1.5" strokeDasharray="5 3" />

      {/* Target nodes */}
      <rect x="310" y="38" width="240" height="44" rx="10" fill="#1E293B" stroke="#F59E0B" strokeWidth="1.5" />
      <text x="430" y="60" textAnchor="middle" fill="#F1F5F9" fontSize="12" fontWeight="600">Solver 推理决策</text>
      <text x="430" y="74" textAnchor="middle" fill="#94A3B8" fontSize="9">行为原则 · 工具选择 · 方案生成</text>

      <rect x="310" y="108" width="240" height="44" rx="10" fill="#1E293B" stroke="#3B82F6" strokeWidth="1.5" />
      <text x="430" y="130" textAnchor="middle" fill="#F1F5F9" fontSize="12" fontWeight="600">Generator 语气格式</text>
      <text x="430" y="144" textAnchor="middle" fill="#94A3B8" fontSize="9">tone · greeting · closing · 签名</text>

      <rect x="310" y="188" width="240" height="44" rx="10" fill="#1E293B" stroke="#EC4899" strokeWidth="1.5" />
      <text x="430" y="210" textAnchor="middle" fill="#F1F5F9" fontSize="12" fontWeight="600">Reviewer 品牌调性审核</text>
      <text x="430" y="224" textAnchor="middle" fill="#94A3B8" fontSize="9">合规性 · 事实一致性 · 风格检查</text>
    </svg>
  )
}

/* ─── Agent Card ─── */
const AGENTS = [
  {
    name: 'Router',
    icon: GitFork,
    color: '#8B5CF6',
    desc: '识别客诉场景，提取关键信息，匹配标准处理流程。',
    code: 'ROUTER_SYSTEM',
  },
  {
    name: 'Solver',
    icon: Brain,
    color: '#F59E0B',
    desc: 'ReAct 推理核心：思考 → 决策 → 工具调用 / 生成回复 / 转人工。',
    code: 'SOLVER_SYSTEM',
  },
  {
    name: 'Generator',
    icon: Mail,
    color: '#3B82F6',
    desc: '将草稿格式化为完整客服邮件，控制称呼、语气与签名。',
    code: 'REPLY_GENERATOR_SYSTEM',
  },
  {
    name: 'Reviewer',
    icon: ShieldCheck,
    color: '#EC4899',
    desc: '审核事实一致性、方案合规性、品牌调性，不合格则打回重写。',
    code: 'REVIEWER_SYSTEM',
  },
]

/* ─── Config Accordion ─── */
const CONFIG_SECTIONS = [
  {
    title: '改 Prompt',
    items: [
      { what: 'Router 意图识别指令', where: 'prompt_templates.py → ROUTER_SYSTEM' },
      { what: 'Solver ReAct 行为原则', where: 'prompt_templates.py → SOLVER_SYSTEM' },
      { what: 'Generator 邮件格式化', where: 'prompt_templates.py → REPLY_GENERATOR_SYSTEM' },
      { what: 'Reviewer 审核维度', where: 'prompt_templates.py → REVIEWER_SYSTEM' },
    ],
  },
  {
    title: '改 Skill',
    items: [
      { what: '品牌语气 / 称呼 / 规则', where: 'skills/ohuhu.md 或 skills/tribit.md' },
      { what: '新增品牌', where: 'skills/{brand}.md（新建文件）' },
      { what: 'Skill 解析逻辑', where: 'skills.py → _parse_markdown()' },
    ],
  },
  {
    title: '改流程',
    items: [
      { what: '路由规则', where: '政策路由.md' },
      { what: '处理步骤', where: '标准流程/*.md（15 个文件）' },
      { what: '新增流程', where: '标准流程/xxx.md + 政策路由.md' },
    ],
  },
  {
    title: '改工具',
    items: [
      { what: '工具名称 / 描述', where: 'tool_registry.py → TOOL_DESCRIPTIONS' },
      { what: '知识库内容', where: 'data/knowledge_base_full.json' },
      { what: '检索算法 / 返回条数', where: 'knowledge_retriever.py → top_k' },
    ],
  },
]

function Accordion({ title, items }: { title: string; items: { what: string; where: string }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-700/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="text-sm font-semibold text-gray-100">{title}</span>
        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform duration-300', open && 'rotate-180')} />
      </button>
      <div className={cn('overflow-hidden transition-all duration-300', open ? 'max-h-[500px]' : 'max-h-0')}>
        <div className="px-5 pb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700/50">
                <th className="text-left py-2 font-medium">改什么</th>
                <th className="text-left py-2 font-medium">改哪个文件</th>
              </tr>
            </thead>
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

/* ─── Navbar ─── */
function AboutNavbar({ onNavigate }: { onNavigate: (id: string) => void }) {
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
    <nav
      ref={containerRef}
      className={cn(
        'sticky top-0 z-40 transition-all duration-300 border-b',
        scrolled
          ? 'bg-gray-900/80 backdrop-blur-xl border-gray-700/50 shadow-lg shadow-black/20'
          : 'bg-transparent border-transparent'
      )}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
        <span className="font-bold text-base text-white tracking-tight">Smart CS</span>
        <div className="hidden md:flex items-center gap-6">
          {[
            { id: 'architecture', label: '系统架构' },
            { id: 'skills', label: 'Skill 机制' },
            { id: 'agents', label: '核心 Agent' },
            { id: 'config', label: '配置指南' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="text-xs text-gray-400 hover:text-white transition-colors font-medium"
            >
              {item.label}
            </button>
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
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const revealRef = useScrollReveal()

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(`about-${id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div
      ref={scrollContainerRef}
      className="about-dark h-full overflow-y-auto bg-[#0F172A] text-gray-100"
    >
      <div ref={revealRef}>
        <AboutNavbar onNavigate={scrollTo} />

        {/* ═══ 1. Hero Section ═══ */}
        <section className="relative min-h-[85vh] flex flex-col items-center justify-center px-6 overflow-hidden">
          {/* Background grid */}
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'linear-gradient(#475569 1px, transparent 1px), linear-gradient(90deg, #475569 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }} />
          {/* Radial glow */}
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-500/10 blur-[120px] about-glow" />
          <div className="absolute top-1/2 left-1/3 w-[400px] h-[400px] rounded-full bg-amber-500/8 blur-[100px] about-glow" />

          <div className="relative z-10 text-center max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] text-xs text-gray-400 mb-8">
              <Zap className="w-3 h-3 text-amber-400" />
              Powered by LangGraph StateGraph
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-4">
              <span className="about-gradient-text">Smart CS</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-300 font-medium mb-3">
              基于 LangGraph 的多 Agent 智能客服引擎
            </p>
            <p className="text-sm text-gray-500 max-w-lg mx-auto mb-10 leading-relaxed">
              将杂乱的邮件，转化为标准化的、可观测的、自动化的智能处理流。
              <br />
              Multi-Agent Customer Service Orchestration
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => scrollTo('architecture')}
                className="px-6 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-400 transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-400/30"
              >
                开始探索
              </button>
              <button
                onClick={() => setActiveView('compose')}
                className="px-6 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-sm font-medium text-gray-300 hover:bg-white/[0.1] transition-all"
              >
                返回应用
              </button>
            </div>
          </div>

          {/* Scroll hint */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 about-float">
            <ArrowDown className="w-5 h-5 text-gray-600" />
          </div>
        </section>

        {/* ═══ 2. Architecture ═══ */}
        <section id="about-architecture" className="py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16 about-reveal">
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">Core Architecture</p>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">系统架构可视化</h2>
              <p className="text-sm text-gray-400 max-w-lg mx-auto">
                7 个节点，由 LangGraph StateGraph 编排。Solver 通过 ReAct 循环按需调用工具，Reviewer 不合格则带反馈回到 Solver 重写。
              </p>
            </div>
            <div className="about-scale-reveal">
              <ArchitectureDiagram />
            </div>
          </div>
        </section>

        {/* ═══ 3. Skill System ═══ */}
        <section id="about-skills" className="py-24 px-6 bg-white/[0.02]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16 about-reveal">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-widest mb-3">The Skill System</p>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Skill = 系统的灵魂
              </h2>
              <p className="text-sm text-gray-400 max-w-lg mx-auto">
                Brand Personality Injection — 只需修改 <code className="text-cyan-400 bg-white/[0.05] px-1.5 py-0.5 rounded text-xs">skills/brand.md</code>，无需改代码，即可切换品牌人格。
              </p>
            </div>
            <div className="about-scale-reveal">
              <SkillDiagram />
            </div>
            {/* Skill comparison cards */}
            <div className="grid md:grid-cols-2 gap-4 mt-12 about-reveal">
              <div className="rounded-xl border border-gray-700/50 bg-white/[0.02] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-sm font-semibold text-white">ohuhu</span>
                  <span className="text-[10px] text-gray-500 ml-auto font-mono">skills/ohuhu.md</span>
                </div>
                <div className="space-y-1.5 text-xs text-gray-400">
                  <p><span className="text-gray-300">Tone:</span> warm and supportive</p>
                  <p><span className="text-gray-300">Greeting:</span> Hi there,</p>
                  <p><span className="text-gray-300">Style:</span> 短段落、直接给方案、共情措辞</p>
                </div>
              </div>
              <div className="rounded-xl border border-gray-700/50 bg-white/[0.02] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-sm font-semibold text-white">tribit</span>
                  <span className="text-[10px] text-gray-500 ml-auto font-mono">skills/tribit.md</span>
                </div>
                <div className="space-y-1.5 text-xs text-gray-400">
                  <p><span className="text-gray-300">Tone:</span> professional and concise</p>
                  <p><span className="text-gray-300">Greeting:</span> Hello,</p>
                  <p><span className="text-gray-300">Style:</span> 正式语气、事实先行</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ 4. Agent Cards ═══ */}
        <section id="about-agents" className="py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16 about-reveal">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">The Agents</p>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">四大核心 Agent</h2>
              <p className="text-sm text-gray-400 max-w-lg mx-auto">
                每个 Agent 是 LangGraph 图中的一个节点，由 NodeFactory 通过依赖注入创建。
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {AGENTS.map((agent, i) => (
                <div
                  key={agent.name}
                  className="about-reveal rounded-xl border border-gray-700/50 bg-white/[0.02] p-5 hover:bg-white/[0.04] hover:border-gray-600/50 transition-all group"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                    style={{ backgroundColor: `${agent.color}15`, border: `1px solid ${agent.color}30` }}
                  >
                    <agent.icon className="w-5 h-5" style={{ color: agent.color }} />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1.5">{agent.name}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed mb-3">{agent.desc}</p>
                  <code className="text-[10px] font-mono text-cyan-400/60 bg-white/[0.04] px-2 py-0.5 rounded">
                    {agent.code}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ 5. Config Guide ═══ */}
        <section id="about-config" className="py-24 px-6 bg-white/[0.02]">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12 about-reveal">
              <p className="text-xs font-semibold text-cyan-400 uppercase tracking-widest mb-3">Config Guide</p>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                为可观测性与可定制性而生
              </h2>
              <p className="text-sm text-gray-400">
                Built for Observability &amp; Hackability
              </p>
            </div>
            <div className="space-y-3 about-reveal">
              {CONFIG_SECTIONS.map((section) => (
                <Accordion key={section.title} title={section.title} items={section.items} />
              ))}
            </div>
          </div>
        </section>

        {/* ═══ 6. Footer ═══ */}
        <footer className="border-t border-gray-800/50 py-10 px-6">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-xs text-gray-500">
              Smart CS v4.0 — React 19 + FastAPI + LangGraph StateGraph
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setActiveView('compose')}
                className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" /> 返回应用
              </button>
              <span className="text-xs text-gray-600">
                api/main.py · graph/builder.py
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
