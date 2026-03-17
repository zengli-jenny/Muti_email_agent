import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type View = 'compose' | 'history' | 'settings' | 'dashboard' | 'templates' | 'batch' | 'about'

export interface ChainNode {
  id: string
  type: string
  title: string
  subtitle: string
  status: 'active' | 'done' | 'error'
  blocks: Array<{ label: string; content: string; type: string; streaming?: boolean }>
}

export interface FullState {
  trace_log: unknown[]
  thought_history: unknown[]
  tool_results: Record<string, unknown>
  basic_info: Record<string, unknown>
  selected_policy: string
  retrieved_knowledge: string
  detected_language: string
  review_passed: boolean
  final_reply: string
  requires_human: boolean
  human_tasks: unknown[]
  reply_type: string
  review_feedback: string
  draft_reply: string
  solver_decision: string
}

export interface HistoryEntry {
  id: number
  timestamp: number
  body: string
  reply: string
  data: FullState
}

export interface EmailTemplate {
  id: string
  name: string
  category: string
  description: string
  body: string
  instructions: string
}

export interface BatchItem {
  id: string
  body: string
  instructions: string
  status: 'pending' | 'processing' | 'done' | 'error'
  reply?: string
  error?: string
}

// ── Conversation messages ──
export interface ConvOption {
  label: string
  value: string
}

export interface ConvMessage {
  id: string
  role: 'ai' | 'human'
  text: string
  time: number
  /** AI question with selectable options (FAQ-style) */
  options?: ConvOption[]
  /** Whether multi-select is allowed for options */
  multiSelect?: boolean
  /** Whether this question has been answered */
  answered?: boolean
}

interface AppState {
  // Navigation
  activeView: View
  setActiveView: (v: View) => void

  // UI
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
  toggleSidebar: () => void

  // System
  systemOnline: boolean
  setSystemOnline: (v: boolean) => void
  llmModel: string
  setLlmModel: (v: string) => void

  // Compose — draft persistence
  draftBody: string
  setDraftBody: (v: string) => void
  draftInstructions: string
  setDraftInstructions: (v: string) => void

  // Compose
  isProcessing: boolean
  setIsProcessing: (v: boolean) => void
  chainNodes: ChainNode[]
  setChainNodes: (nodes: ChainNode[]) => void
  addChainNode: (node: ChainNode) => void
  updateChainNode: (id: string, updates: Partial<ChainNode>) => void
  fullState: FullState | null
  setFullState: (s: FullState | null) => void

  // Human intervention (legacy dialog — kept for type compat)
  humanDialogOpen: boolean
  humanDialogTasks: unknown[]
  openHumanDialog: (tasks: unknown[]) => void
  closeHumanDialog: () => void
  humanDialogResolve: ((value: string | null) => void) | null
  setHumanDialogResolve: (fn: ((value: string | null) => void) | null) => void

  // Conversation (inline AI questions)
  convMessages: ConvMessage[]
  addConvMessage: (msg: ConvMessage) => void
  markConvAnswered: (id: string) => void
  clearConvMessages: () => void
  /** Resolver for the currently pending AI question — useSSE awaits this */
  convResolve: ((value: string | null) => void) | null
  setConvResolve: (fn: ((value: string | null) => void) | null) => void

  // History
  history: HistoryEntry[]
  addHistory: (entry: HistoryEntry) => void
  removeHistory: (id: number) => void
  clearHistory: () => void

  // Templates
  templates: EmailTemplate[]
  addTemplate: (t: EmailTemplate) => void
  removeTemplate: (id: string) => void
  updateTemplate: (id: string, updates: Partial<EmailTemplate>) => void

  // Batch
  batchItems: BatchItem[]
  setBatchItems: (items: BatchItem[]) => void
  updateBatchItem: (id: string, updates: Partial<BatchItem>) => void
  clearBatch: () => void

  // Settings
  defaultPrompts: Record<string, string>
  setDefaultPrompts: (p: Record<string, string>) => void
  customPrompts: Record<string, string>
  setCustomPrompt: (key: string, value: string) => void
  deleteCustomPrompt: (key: string) => void
  settings: {
    temperature: number
    maxReactIterations: number
    maxReflections: number
    thinking: Record<string, boolean>
    thinkingBudgets: Record<string, number>
    apiUrl: string
  }
  updateSettings: (s: Partial<AppState['settings']>) => void
}

