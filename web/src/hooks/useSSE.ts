import { useCallback, useRef } from 'react'
import { useStore, emptyFullState, type ChainNode, type FullState, type ConvMessage } from '@/store/useStore'
import { type ReplyPayload, type ResumePayload, type SSEEvent, type SSETokenEvent, getApiUrl } from '@/lib/api'

const NODE_META: Record<string, { type: string; title: string; sub: string }> = {
  load_context: { type: 'context', title: 'ContextLoader 上下文', sub: '加载客户记忆、品牌技能、语言检测、技能注册表' },
  solver: { type: 'solver', title: 'Solver 推理', sub: 'ReAct 循环：技能选择 → 工具调用 → 决策' },
  tool_executor: { type: 'tool', title: '工具执行', sub: '调用 TCS API / 知识库检索 / 加载技能流程' },
  reply_generator: { type: 'generator', title: 'Generator 生成', sub: '格式化草稿为专业邮件' },
  reviewer: { type: 'reviewer', title: 'Reviewer 审核', sub: '事实准确性、合规性、品牌调性检查' },
  finalize: { type: 'done', title: '完成', sub: '流程结束' },
}

const STREAM_LABELS: Record<string, { thinking: string; content: string }> = {
  solver: { thinking: '思维链 (Thinking)', content: 'LLM 输出' },
  reply_generator: { thinking: '思维链 (Thinking)', content: '邮件生成中...' },
  reviewer: { thinking: '思维链 (Thinking)', content: '审核输出' },
}

