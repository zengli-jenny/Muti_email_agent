/** API configuration and helpers */

export function getApiUrl(): string {
  // In dev, Vite proxy handles /api/* → backend
  // In prod, same origin
  return ''
}

export async function fetchHealth(): Promise<{ status: string }> {
  const resp = await fetch(`${getApiUrl()}/health`, { signal: AbortSignal.timeout(5000) })
  return resp.json()
}

export async function fetchInfo(): Promise<{ llm_model: string; policies: string[] }> {
  const resp = await fetch(`${getApiUrl()}/info`, { signal: AbortSignal.timeout(5000) })
  return resp.json()
}

export async function fetchPrompts(): Promise<Record<string, string>> {
  const resp = await fetch(`${getApiUrl()}/prompts`, { signal: AbortSignal.timeout(5000) })
  return resp.json()
}

export interface ReplyPayload {
  body: string
  customer_email?: string
  brand?: string
  subject?: string
  old_emails?: string
  instructions?: string
  auto_execute?: boolean
  llm_temperature?: number
  max_react_iterations?: number
  max_reflections?: number
  node_config?: Record<string, unknown>
}

export interface ResumePayload {
  human_input: string
  body: string
  customer_email?: string
  brand?: string
  subject?: string
  old_emails?: string
  basic_info?: Record<string, unknown>
  selected_policy?: string
  policy_content?: string
  detected_language?: string
  retrieved_knowledge?: string
  thought_history?: Array<Record<string, unknown>>
  tool_results?: Record<string, unknown>
  auto_execute?: boolean
  llm_temperature?: number
  max_react_iterations?: number
  max_reflections?: number
  node_config?: Record<string, unknown>
}

export interface SSEEvent {
  node: string
  status?: string
  trace?: Array<{ node?: string; detail?: string; reasoning?: string }>
  selected_policy?: string
  basic_info?: Record<string, unknown>
  retrieved_knowledge?: string
  thought_history?: Array<{ thought?: string; action?: string; observation?: string }>
  tool_results?: Record<string, unknown>
  draft_reply?: string
  review_passed?: boolean
  review_feedback?: string
  final_reply?: string
  requires_human?: boolean
  human_tasks?: Array<unknown>
  detected_language?: string
  reply_type?: string
  solver_decision?: string
}

/** Token-level streaming event from the backend */
export interface SSETokenEvent {
  node: string
  type: 'thinking' | 'content'
  text: string
}
