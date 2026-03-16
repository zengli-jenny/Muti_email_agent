import { useState, useEffect, useRef, memo } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChainNode } from '@/store/useStore'

const NODE_COLORS: Record<string, string> = {
  context: 'text-node-context border-node-context/30 bg-node-context/5',
  router: 'text-node-router border-node-router/30 bg-node-router/5',
  retriever: 'text-node-retriever border-node-retriever/30 bg-node-retriever/5',
  solver: 'text-node-solver border-node-solver/30 bg-node-solver/5',
  tool: 'text-node-tool border-node-tool/30 bg-node-tool/5',
  generator: 'text-node-generator border-node-generator/30 bg-node-generator/5',
  reviewer: 'text-node-reviewer border-node-reviewer/30 bg-node-reviewer/5',
  done: 'text-node-done border-node-done/30 bg-node-done/5',
}

const DOT_COLORS: Record<string, string> = {
  context: 'bg-node-context',
  router: 'bg-node-router',
  retriever: 'bg-node-retriever',
  solver: 'bg-node-solver',
  tool: 'bg-node-tool',
  generator: 'bg-node-generator',
  reviewer: 'bg-node-reviewer',
  done: 'bg-node-done',
}

interface ChainStepProps {
  node: ChainNode
}

export const ChainStep = memo(function ChainStep({ node }: ChainStepProps) {
  // Active nodes start expanded; done nodes start collapsed
  const [open, setOpen] = useState(node.status === 'active')
  const hasBlocks = node.blocks.length > 0
  const isActive = node.status === 'active'

  // Auto-expand when node becomes active or gets streaming blocks
  useEffect(() => {
    if (isActive) {
      setOpen(true)
    }
  }, [isActive])

  // Also expand when blocks appear on an active node
  useEffect(() => {
    if (isActive && hasBlocks) {
      setOpen(true)
    }
  }, [isActive, hasBlocks])

  // Allow toggle for: active nodes (always), or done nodes with blocks
  const canToggle = isActive || hasBlocks

  return (
    <div
      className={cn(
        'rounded-xl border transition-all duration-200',
        NODE_COLORS[node.type] || 'border-border bg-bg-panel',
        isActive && 'shadow-sm ring-1 ring-accent/20'
      )}
      style={{ animation: 'fade-in 0.3s ease-out' }}
    >
      {/* Header — always clickable for active nodes */}
      <button
        onClick={() => canToggle && setOpen(!open)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left',
          canToggle && 'cursor-pointer'
        )}
      >
        {/* Dot */}
        <div className="relative shrink-0">
          <div className={cn('w-3 h-3 rounded-full', DOT_COLORS[node.type] || 'bg-border')}>
            {isActive && (
              <span
                className={cn('absolute inset-0 rounded-full', DOT_COLORS[node.type] || 'bg-border')}
                style={{ animation: 'pulse-ring 1.5s ease-out infinite' }}
              />
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-text-primary">{node.title}</div>
          <div className={cn(
            'text-xs text-text-tertiary mt-0.5 truncate',
            isActive && 'animate-shimmer bg-gradient-to-r from-text-tertiary via-text-secondary to-text-tertiary bg-[length:200%_100%] bg-clip-text text-transparent'
          )}>
            {isActive ? '执行中...' : node.subtitle}
          </div>
        </div>

        {/* Status */}
        {isActive ? (
          <span className="flex items-center gap-1.5 text-xs text-accent font-medium shrink-0">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            执行中
          </span>
        ) : (
          <span className="text-xs text-text-tertiary font-medium shrink-0">完成</span>
        )}

        {/* Chevron — show for active (always) or done with blocks */}
        {canToggle && (
          <ChevronRight
            className={cn(
              'w-4 h-4 text-text-tertiary transition-transform duration-200',
              open && 'rotate-90'
            )}
          />
        )}
      </button>

      {/* Body: blocks or streaming placeholder */}
      {open && (
        <div className="px-4 pb-3 space-y-2" style={{ animation: 'fade-in 0.15s ease-out' }}>
          {hasBlocks ? (
            node.blocks.map((block, i) => (
              <BlockItem
                key={`${block.label}-${i}`}
                label={block.label}
                content={block.content}
                type={block.type}
                streaming={block.streaming}
              />
            ))
          ) : isActive ? (
            /* Placeholder while waiting for first token */
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-text-tertiary">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>等待模型响应...</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
})

const BlockItem = memo(function BlockItem({ label, content, type, streaming }: {
  label: string
  content: string
  type: string
  streaming?: boolean
}) {
  // Streaming blocks always open; non-streaming start closed
  const [open, setOpen] = useState(!!streaming)
  const contentRef = useRef<HTMLPreElement>(null)

  // Auto-scroll streaming content to bottom
  useEffect(() => {
    if (streaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [content, streaming])

  // Auto-open when streaming starts
  useEffect(() => {
    if (streaming) setOpen(true)
  }, [streaming])

  return (
    <div className="rounded-lg border border-border-light bg-bg-panel overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-hover transition-colors"
      >
        <div className={cn(
          'w-1.5 h-1.5 rounded-full shrink-0',
          type === 'thought' ? 'bg-accent' : type === 'info' ? 'bg-info' : 'bg-node-tool'
        )} />
        <span className="text-xs font-medium text-text-secondary flex-1">
          {label}
          {streaming && (
            <span className="ml-1.5 text-accent animate-pulse">●</span>
          )}
        </span>
        <ChevronRight className={cn('w-3 h-3 text-text-tertiary transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="px-3 pb-2.5">
          <pre
            ref={contentRef}
            className={cn(
              'text-xs text-text-secondary whitespace-pre-wrap break-words font-mono bg-bg-secondary rounded-md p-2.5 max-h-60 overflow-auto',
            )}
          >
            {content}
            {streaming && <span className="streaming-cursor" />}
          </pre>
        </div>
      )}
    </div>
  )
})