function buildBlocks(nodeName: string, event: SSEEvent) {
  const blocks: ChainNode['blocks'] = []

  if (event.trace) {
    for (const t of event.trace) {
      if (t.reasoning) {
        blocks.push({ label: '思维链 (Thinking)', content: t.reasoning, type: 'thought' })
        break
      }
    }
  }

  if (nodeName === 'load_context' && event.basic_info && Object.keys(event.basic_info).length > 0) {
    const rows = Object.entries(event.basic_info)
      .map(([k, v]) => `${k}: ${String(v || '')}`)
      .join('\n')
    blocks.push({ label: '提取信息', content: rows, type: 'info' })
  }

  if (nodeName === 'solver' && event.thought_history) {
    event.thought_history.forEach((th) => {
      if (th.thought) blocks.push({ label: '推理过程', content: th.thought, type: 'thought' })
      if (th.action) {
        // Highlight skill loading actions
        const isSkillLoad = th.action.includes('load_skill')
        blocks.push({ label: isSkillLoad ? '加载技能流程' : '决策', content: th.action, type: 'data' })
      }
    })
  }

  if (nodeName === 'tool_executor' && event.tool_results) {
    Object.entries(event.tool_results).forEach(([name, result]) => {
      blocks.push({ label: `${name} 返回`, content: JSON.stringify(result, null, 2), type: 'data' })
    })
  }

  if (nodeName === 'reviewer') {
    blocks.push({
      label: '审核结果',
      content: event.review_passed ? '审核通过' : '审核未通过',
      type: 'thought',
    })
    if (event.review_feedback) {
      blocks.push({ label: '审核反馈', content: event.review_feedback, type: 'thought' })
    }
  }

  if (nodeName === 'reply_generator' && event.draft_reply) {
    blocks.push({ label: '生成的邮件草稿', content: event.draft_reply, type: 'thought' })
  }

  if (nodeName === 'finalize' && event.final_reply) {
    blocks.push({ label: '最终回复', content: event.final_reply, type: 'thought' })
  }

  return blocks
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

interface StreamingState {
  thinking: string
  content: string
  node: string
}

async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  nodes: ChainNode[],
  fullState: FullState,
  solverCountRef: { current: number },
  setChainNodes: (n: ChainNode[]) => void,
  setFullState: (s: FullState | null) => void,
) {
  const decoder = new TextDecoder()
  let buffer = ''
  let solverCount = solverCountRef.current

  const streaming: StreamingState = { thinking: '', content: '', node: '' }
  let lastTokenFlush = 0

  // CRITICAL FIX: currentEventType must persist across reader.read() chunks.
  // SSE format sends "event: token\r\n" and "data: {...}\r\n" which may arrive
  // in separate chunks. If we reset this per-chunk, the event type is lost.
  let currentEventType = 'message'

  function flushStreamingBlocks() {
    const lastIdx = nodes.length - 1
    if (lastIdx < 0) return
    const current = nodes[lastIdx]
    if (current.status !== 'active') return

    const labels = STREAM_LABELS[streaming.node]
    if (!labels) return

    const streamBlocks: ChainNode['blocks'] = []
    if (streaming.thinking) {
      streamBlocks.push({
        label: labels.thinking,
        content: streaming.thinking,
        type: 'thought',
        streaming: true,
      })
    }
    if (streaming.content) {
      streamBlocks.push({
        label: labels.content,
        content: streaming.content,
        type: 'thought',
        streaming: true,
      })
    }

    if (streamBlocks.length > 0) {
      nodes[lastIdx] = { ...current, blocks: streamBlocks }
      setChainNodes([...nodes])
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '')

      // Empty line = SSE event boundary, reset event type for next event
      if (line === '') {
        currentEventType = 'message'
        continue
      }

      // Parse SSE event type field
      if (line.startsWith('event:')) {
        currentEventType = line.slice(6).trim()
        continue
      }

      if (!line.startsWith('data:')) continue
      const dataStr = line.slice(5).trimStart()

      // ── Handle token events ──
      if (currentEventType === 'token') {
        let tokenEvent: SSETokenEvent
        try {
          tokenEvent = JSON.parse(dataStr)
        } catch {
          continue
        }

        // Reset accumulator if node changed
        if (tokenEvent.node !== streaming.node) {
          streaming.thinking = ''
          streaming.content = ''
          streaming.node = tokenEvent.node
        }

        if (tokenEvent.type === 'thinking') {
          streaming.thinking += tokenEvent.text
        } else {
          streaming.content += tokenEvent.text
        }

        // Throttled UI flush (~30ms for smooth rendering)
        const now = Date.now()
        if (now - lastTokenFlush >= 30) {
          flushStreamingBlocks()
          lastTokenFlush = now
        }
        continue
      }

      // ── Handle node / done / error events ──
      let event: SSEEvent
      try {
        event = JSON.parse(dataStr)
      } catch {
        continue
      }

      const nodeName = event.node
      if (nodeName === '__done__' || nodeName === '__error__') continue

      const meta = NODE_META[nodeName]
      if (!meta) continue

      // Accumulate state
      for (const key of (
        ['selected_policy', 'basic_info', 'retrieved_knowledge',
         'thought_history', 'tool_results', 'draft_reply',
         'review_passed', 'review_feedback', 'final_reply',
         'requires_human', 'human_tasks', 'detected_language',
         'reply_type', 'solver_decision'] as const
      )) {
        if (key in event) {
          (fullState as unknown as Record<string, unknown>)[key] = event[key]
        }
      }
      if (event.trace) {
        fullState.trace_log = [...fullState.trace_log, ...event.trace]
      }

      // Start node — render immediately as active
      if (event.status === 'start') {
        // Flush any remaining streaming content from previous node
        if (streaming.node && (streaming.thinking || streaming.content)) {
          flushStreamingBlocks()
        }

        streaming.thinking = ''
        streaming.content = ''
        streaming.node = nodeName

        if (nodeName === 'solver') solverCount++
        nodes.push({
          id: `${nodeName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: meta.type,
          title: nodeName === 'solver' ? `Solver 推理 #${solverCount}` : meta.title,
          subtitle: meta.sub,
          status: 'active',
          blocks: [],
        })
        setChainNodes([...nodes])
        continue
      }

      // Node done — replace streaming blocks with final blocks
      let sub = meta.sub
      if (nodeName === 'solver' && event.selected_policy) {
        sub = `已加载技能: ${event.selected_policy}`
      } else if (nodeName === 'solver' && event.solver_decision === 'call_tool') {
        const tn = event.thought_history?.[0]?.action?.replace('调用工具: ', '').split('(')[0] || ''
        sub = `决策: 调用工具 ${tn}`
      } else if (nodeName === 'solver' && event.solver_decision) {
        sub = `决策: ${event.solver_decision}`
      } else if (nodeName === 'reviewer' && event.review_passed !== undefined) {
        sub = event.review_passed ? '质量检查通过' : '审核未通过'
      }

      const blocks = buildBlocks(nodeName, event)

      const lastIdx = nodes.length - 1
      if (lastIdx >= 0) {
        let title = nodes[lastIdx].title
        if (nodeName === 'solver') {
          title = `Solver 推理 #${solverCount}`
        }
        nodes[lastIdx] = {
          ...nodes[lastIdx],
          title,
          subtitle: sub,
          status: 'done',
          blocks,
        }
        setChainNodes([...nodes])
      }

      streaming.thinking = ''
      streaming.content = ''
      streaming.node = ''

      if (nodeName === 'solver' && event.solver_decision === 'need_human') {
        solverCountRef.current = solverCount
        return { needHuman: true, event }
      }
    }
  }

  // Final flush
  if (streaming.thinking || streaming.content) {
    flushStreamingBlocks()
  }

  solverCountRef.current = solverCount
  setFullState(fullState)
  return { needHuman: false, event: null }
}

