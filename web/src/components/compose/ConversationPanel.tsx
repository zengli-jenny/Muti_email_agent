import { useState, useRef, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { getApiUrl, type ReplyPayload } from '@/lib/api'

interface Message {
  id: string
  role: 'ai' | 'human'
  text: string
  time: Date
}

let msgCounter = 0
function nextMsgId() {
  return `msg-${++msgCounter}-${Date.now()}`
}

export function ConversationPanel() {
  const fullState = useStore((s) => s.fullState)
  const settings = useStore((s) => s.settings)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const messagesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Initialize messages when fullState changes
  useEffect(() => {
    if (!fullState?.final_reply) return
    const initial: Message[] = [
      {
        id: nextMsgId(),
        role: 'ai',
        text: '邮件已生成完毕。如果需要修改或有任何问题，请在下方告诉我。',
        time: new Date(),
      },
    ]
    if (fullState.requires_human && fullState.human_tasks?.length > 0) {
      const taskText = fullState.human_tasks
        .map((t: unknown) => {
          if (typeof t === 'string') return t
          if (t && typeof t === 'object' && 'description' in t) return String((t as Record<string, unknown>).description)
          return JSON.stringify(t)
        })
        .join('\n- ')
      initial.push({
        id: nextMsgId(),
        role: 'ai',
        text: `我需要您的协助来处理以下事项：\n- ${taskText}\n\n请提供相关信息或指示。`,
        time: new Date(),
      })
    }
    setMessages(initial)
  }, [fullState?.final_reply])

  useEffect(() => {
    messagesRef.current?.scrollTo(0, messagesRef.current.scrollHeight)
  }, [messages])

  if (!fullState?.final_reply) return null

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return

    const humanMsg: Message = { id: nextMsgId(), role: 'human', text, time: new Date() }
    setMessages((prev) => [...prev, humanMsg])
    setInput('')
    setSending(true)

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    try {
      const payload: ReplyPayload = {
        body: fullState.draft_reply || fullState.final_reply,
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
        useStore.getState().setFullState({ ...fullState, final_reply: newReply })
        setMessages((prev) => [...prev, {
          id: nextMsgId(),
          role: 'ai',
          text: '邮件已根据您的反馈重新生成，请查看上方更新后的邮件内容。',
          time: new Date(),
        }])
      } else {
        setMessages((prev) => [...prev, {
          id: nextMsgId(),
          role: 'ai',
          text: '已收到您的信息。目前暂无新的邮件生成，请补充更多信息。',
          time: new Date(),
        }])
      }
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: nextMsgId(),
        role: 'ai',
        text: `处理时出错：${err instanceof Error ? err.message : String(err)}`,
        time: new Date(),
      }])
    } finally {
      if (reader) {
        try { reader.cancel() } catch { /* ignore */ }
      }
      setSending(false)
    }
  }

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
      <div ref={messagesRef} className="max-h-80 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex items-start gap-2.5', msg.role === 'human' && 'flex-row-reverse')}>
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
              msg.role === 'ai'
                ? 'bg-accent/10 text-accent'
                : 'bg-node-generator/10 text-node-generator'
            )}>
              {msg.role === 'ai' ? 'AI' : '客服'}
            </div>
            <div className={cn('max-w-[80%]', msg.role === 'human' && 'text-right')}>
              <div className={cn(
                'text-sm px-3.5 py-2 rounded-xl whitespace-pre-wrap',
                msg.role === 'ai'
                  ? 'bg-bg-secondary text-text-primary rounded-tl-sm'
                  : 'bg-accent/10 text-text-primary rounded-tr-sm'
              )}>
                {msg.text}
              </div>
              <div className="text-[10px] text-text-tertiary mt-1 px-1">
                {msg.time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <Loader2 className="w-3 h-3 animate-spin" />
            AI 正在思考...
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
          placeholder="输入修改意见或补充信息...（Enter 发送）"
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
