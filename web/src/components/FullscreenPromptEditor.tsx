import { useRef, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, RotateCcw, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { highlightPrompt } from '@/lib/highlightPrompt'

interface FullscreenPromptEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tabLabel: string
  value: string
  onChange: (value: string) => void
  isDefault: boolean
  onSave: () => void
  onReset: () => void
}

export function FullscreenPromptEditor({
  open,
  onOpenChange,
  tabLabel,
  value,
  onChange,
  isDefault,
  onSave,
  onReset,
}: FullscreenPromptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  const syncScroll = useCallback(() => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }, [])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed inset-4 md:inset-8 bg-bg-panel rounded-2xl shadow-xl z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-light">
            <div className="flex items-center gap-3">
              <Dialog.Title className="text-sm font-semibold text-text-primary">
                {tabLabel} 提示词
              </Dialog.Title>
              <span
                className={cn(
                  'text-[11px] px-2.5 py-1 rounded-md font-medium',
                  isDefault
                    ? 'bg-bg-secondary text-text-tertiary'
                    : 'bg-accent-light text-accent-hover'
                )}
              >
                {isDefault ? '只读' : '编辑'}
              </span>
            </div>
            <Dialog.Close asChild>
              <button
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center',
                  'text-text-tertiary hover:text-text-primary hover:bg-bg-hover',
                  'transition-colors'
                )}
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Editor body */}
          <div className="flex-1 min-h-0 p-5">
            <div className={cn(
              'prompt-highlight-container h-full rounded-xl border overflow-hidden',
              'shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
              isDefault
                ? 'border-border-light bg-bg'
                : 'border-accent/30 ring-2 ring-accent/8 bg-bg-panel'
            )}>
              <div
                ref={backdropRef}
                className={cn(
                  'prompt-highlight-backdrop p-5',
                  'font-[Consolas,Monaco,JetBrains_Mono,monospace] text-sm leading-[1.6]',
                  isDefault ? 'text-text-secondary' : 'text-text-primary'
                )}
                dangerouslySetInnerHTML={{ __html: highlightPrompt(value) }}
              />
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onScroll={syncScroll}
                className={cn(
                  'prompt-highlight-textarea absolute inset-0 w-full h-full p-5',
                  'font-[Consolas,Monaco,JetBrains_Mono,monospace] text-sm leading-[1.6]',
                  'focus:outline-none'
                )}
                aria-label={`${tabLabel} 提示词全屏编辑器`}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border-light">
            <span className="text-xs text-text-tertiary font-mono">{value.length} 字符</span>
            <div className="flex items-center gap-2">
              <button
                onClick={onReset}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                  'text-text-secondary border border-border-light',
                  'hover:bg-bg-hover hover:text-accent hover:border-accent/30 hover:shadow-sm',
                  'transition-all'
                )}
              >
                <RotateCcw className="w-3.5 h-3.5" /> 恢复默认
              </button>
              <button
                onClick={onSave}
                disabled={isDefault}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all',
                  isDefault
                    ? 'bg-bg-secondary text-text-tertiary cursor-not-allowed'
                    : 'bg-accent text-text-inverse hover:bg-accent-hover shadow-sm hover:shadow-md'
                )}
              >
                <Save className="w-3.5 h-3.5" /> 保存
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
