import { useCallback, useRef } from 'react'
import { useStore, emptyFullState, type ChainNode, type FullState } from '@/store/useStore'
import { type ReplyPayload, type SSEEvent, getApiUrl } from '@/lib/api'

const NODE_META: Record<string, { type: string; title: string; sub: string }> = {
  load_context: { type: 'context', title: 'ContextLoader 上下文', sub: '加载客户记忆、品牌技能、语言检测' },
  router: { type: 'router', title: 'Router 路由', sub: '分析邮件意图，匹配标准流程' },
  retriever: { type: 'retriever', title: 'Retriever 检索', sub: '搜索知识库，匹配相关 FAQ' },
  solver: { type: 'solver', title: 'Solver 推理', sub: 'ReAct 循环：思考 → 决策 → 工具调用' },
  tool_executor: { type: 'tool', title: '工具执行', sub: '调用 TCS API 查询业务数据' },
  reply_generator: { type: 'generator', title: 'Generator 生成', sub: '格式化草稿为专业邮件' },
  reviewer: { type: 'reviewer', title: 'Reviewer 审核', sub: '事实准确性、合规性、品牌调性检查' },
  finalize: { type: 'done', title: '完成', sub: '流程结束' },
}

function buildBlocks(nodeName: string, event: SSEEvent) {
  const blocks: ChainNode['blocks'] = []

  // Reasoning
  if (event.trace) {
    for (const t of event.trace) {
      if (t.reasoning) {
        blocks.push({ label: '思维链 (Thinking)', content: t.reasoning, type: 'thought' })
        break
      }
    }
  }

  if (nodeName === 'router' && event.basic_info && Object.keys(event.basic_info).length > 0) {
    const rows = Object.entries(event.basic_info)
      .map(([k, v]) => `${k}: ${String(v || '')}`)
      .join('\n')
    blocks.push({ label: '提取信息', content: rows, type: 'info' })
  }

  if (nodeName === 'retriever' && event.retrieved_knowledge) {
    blocks.push({ label: '知识库结果', content: event.retrieved_knowledge, type: 'data' })
  }

  if (nodeName === 'solver' && event.thought_history) {
    event.thought_history.forEach((th) => {
      if (th.thought) blocks.push({ label: '推理过程', content: th.thought, type: 'thought' })
      if (th.action) blocks.push({ label: '决策', content: th.action, type: 'data' })
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

export function useSSE() {
  const {
    setIsProcessing, setChainNodes, setFullState,
    openHumanDialog, setHumanDialogResolve,
    addHistory, settings, customPrompts,
  } = useStore()

  const solverCountRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const processStream = useCallback(
    async (payload: ReplyPayload, existingNodes: ChainNode[] = [], existingState?: FullState) => {
      const fullState = existingState || emptyFullState()
      const nodes = [...existingNodes]
      let solverCount = solverCountRef.current

      const abort = new AbortController()
      abortRef.current = abort

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

        const reader = resp.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            let event: SSEEvent
            try {
              event = JSON.parse(line.slice(6))
            } catch {
              continue
            }

            const nodeName = event.node
            if (nodeName === '__done__' || nodeName === '__error__') continue

            const status = event.status || 'done'
            const meta = NODE_META[nodeName] || { type: nodeName, title: nodeName, sub: '' }

            if (status === 'start') {
              let title = meta.title
              if (nodeName === 'solver') {
                solverCount++
                title = `Solver 推理 #${solverCount}`
              }

              const newNode: ChainNode = {
                id: `${nodeName}-${Date.now()}`,
                type: meta.type,
                title,
                subtitle: meta.sub,
                status: 'active',
                blocks: [],
              }
              nodes.push(newNode)
              setChainNodes([...nodes])
              continue
            }

            // Merge into fullState
            if (event.trace) fullState.trace_log.push(...event.trace)
            if (event.thought_history) fullState.thought_history.push(...event.thought_history)
            if (event.tool_results) Object.assign(fullState.tool_results, event.tool_results)
            for (const k of [
              'basic_info', 'selected_policy', 'retrieved_knowledge', 'detected_language',
              'review_passed', 'final_reply', 'requires_human', 'human_tasks', 'reply_type',
              'review_feedback', 'draft_reply', 'solver_decision',
            ] as const) {
              if (k in event) {
                (fullState as unknown as Record<string, unknown>)[k] = event[k as keyof SSEEvent]
              }
            }

            // Update subtitle
            let sub = meta.sub
            if (nodeName === 'router' && event.selected_policy) {
              sub = `匹配策略: ${event.selected_policy}`
            } else if (nodeName === 'solver' && event.solver_decision === 'call_tool') {
              const tn = event.thought_history?.[0]?.action?.replace('调用工具: ', '').split('(')[0] || ''
              sub = `决策: 调用工具 ${tn}`
            } else if (nodeName === 'solver' && event.solver_decision) {
              sub = `决策: ${event.solver_decision}`
            } else if (nodeName === 'reviewer' && event.review_passed !== undefined) {
              sub = event.review_passed ? '质量检查通过' : '审核未通过'
            }

            const blocks = buildBlocks(nodeName, event)

            // Update current node
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

            // Human intervention
            if (nodeName === 'solver' && event.solver_decision === 'need_human') {
              const humanInput = await new Promise<string | null>((resolve) => {
                setHumanDialogResolve(resolve)
                openHumanDialog(event.human_tasks || fullState.human_tasks)
              })

              const directive = humanInput
                ? `[人工客服指令]: ${humanInput}`
                : '[人工客服指令]: 跳过人工处理，请根据已有信息直接生成邮件回复'

              payload.old_emails = (payload.old_emails || '') + `\n\n${directive}`
              if (humanInput) {
                payload.body = payload.body + `\n\n[人工客服补充]: ${humanInput}`
              }

              // Add info node
              nodes.push({
                id: `human-${Date.now()}`,
                type: 'context',
                title: humanInput ? '人工指令已注入' : '跳过人工处理',
                subtitle: humanInput ? '基于客服指令继续生成' : '根据已有信息直接生成邮件',
                status: 'done',
                blocks: [{ label: humanInput ? '客服指令' : '系统指令', content: directive, type: 'thought' }],
              })
              setChainNodes([...nodes])

              abort.abort()
              solverCountRef.current = solverCount
              await processStream(payload, nodes, fullState)
              return
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        const errorNode: ChainNode = {
          id: `error-${Date.now()}`,
          type: 'done',
          title: '错误',
          subtitle: (err as Error).message,
          status: 'error',
          blocks: [],
        }
        nodes.push(errorNode)
        setChainNodes([...nodes])
        throw err
      }

      solverCountRef.current = solverCount
      setFullState(fullState)
      return fullState
    },
    [setChainNodes, setFullState, openHumanDialog, setHumanDialogResolve, settings, customPrompts]
  )

  const startStream = useCallback(
    async (body: string, oldEmails: string) => {
      setIsProcessing(true)
      setChainNodes([])
      setFullState(null)
      solverCountRef.current = 0

      const nodeConfig: Record<string, Record<string, unknown>> = {}
      const thinkingNodes = ['router', 'solver', 'reply_generator', 'reviewer']
      thinkingNodes.forEach((node) => {
        nodeConfig[node] = { enable_thinking: settings.thinking[node] ?? false }
      })
      Object.entries(customPrompts).forEach(([key, prompt]) => {
        if (!nodeConfig[key]) nodeConfig[key] = {}
        nodeConfig[key].custom_prompt = prompt
      })

      const payload: ReplyPayload = {
        body,
        old_emails: oldEmails,
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