export function useSSE() {
  const {
    setIsProcessing, setChainNodes, setFullState,
    addConvMessage, setConvResolve, clearConvMessages,
    addHistory, settings, customPrompts,
  } = useStore()

  const solverCountRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const processStream = useCallback(
    async (payload: ReplyPayload, existingNodes: ChainNode[] = [], existingState?: FullState) => {
      const fullState: FullState = existingState
        ? { ...existingState, trace_log: [...existingState.trace_log], thought_history: [...existingState.thought_history], tool_results: { ...existingState.tool_results } }
        : emptyFullState()
      const nodes = [...existingNodes]

      const abort = new AbortController()
      abortRef.current = abort

      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
      try {
        const resp = await fetch(`${getApiUrl()}/api/reply/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: abort.signal,
        })

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ detail: resp.statusText }))
          throw new Error(err.detail || err.error || `HTTP ${resp.status}`)
        }
        if (!resp.body) throw new Error('Response body is empty')

        reader = resp.body.getReader()
        const result = await readSSEStream(reader, nodes, fullState, solverCountRef, setChainNodes, setFullState)

        if (result.needHuman) {
          try { reader.cancel() } catch { /* ignore */ }
          reader = null

          const tasks = (result.event?.human_tasks || fullState.human_tasks) as Array<
            string | { task?: string; description?: string; question?: string; options?: string[] }
          >

          const textParts: string[] = []
          const options: { label: string; value: string }[] = []

          for (const t of tasks) {
            if (typeof t === 'string') {
              textParts.push(t)
            } else if (t && typeof t === 'object') {
              const desc = t.description || t.task || t.question || JSON.stringify(t)
              textParts.push(desc)
              if (t.options && Array.isArray(t.options)) {
                for (const opt of t.options) {
                  options.push({ label: String(opt), value: String(opt) })
                }
              }
            }
          }

          const questionMsg: ConvMessage = {
            id: `ai-q-${Date.now()}`,
            role: 'ai',
            text: `我需要您的协助：\n${textParts.map((p) => `• ${p}`).join('\n')}\n\n请在下方选择或输入您的指示。`,
            time: Date.now(),
            options: options.length > 0 ? options : undefined,
            multiSelect: options.length > 0,
            answered: false,
          }
          addConvMessage(questionMsg)

          const humanInput = await new Promise<string | null>((resolve) => {
            setConvResolve(resolve)
          })

          useStore.getState().markConvAnswered(questionMsg.id)

          if (humanInput) {
            addConvMessage({ id: `human-${Date.now()}`, role: 'human', text: humanInput, time: Date.now() })
          }

          nodes.push({
            id: `human-${Date.now()}`,
            type: 'context',
            title: humanInput ? '人工指令已注入' : '跳过人工处理',
            subtitle: humanInput ? '从 Solver 断点续跑' : '根据已有信息直接生成邮件',
            status: 'done',
            blocks: [{ label: humanInput ? '客服指令' : '系统指令', content: humanInput || '跳过', type: 'thought' }],
          })
          setChainNodes([...nodes])

          const resumePayload: ResumePayload = {
            human_input: humanInput || '',
            body: payload.body,
            customer_email: payload.customer_email,
            brand: payload.brand,
            subject: payload.subject,
            old_emails: payload.old_emails,
            basic_info: fullState.basic_info,
            selected_policy: fullState.selected_policy,
            policy_content: fullState.policy_content,
            detected_language: fullState.detected_language,
            retrieved_knowledge: fullState.retrieved_knowledge,
            thought_history: fullState.thought_history as Array<Record<string, unknown>>,
            tool_results: fullState.tool_results,
            llm_temperature: settings.temperature,
            max_react_iterations: settings.maxReactIterations,
            max_reflections: settings.maxReflections,
            node_config: payload.node_config,
          }

          const resumeAbort = new AbortController()
          abortRef.current = resumeAbort

          const resumeResp = await fetch(`${getApiUrl()}/api/reply/resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(resumePayload),
            signal: resumeAbort.signal,
          })

          if (!resumeResp.ok) {
            const err = await resumeResp.json().catch(() => ({ detail: resumeResp.statusText }))
            throw new Error(err.detail || err.error || `HTTP ${resumeResp.status}`)
          }
          if (!resumeResp.body) throw new Error('Resume response body is empty')

          const resumeReader = resumeResp.body.getReader()
          try {
            const resumeResult = await readSSEStream(resumeReader, nodes, fullState, solverCountRef, setChainNodes, setFullState)
            if (!resumeResult.needHuman) {
              setFullState(fullState)
            }
          } finally {
            try { resumeReader.cancel() } catch { /* ignore */ }
          }

          return fullState
        }

        return fullState
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        const errorNode: ChainNode = {
          id: `error-${Date.now()}`,
          type: 'done',
          title: '错误',
          subtitle: getErrorMessage(err),
          status: 'error',
          blocks: [],
        }
        nodes.push(errorNode)
        setChainNodes([...nodes])
        throw err
      } finally {
        if (reader) {
          try { reader.cancel() } catch { /* ignore */ }
        }
      }
    },
    [setChainNodes, setFullState, addConvMessage, setConvResolve, settings, customPrompts]
  )

  const startStream = useCallback(
    async (body: string, oldEmails: string, instructions?: string) => {
      setIsProcessing(true)
      setChainNodes([])
      setFullState(null)
      clearConvMessages()
      solverCountRef.current = 0

      const nodeConfig: Record<string, Record<string, unknown>> = {}
      const thinkingNodes = ['solver', 'reply_generator', 'reviewer']
      thinkingNodes.forEach((node) => {
        nodeConfig[node] = {
          enable_thinking: settings.thinking[node] ?? false,
          thinking_budget: settings.thinkingBudgets?.[node] ?? 600,
        }
      })
      Object.entries(customPrompts).forEach(([key, prompt]) => {
        if (!nodeConfig[key]) nodeConfig[key] = {}
        nodeConfig[key].custom_prompt = prompt
      })

      const payload: ReplyPayload = {
        body,
        old_emails: oldEmails,
        instructions: instructions || '',
        auto_execute: false,
        llm_temperature: settings.temperature,
        max_react_iterations: settings.maxReactIterations,
        max_reflections: settings.maxReflections,
        node_config: nodeConfig,
      }

      try {
        const result = await processStream(payload)
        if (result) {
          addHistory({
            id: Date.now(),
            timestamp: Date.now(),
            body,
            reply: result.final_reply,
            data: result,
          })
        }
        return result
      } finally {
        setIsProcessing(false)
      }
    },
    [processStream, setIsProcessing, setChainNodes, setFullState, addHistory, settings, customPrompts]
  )

  const cancelStream = useCallback(() => {
    abortRef.current?.abort()
    setIsProcessing(false)
  }, [setIsProcessing])

  return { startStream, cancelStream, processStream }
}
