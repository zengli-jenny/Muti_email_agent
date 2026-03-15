import { useState } from 'react'
import { Copy, Check, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'

export function FinalReplyCard() {
  const fullState = useStore((s) => s.fullState)
  const [copied, setCopied] = useState(false)
  const [approved, setApproved] = useState(false)

  if (!fullState?.final_reply) return null

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullState.final_reply)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleApprove = () => {
    setApproved(true)
  }

  return (
    <div className="bg-bg-panel rounded-2xl border border-border shadow-sm" style={{ animation: 'fade-in 0.4s ease-out' }}>
      {/* Header */}
      <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary">最终生成邮件</span>
        <div className="flex items-center gap-2">
          {fullState.selected_policy && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-node-router/10 text-node-router font-medium">
              {fullState.selected_policy}
            </span>
          )}
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-bg-secondary text-text-secondary font-medium uppercase">
            {fullState.detected_language || 'en'}
          </span>
          <span className={cn(
            'text-[11px] px-2 py-0.5 rounded-full font-medium',
            fullState.review_passed
              ? 'bg-success/10 text-success'
              : 'bg-error/10 text-error'
          )}>
            {fullState.review_passed ? '审核通过' : '审核未通过'}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        <pre className="text-sm text-text-primary whitespace-pre-wrap font-sans leading-relaxed">
          {fullState.final_reply}
        </pre>
      </div>

      {/* Actions */}
      <div className="px-5 py-3 border-t border-border-light flex items-center gap-2 justify-end">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:bg-bg-hover transition-all border border-border-light"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? '已复制' : '复制邮件'}
        </button>
        <button
          onClick={handleApprove}
          disabled={approved}
          className={cn(
            'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all',
            approved
              ? 'bg-success/10 text-success cursor-default'
              : 'bg-accent text-text-inverse hover:bg-accent-hover'
          )}
        >
          {approved ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          {approved ? '已确认' : '确认发送'}
        </button>
      </div>
    </div>
  )
}
