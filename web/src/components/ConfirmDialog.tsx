import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className="w-full max-w-sm mx-4 bg-bg-panel rounded-2xl shadow-xl border border-border p-6"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'fade-in 0.15s ease-out' }}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            variant === 'danger' ? 'bg-error/10' : 'bg-warning/10'
          )}>
            <AlertTriangle className={cn('w-5 h-5', variant === 'danger' ? 'text-error' : 'text-warning')} />
          </div>
          <div>
            <h3 id="confirm-title" className="text-sm font-semibold text-text-primary">{title}</h3>
            <p className="text-xs text-text-tertiary mt-1">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium text-text-secondary border border-border-light hover:bg-bg-hover transition-all"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-medium transition-all',
              variant === 'danger'
                ? 'bg-error text-white hover:bg-error/90'
                : 'bg-accent text-text-inverse hover:bg-accent-hover'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
