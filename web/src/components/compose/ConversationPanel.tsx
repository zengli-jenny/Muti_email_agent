import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, Check, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { getApiUrl, type ReplyPayload } from '@/lib/api'

/**
 * Inline conversation panel — replaces the old modal dialog.
 *
 * AI questions (including FAQ options) appear as chat bubbles.
 * The user answers via multi-select buttons or free-text input.
 * All history is preserved so the user can review the full dialog.
 */
export function ConversationPanel() {
  const fullState = useStore((s) => s.fullState)
  const isProcessing = useStore((s) => s.isProcessing)
  const settings = useStore((s) => s.settings)
  const convMessages = useStore((s) => s.convMessages)
  const addConvMessage = useStore((s) => s.addConvMessage)
  const convResolve = useStore((s) => s.convResolve)
  const setConvResolve = useStore((s) => s.setConvResolve)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set())
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customText, setCustomText] = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    messagesRef.current?.scrollTo(0, messagesRef.current.scrollHeight)
  }, [convMessages])

  // Add welcome message when final_reply first appears
  const welcomeAddedRef = useRef(false)
  useEffect(() => {
    if (!fullState?.final_reply) {
      welcomeAddedRef.current = false
      return
    }
    if (welcomeAddedRef.current) return
    welcomeAddedRef.current = true

    addConvMessage({
      id: `welcome-${Date.now()}`,
      role: 'ai',
      text: '邮件已生成完毕。如果需要修改或有任何问题，请在下方告诉我。',
      time: Date.now(),
    })
  }, [fullState?.final_reply, addConvMessage])

  // The currently pending AI question (last unanswered AI message with options or awaiting convResolve)
  const pendingQuestion = convMessages.findLast(
    (m) => m.role === 'ai' && m.answered === false && convResolve !== null
  )

  // ── Option toggle (multi-select) ──
  const toggleOption = useCallback((value: string) => {
    setSelectedOptions((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }, [])

  // ── Submit selected options + custom text ──
  const submitOptions = useCallback(() => {
    const parts: string[] = [...selectedOptions]
    if (customText.trim()) parts.push(customText.trim())
    if (parts.length === 0) return

    const answer = parts.join('；')
    setSelectedOptions(new Set())
    setCustomText('')
    setShowCustomInput(false)

    // Resolve the pending promise in useSSE
    if (convResolve) {
      const resolve = convResolve
      setConvResolve(null)
      resolve(answer)
    }
  }, [selectedOptions, customText, convResolve, setConvResolve])

  // ── Skip (no answer) ──
  const handleSkip = useCallback(() => {
    setSelectedOptions(new Set())
    setCustomText('')
    setShowCustomInput(false)

    if (convResolve) {
      const resolve = convResolve
      setConvResolve(null)
      resolve(null)
    }
  }, [convResolve, setConvResolve])

  // ── Free-text send (post-generation conversation) ──
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    // If there's a pending AI question, resolve it with the text input
    if (convResolve) {
      const resolve = convResolve
      setConvResolve(null)
      setInput('')
      resolve(text)
      return
    }

    // Otherwise, it's a post-generation follow-up conversation
    addConvMessage({ id: `human-${Date.now()}`, role: 'human', text, time: Date.now() })
    setInput('')
    setSending(true)

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    try {
      const payload: ReplyPayload = {
        body: fullState?.draft_reply || fullState?.final_reply || '',
        old_emails: `[人工客服指令]: ${text}`,
        llm_temperature: settings.temperature,
        max_react_iterations: settings.maxReactIterations,
        max_reflections: settings.maxReflections,
      }

      const resp = await fetch(`${getApiUrl()}/api/reply/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      if (!resp.body) throw new Error('Response body is empty')

      reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let newReply = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.final_reply) newReply = event.final_reply
          } catch { /* skip */ }
        }
      }

      if (newReply) {
        useStore.getState().setFullState({ ...fullState!, final_reply: newReply })
        addConvMessage({
          id: `ai-${Date.now()}`,
          role: 'ai',
          text: '邮件已根据您的反馈重新生成，请查看上方更新后的邮件内容。',
          time: Date.now(),
        })
      } else {
        addConvMessage({
          id: `ai-${Date.now()}`,
          role: 'ai',
          text: '已收到您的信息。目前暂无新的邮件生成，请补充更多信息。',
          time: Date.now(),
        })
      }
    } catch (err) {
      addConvMessage({
        id: `ai-err-${Date.now()}`,
        role: 'ai',
        text: `处理时出错：${err instanceof Error ? err.message : String(err)}`,
        time: Date.now(),
      })
    } finally {
      if (reader) {
        try { reader.cancel() } catch { /* ignore */ }
      }
      setSending(false)
    }
  }, [input, sending, convResolve, setConvResolve, fullState, settings, addConvMessage])

  // Don't render until there's something to show
  const hasContent = convMessages.length > 0 || fullState?.final_reply
  if (!hasContent) return null

  return (
    <div className="bg-bg-panel rounded-2xl border border-border shadow-sm" style={{ animation: 'fade-in 0.4s ease-out' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border-light">
        <svg className="w-4 h-4 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
        </svg>
        <span className="text-sm font-semibold text-text-primary">对话协作</span>
        <span className="text-xs text-text-tertiary">人工客服 ↔ AI 助手</span>
      </div>

      {/* Messages */}
      <div ref={messagesRef} className="max-h-96 overflow-y-auto p-4 space-y-3">
        {convMessages.map((msg) => (
          <div key={msg.id}>
            {/* Message bubble */}
            <div className={cn('flex items-start gap-2.5', msg.role === 'human' && 'flex-row-reverse')}>
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                msg.role === 'ai'
                  ? 'bg-accent/10 text-accent'
                  : 'bg-node-generator/10 text-node-generator'
              )}>
                {msg.role === 'ai' ? 'AI' : '客服'}
              </div>
              <div className={cn('max-w-[85%]', msg.role === 'human' && 'text-right')}>
                <div className={cn(
                  'text-sm px-3.5 py-2.5 rounded-xl whitespace-pre-wrap',
                  msg.role === 'ai'
                    ? 'bg-bg-secondary text-text-primary rounded-tl-sm'
                    : 'bg-accent/10 text-text-primary rounded-tr-sm'
                )}>
                  {msg.text}
                </div>
                <div className="text-[10px] text-text-tertiary mt-1 px-1">
                  {new Date(msg.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            {/* FAQ option buttons — only for unanswered AI questions */}
            {msg.role === 'ai' && msg.options && !msg.answered && convResolve && msg.id === pendingQuestion?.id && (
              <OptionButtons
                options={msg.options}
                multiSelect={msg.multiSelect ?? false}
                selectedOptions={selectedOptions}
                toggleOption={toggleOption}
                showCustomInput={showCustomInput}
                setShowCustomInput={setShowCustomInput}
                customText={customText}
                setCustomText={setCustomText}
                onSubmit={submitOptions}
                onSkip={handleSkip}
              />
            )}

            {/* For AI questions without predefined options — show skip button */}
            {msg.role === 'ai' && !msg.options && !msg.answered && convResolve && msg.id === pendingQuestion?.id && (
              <div className="ml-9 mt-2">
                <button
                  onClick={handleSkip}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-tertiary border border-border-light hover:bg-bg-hover transition-all"
                >
                  <SkipForward className="w-3 h-3" />
                  跳过（AI 自行处理）
                </button>
              </div>
            )}
          </div>
        ))}

        {(sending || (isProcessing && convResolve)) && (
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <Loader2 className="w-3 h-3 animate-spin" />
            {convResolve ? '等待您的回复...' : 'AI 正在思考...'}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 px-4 py-3 border-t border-border-light">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={convResolve ? '输入您的指示...（Enter 发送）' : '输入修改意见或补充信息...（Enter 发送）'}
          rows={1}
          className={cn(
            'flex-1 rounded-xl border border-border-light bg-bg-secondary/50 px-3 py-2',
            'text-sm text-text-primary placeholder:text-text-tertiary',
            'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
            'resize-none transition-all'
          )}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className={cn(
            'p-2 rounded-xl transition-all',
            input.trim() && !sending
              ? 'bg-accent text-text-inverse hover:bg-accent-hover'
              : 'bg-bg-hover text-text-tertiary cursor-not-allowed'
          )}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── FAQ Option Buttons Component ──

interface OptionButtonsProps {
  options: { label: string; value: string }[]
  multiSelect: boolean
  selectedOptions: Set<string>
  toggleOption: (value: string) => void
  showCustomInput: boolean
  setShowCustomInput: (v: boolean) => void
  customText: string
  setCustomText: (v: string) => void
  onSubmit: () => void
  onSkip: () => void
}

function OptionButtons({
  options, multiSelect, selectedOptions, toggleOption,
  showCustomInput, setShowCustomInput, customText, setCustomText,
  onSubmit, onSkip,
}: OptionButtonsProps) {
  const hasSelection = selectedOptions.size > 0 || customText.trim().length > 0

  return (
    <div className="ml-9 mt-2 space-y-2" style={{ animation: 'fade-in 0.3s ease-out' }}>
      {/* Option chips */}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isSelected = selectedOptions.has(opt.value)
          return (
            <button
              key={opt.value}
              onClick={() => toggleOption(opt.value)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150',
                'border',
                isSelected
                  ? 'bg-accent/15 border-accent text-accent shadow-sm'
                  : 'bg-bg-secondary/60 border-border-light text-text-secondary hover:border-accent/40 hover:bg-accent/5'
              )}
            >
              {multiSelect && (
                <span className={cn(
                  'w-3.5 h-3.5 rounded border flex items-center justify-center transition-all',
                  isSelected
                    ? 'bg-accent border-accent'
                    : 'border-border-light'
                )}>
                  {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </span>
              )}
              {opt.label}
            </button>
          )
        })}

        {/* "Other" toggle button */}
        <button
          onClick={() => setShowCustomInput(!showCustomInput)}
          className={cn(
            'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150',
            'border border-dashed',
            showCustomInput
              ? 'border-accent text-accent bg-accent/5'
              : 'border-border-light text-text-tertiary hover:border-accent/40 hover:text-text-secondary'
          )}
        >
          其他...
        </button>
      </div>

      {/* Custom text input */}
      {showCustomInput && (
        <div style={{ animation: 'fade-in 0.2s ease-out' }}>
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="输入自定义内容..."
            rows={2}
            className={cn(
              'w-full rounded-xl border border-border-light bg-bg-secondary/50 px-3 py-2',
              'text-xs text-text-primary placeholder:text-text-tertiary',
              'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
              'resize-none transition-all'
            )}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onSubmit}
          disabled={!hasSelection}
          className={cn(
            'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all',
            hasSelection
              ? 'bg-accent text-text-inverse hover:bg-accent-hover shadow-sm'
              : 'bg-bg-hover text-text-tertiary cursor-not-allowed'
          )}
        >
          <Check className="w-3 h-3" />
          确认提交
          {selectedOptions.size > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">
              {selectedOptions.size + (customText.trim() ? 1 : 0)}
            </span>
          )}
        </button>
        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-tertiary border border-border-light hover:bg-bg-hover transition-all"
        >
          <SkipForward className="w-3 h-3" />
          跳过
        </button>
      </div>
    </div>
  )
}
