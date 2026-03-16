import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Loader2, Trash2, ChevronDown, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { useSSE } from '@/hooks/useSSE'

export function EmailInput() {
  // Use store-backed draft state so content survives page switches
  const draftBody = useStore((s) => s.draftBody)
  const setDraftBody = useStore((s) => s.setDraftBody)
  const draftInstructions = useStore((s) => s.draftInstructions)
  const setDraftInstructions = useStore((s) => s.setDraftInstructions)

  const [showAdvanced, setShowAdvanced] = useState(false)
  const isProcessing = useStore((s) => s.isProcessing)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { startStream } = useSSE()

  // Pick up template pre-fill from TemplatesPage
  useEffect(() => {
    const tBody = sessionStorage.getItem('template-body')
    const tInstr = sessionStorage.getItem('template-instructions')
    if (tBody) {
      setDraftBody(tBody)
      sessionStorage.removeItem('template-body')
    }
    if (tInstr) {
      setDraftInstructions(tInstr)
      sessionStorage.removeItem('template-instructions')
    }
  }, [setDraftBody, setDraftInstructions])

  const handleSubmit = useCallback(async () => {
    if (!draftBody.trim() || isProcessing) return
    await startStream(draftBody.trim(), '', draftInstructions.trim())
  }, [draftBody, draftInstructions, isProcessing, startStream])

  const handleClear = () => {
    setDraftBody('')
    setDraftInstructions('')
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="bg-bg-panel rounded-2xl border border-border shadow-sm flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border-light shrink-0">
        <h2 className="text-sm font-semibold text-text-primary">邮件会话</h2>
        <p className="text-xs text-text-tertiary mt-0.5">粘贴完整的邮件往来记录，包含所有收发邮件</p>
      </div>

      {/* Body */}
      <div className="p-5 space-y-3 flex-1 flex flex-col min-h-0">
        {/* Main email context textarea */}
        <div className="flex-1 flex flex-col min-h-0">
          <textarea
            ref={textareaRef}
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={"粘贴完整邮件会话...\n\n示例格式：\n# 当前会话\n1. 邮件ID:123456\n类型：客户来信邮件\n发件人：customer@example.com\n收件人：support@brand.com\n发送时间：2026-03-10 10:00:00\n主题：...\n正文：\n\"\"\"\n...\n\"\"\""}
            rows={14}
            className={cn(
              'w-full flex-1 rounded-xl border border-border-light bg-bg-secondary/50 px-4 py-3',
              'text-sm text-text-primary placeholder:text-text-tertiary',
              'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
              'resize-y transition-all duration-150 font-mono text-[13px] leading-relaxed'
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

        {/* Advanced options */}
        {showAdvanced && (
          <div className="space-y-3" style={{ animation: 'fade-in 0.2s ease-out' }}>
            {/* Instructions / Requirements */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                回复要求（可选）
              </label>
              <textarea
                value={draftInstructions}
                onChange={(e) => setDraftInstructions(e.target.value)}
                placeholder={"告诉 AI 如何回复，例如：\n• 同意退款，提供退货地址\n• 语气要温和，表达歉意\n• 提供替换产品方案..."}
                rows={5}
                className={cn(
                  'w-full rounded-xl border border-accent-light bg-accent-bg/30 px-4 py-3',
                  'text-sm text-text-primary placeholder:text-text-tertiary',
                  'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
                  'resize-y transition-all duration-150'
                )}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border-light flex items-center justify-between shrink-0">
        <button
          onClick={handleClear}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
          清空
        </button>

        <button
          onClick={handleSubmit}
          disabled={!draftBody.trim() || isProcessing}
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