export const emptyFullState = (): FullState => ({
  trace_log: [],
  thought_history: [],
  tool_results: {},
  basic_info: {},
  selected_policy: '',
  retrieved_knowledge: '',
  detected_language: 'en',
  review_passed: false,
  final_reply: '',
  requires_human: false,
  human_tasks: [],
  reply_type: 'NewEmail',
  review_feedback: '',
  draft_reply: '',
  solver_decision: '',
})

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // Navigation
      activeView: 'compose',
      setActiveView: (v) => set({ activeView: v }),

      // UI
      sidebarOpen: true,
      setSidebarOpen: (v) => set({ sidebarOpen: v }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      // System
      systemOnline: false,
      setSystemOnline: (v) => set({ systemOnline: v }),
      llmModel: '--',
      setLlmModel: (v) => set({ llmModel: v }),

      // Compose — draft persistence
      draftBody: '',
      setDraftBody: (v) => set({ draftBody: v }),
      draftInstructions: '',
      setDraftInstructions: (v) => set({ draftInstructions: v }),

      // Compose
      isProcessing: false,
      setIsProcessing: (v) => set({ isProcessing: v }),
      chainNodes: [],
      setChainNodes: (nodes) => set({ chainNodes: nodes }),
      addChainNode: (node) => set((s) => ({ chainNodes: [...s.chainNodes, node] })),
      updateChainNode: (id, updates) =>
        set((s) => ({
          chainNodes: s.chainNodes.map((n) =>
            n.id === id ? { ...n, ...updates } : n
          ),
        })),
      fullState: null,
      setFullState: (s) => set({ fullState: s }),

      // Human intervention (legacy)
      humanDialogOpen: false,
      humanDialogTasks: [],
      openHumanDialog: (tasks) => set({ humanDialogOpen: true, humanDialogTasks: tasks }),
      closeHumanDialog: () => set({ humanDialogOpen: false, humanDialogTasks: [] }),
      humanDialogResolve: null,
      setHumanDialogResolve: (fn) => set({ humanDialogResolve: fn }),

      // Conversation (inline)
      convMessages: [],
      addConvMessage: (msg) => set((s) => ({ convMessages: [...s.convMessages, msg] })),
      markConvAnswered: (id) =>
        set((s) => ({
          convMessages: s.convMessages.map((m) => (m.id === id ? { ...m, answered: true } : m)),
        })),
      clearConvMessages: () => set({ convMessages: [] }),
      convResolve: null,
      setConvResolve: (fn) => set({ convResolve: fn }),

      // History
      history: [],
      addHistory: (entry) =>
        set((s) => ({
          history: [entry, ...s.history].slice(0, 50),
        })),
      removeHistory: (id) =>
        set((s) => ({
          history: s.history.filter((h) => h.id !== id),
        })),
      clearHistory: () => set({ history: [] }),

      // Templates
      templates: [],
      addTemplate: (t) => set((s) => ({ templates: [...s.templates, t] })),
      removeTemplate: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
      updateTemplate: (id, updates) =>
        set((s) => ({
          templates: s.templates.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),

      // Batch
      batchItems: [],
      setBatchItems: (items) => set({ batchItems: items }),
      updateBatchItem: (id, updates) =>
        set((s) => ({
          batchItems: s.batchItems.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        })),
      clearBatch: () => set({ batchItems: [] }),

      // Settings
      defaultPrompts: {},
      setDefaultPrompts: (p) => set({ defaultPrompts: p }),
      customPrompts: {},
      setCustomPrompt: (key, value) =>
        set((s) => ({ customPrompts: { ...s.customPrompts, [key]: value } })),
      deleteCustomPrompt: (key) =>
        set((s) => {
          const next = { ...s.customPrompts }
          delete next[key]
          return { customPrompts: next }
        }),
      settings: {
        temperature: 0.1,
        maxReactIterations: 7,
        maxReflections: 2,
        thinking: { router: true, solver: true, reply_generator: false, reviewer: false },
        thinkingBudgets: { router: 600, solver: 600, reply_generator: 600, reviewer: 600 },
        apiUrl: 'http://127.0.0.1:8001',
      },
      updateSettings: (s) =>
        set((state) => ({
          settings: { ...state.settings, ...s },
        })),
    }),
    {
      name: 'smartcs-storage',
      partialize: (state) => ({
        history: state.history,
        customPrompts: state.customPrompts,
        settings: state.settings,
        templates: state.templates,
        draftBody: state.draftBody,
        draftInstructions: state.draftInstructions,
      }),
    }
  )
)
