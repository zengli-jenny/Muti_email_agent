import { useState, useCallback } from 'react'
import {
  Upload, Play, Trash2, CheckCircle, XCircle, Loader2,
  AlertTriangle, Copy, Plus, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore, type BatchItem } from '@/store/useStore'
import { getApiUrl, type ReplyPayload } from '@/lib/api'

function parseBatchInput(text: string): BatchItem[] {
  // Split by double newlines or --- separators
  const blocks = text.split(/\n---\n|\n\n\n/).filter((b) => b.trim())
  return blocks.map((block, i) => ({
    id: `batch-${Date.now()}-${i}`,
    body: block.trim(),
    instructions: '',
    status: 'pending' as const,
  }))
}

function BatchItemCard({
  item,
  onRemove,
  onUpdateInstructions,
}: {
  item: BatchItem
  onRemove: () => void
  onUpdateInstructions: (v: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (item.reply) {
      navigator.clipboard.writeText(item.reply)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const statusIcons = {
    pending: <div className="w-2 h-2 rounded-full bg-text-tertiary" />,
    processing: <Loader2 className="w-4 h-4 text-accent animate-spin" />,
    done: <CheckCircle className="w-4 h-4 text-success" />,
    error: <XCircle className="w-4 h-4 text-error" />,
  }

  const statusLabels = {
    pending: '等待处理',
    processing: '处理中...',
    done: '已完成',
    error: '处理失败',
  }

  return (
    <div className={cn(
      'bg-bg-panel rounded-xl border p-4 transition-all',
      item.status === 'processing' ? 'border-accent shadow-sm' : 'border-border',
      item.status === 'error' ? 'border-error/30' : '',
    )}>
      <div className="flex items-start gap-3">
        <div className="mt-1 shrink-0">{statusIcons[item.status]}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className={cn(
              'text-xs font-medium',
              item.status === 'processing' ? 'text-accent' : 'text-text-tertiary',
              item.status === 'done' ? 'text-success' : '',
              item.status === 'error' ? 'text-error' : '',
            )}>
              {statusLabels[item.status]}
            </span>
            <div className="flex items-center gap-1">
              {item.reply && (
                <button onClick={handleCopy} className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-secondary">
                  {copied ? <CheckCircle className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
              {item.status === 'pending' && (
                <button onClick={onRemove} className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-error">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <p
            className="text-sm text-text-primary cursor-pointer"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? item.body : (item.body.slice(0, 120) + (item.body.length > 120 ? '...' : ''))}
          </p>

          {item.status === 'pending' && (
            <input
              value={item.instructions}
              onChange={(e) => onUpdateInstructions(e.target.value)}
              placeholder="回复要求（可选）..."
              className="mt-2 w-full rounded-lg border border-border-light bg-bg-secondary/50 px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/20"
            />
          )}

          {item.error && (
            <div className="mt-2 text-xs text-error bg-error/5 rounded-lg px-2.5 py-1.5">
              {item.error}
            </div>
          )}

          {item.reply && (
            <div className="mt-2 text-xs text-text-secondary bg-bg-secondary rounded-lg px-3 py-2 max-h-32 overflow-y-auto whitespace-pre-wrap">
              {item.reply}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function BatchPage() {
  const { batchItems, setBatchItems, updateBatchItem, clearBatch, settings } = useStore()
  const [inputText, setInputText] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  const handleParse = () => {
    if (!inputText.trim()) return
    const items = parseBatchInput(inputText)
    setBatchItems([...batchItems, ...items])
    setInputText('')
  }

  const handleAddSingle = () => {
    setBatchItems([
      ...batchItems,
      {
        id: `batch-${Date.now()}`,
        body: '',
        instructions: '',
        status: 'pending',
      },
    ])
  }

  const handleRemove = (id: string) => {
    setBatchItems(batchItems.filter((b) => b.id !== id))
  }

  const processOne = useCallback(async (item: BatchItem) => {
    updateBatchItem(item.id, { status: 'processing' })

    const payload: ReplyPayload = {
      body: item.body,
      instructions: item.instructions || '',
      auto_execute: false,
      llm_temperature: settings.temperature,
      max_react_iterations: settings.maxReactIterations,
      max_reflections: settings.maxReflections,
    }

    try {
      const resp = await fetch(`${getApiUrl()}/api/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }))
        throw new Error(err.detail || `HTTP ${resp.status}`)
      }

      const result = await resp.json()
      updateBatchItem(item.id, {
        status: 'done',
        reply: result.final_reply || '(未生成回复)',
      })
    } catch (err) {
      updateBatchItem(item.id, {
        status: 'error',
        error: (err as Error).message,
      })
    }
  }, [updateBatchItem, settings])

  const handleRunAll = useCallback(async () => {
    setIsRunning(true)
    const pending = batchItems.filter((b) => b.status === 'pending' && b.body.trim())

    for (const item of pending) {
      await processOne(item)
    }

    setIsRunning(false)
  }, [batchItems, processOne])

  const pendingCount = batchItems.filter((b) => b.status === 'pending' && b.body.trim()).length
  const doneCount = batchItems.filter((b) => b.status === 'done').length
  const errorCount = batchItems.filter((b) => b.status === 'error').length

  const handleCopyAll = () => {
    const replies = batchItems
      .filter((b) => b.reply)
      .map((b, i) => `--- 邮件 ${i + 1} ---\n${b.reply}`)
      .join('\n\n')
    navigator.clipboard.writeText(replies)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6" style={{ animation: 'fade-in 0.3s ease-out' }}>
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">批量处理</h1>
        <p className="text-sm text-text-tertiary mt-1">
          同时处理多封客户邮件，提高工作效率
        </p>
      </div>

      {/* Batch input */}
      <div className="bg-bg-panel rounded-2xl border border-border p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Upload className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-text-primary">批量导入</h3>
        </div>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={"粘贴多封邮件内容，使用 --- 或空行分隔每封邮件：\n\n邮件1内容...\n\n---\n\n邮件2内容...\n\n---\n\n邮件3内容..."}
          rows={6}
          className={cn(
            'w-full rounded-xl border border-border-light bg-bg-secondary/50 px-4 py-3',
            'text-sm text-text-primary placeholder:text-text-tertiary',
            'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
            'resize-y'
          )}
        />
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={handleParse}
            disabled={!inputText.trim()}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              'bg-accent text-text-inverse hover:bg-accent-hover',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <Plus className="w-4 h-4" />
            解析并添加
          </button>
          <button
            onClick={handleAddSingle}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-bg-secondary text-text-secondary hover:bg-bg-hover transition-all"
          >
            <FileText className="w-4 h-4" />
            添加单封
          </button>
        </div>
      </div>

      {/* Queue controls */}
      {batchItems.length > 0 && (
        <div className="flex items-center justify-between bg-bg-panel rounded-xl border border-border px-5 py-3 shadow-sm">
          <div className="flex items-center gap-4 text-xs text-text-tertiary">
            <span>队列: <strong className="text-text-primary">{batchItems.length}</strong></span>
            <span>待处理: <strong className="text-text-primary">{pendingCount}</strong></span>
            <span>完成: <strong className="text-success">{doneCount}</strong></span>
            {errorCount > 0 && (
              <span>失败: <strong className="text-error">{errorCount}</strong></span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {doneCount > 0 && (
              <button
                onClick={handleCopyAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:bg-bg-hover transition-all"
              >
                <Copy className="w-3.5 h-3.5" />
                复制全部结果
              </button>
            )}
            <button
              onClick={clearBatch}
              disabled={isRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-tertiary hover:text-error hover:bg-bg-hover transition-all disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清空
            </button>
            <button
              onClick={handleRunAll}
              disabled={isRunning || pendingCount === 0}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                'bg-accent text-text-inverse hover:bg-accent-hover shadow-sm',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  处理中...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  开始处理 ({pendingCount})
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Batch items */}
      {batchItems.length > 0 ? (
        <div className="space-y-3">
          {batchItems.map((item) => (
            <BatchItemCard
              key={item.id}
              item={item}
              onRemove={() => handleRemove(item.id)}
              onUpdateInstructions={(v) => updateBatchItem(item.id, { instructions: v })}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Upload className="w-12 h-12 text-text-tertiary/30 mx-auto mb-3" />
          <p className="text-sm text-text-tertiary mb-1">暂无待处理邮件</p>
          <p className="text-xs text-text-tertiary">
            在上方粘贴多封邮件内容或逐一添加
          </p>
        </div>
      )}

      {/* Tips */}
      <div className="bg-accent-bg/50 rounded-xl border border-accent-light p-4 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-accent mt-0.5 shrink-0" />
        <div className="text-xs text-text-secondary">
          <strong className="text-text-primary">注意：</strong>
          批量处理使用非流式 API，不支持人工介入。每封邮件将独立处理，
          处理时间取决于邮件复杂度和 LLM 响应速度。建议每批不超过 20 封邮件。
        </div>
      </div>
    </div>
  )
}
