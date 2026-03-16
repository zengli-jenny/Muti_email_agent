import { Mail } from 'lucide-react'
import { EmailInput } from '@/components/compose/EmailInput'
import { ChainTimeline } from '@/components/compose/ChainTimeline'
import { FinalReplyCard } from '@/components/compose/FinalReplyCard'
import { ConversationPanel } from '@/components/compose/ConversationPanel'
import { useStore } from '@/store/useStore'

export function ComposePage() {
  const chainNodes = useStore((s) => s.chainNodes)
  const fullState = useStore((s) => s.fullState)
  const convMessages = useStore((s) => s.convMessages)

  const showEmpty = chainNodes.length === 0 && !fullState && convMessages.length === 0

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* Left: Email Input */}
      <div className="md:w-[45%] md:min-w-[380px] md:max-w-[560px] border-b md:border-b-0 md:border-r border-border-light overflow-y-auto p-4 md:p-5 flex flex-col">
        <EmailInput />
      </div>

      {/* Right: Results */}
      <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
        {showEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
              <Mail className="w-7 h-7 text-accent" strokeWidth={1.5} />
            </div>
            <h3 className="text-base font-semibold text-text-primary mb-1.5">准备生成回复</h3>
            <p className="text-sm text-text-tertiary max-w-xs leading-relaxed">
              在左侧粘贴客户邮件内容，点击"生成回复"启动 AI 多节点处理链。
            </p>
            <div className="flex items-center gap-2 mt-4 text-xs text-text-tertiary">
              <kbd className="px-1.5 py-0.5 rounded border border-border-light bg-bg-secondary font-mono text-[10px]">Ctrl</kbd>
              <span>+</span>
              <kbd className="px-1.5 py-0.5 rounded border border-border-light bg-bg-secondary font-mono text-[10px]">Enter</kbd>
              <span>快速提交</span>
            </div>
          </div>
        ) : (
          <>
            <ChainTimeline />
            <FinalReplyCard />
            <ConversationPanel />
          </>
        )}
      </div>
    </div>
  )
}
