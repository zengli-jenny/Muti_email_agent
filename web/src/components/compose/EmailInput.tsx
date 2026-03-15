import { useState, useRef, useCallback } from 'react'
import { Send, Loader2, Trash2, ChevronDown, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { useSSE } from '@/hooks/useSSE'

export function EmailInput() {
  const [body, setBody] = useState('')
  const [instructions, setInstructions] = useState('')
  const [oldEmails, setOldEmails] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const isProcessing = useStore((s) => s.isProcessing)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { startStream } = useSSE()

  const handleSubmit = useCallback(async () => {
    if (!body.trim() || isProcessing) return
    await startStream(body.trim(), oldEmails.trim(), instructions.trim())
  }, [body, oldEmails, instructions, isProcessing, startStream])

  const handleClear = () => {
    setBody('')
    setInstructions('')
    setOldEmails('')
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="bg-bg-panel rounded-2xl border border-border shadow-sm">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border-light">
        <h2 className="text-sm font-semibold text-text-primary">客户邮件</h2>
        <p className="text-xs text-text-tertiary mt-0.5">在下方粘贴客户的邮件内容</p>
      </div>

      {/* Body */}
      <div className="p-5 space-y-3">
        {/* Email body textarea */}
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">邮件正文</label>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="粘贴客户邮件内容..."
            rows={8}
            className={cn(
              'w-full rounded-xl border border-border-light bg-bg-secondary/50 px-4 py-3',
              'text-sm text-text-primary placeholder:text-text-tertiary',
              'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
              'resize-y transition-all duration-150'
            )}
          />
        </div>

        {/* Instructions / Requirements */}
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            回复要求（可选）
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="告诉 AI 如何回复，例如：&#10;• 同意退款，提供退货地址&#10;• 语气要温和，表达歉意&#10;• 提供替换产品方案..."
            rows={3}
            className={cn(
              'w-full rounded-xl border border-accent-light bg-accent-bg/30 px-4 py-3',
              'text-sm text-text-primary placeholder:text-text-tertiary',
              'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
              'resize-y transition-all duration-150'
            )}
          />
        </div>

        {/* Advanced options toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showAdvanced && 'rotate-180')} />
          高级选项
        </button>

        {/* Advanced: old emails */}
        {showAdvanced && (
          <div style={{ animation: 'fade-in 0.2s ease-out' }}>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">历史邮件（可选）</label>
            <textarea
              value={oldEmails}
              onChange={(e) => setOldEmails(e.target.value)}
              placeholder="粘贴之前的邮件往来记录..."
              rows={4}
              className={cn(
                'w-full rounded-xl border border-border-light bg-bg-secondary/50 px-4 py-3',
                'text-sm text-text-primary placeholder:text-text-tertiary',
                'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
                'resize-y transition-all duration-150'
              )}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border-light flex items-center justify-between">
        <button
          onClick={handleClear}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
          清空
        </button>

        <button
          onClick={handleSubmit}
          disabled={!body.trim() || isProcessing}
          className={cn(
            'flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200',
            'bg-accent text-text-inverse hover:bg-accent-hover',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'shadow-sm hover:shadow-md active:scale-[0.98]'
          )}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              处理中...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              生成回复
            </>
          )}
        </button>
      </div>
    </div>
  )
}
