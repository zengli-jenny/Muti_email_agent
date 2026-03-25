import { useEffect, useRef } from 'react'
import { Layout } from '@/components/layout/Layout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ToastContainer } from '@/components/Toast'
import { KeyboardShortcuts } from '@/components/layout/KeyboardShortcuts'
import { ComposePage } from '@/pages/ComposePage'
import { DashboardPage } from '@/pages/DashboardPage'
import { TemplatesPage } from '@/pages/TemplatesPage'
import { BatchPage } from '@/pages/BatchPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AboutPage } from '@/pages/AboutPage'
import { SkillsPage } from '@/pages/SkillsPage'
import { ToolsPage } from '@/pages/ToolsPage'
import { useStore } from '@/store/useStore'
import { fetchHealth, fetchInfo, fetchPrompts } from '@/lib/api'

const HEALTH_POLL_INTERVAL = 30_000

function AppContent() {
  const activeView = useStore((s) => s.activeView)

  switch (activeView) {
    case 'compose':
      return <ComposePage />
    case 'dashboard':
      return <DashboardPage />
    case 'templates':
      return <TemplatesPage />
    case 'batch':
      return <BatchPage />
    case 'history':
      return <HistoryPage />
    case 'settings':
      return <SettingsPage />
    case 'about':
      return <AboutPage />
    case 'skills':
      return <SkillsPage />
    case 'tools':
      return <ToolsPage />
    default:
      return <ComposePage />
  }
}

export default function App() {
  const { setSystemOnline, setLlmModel, setDefaultPrompts } = useStore()
  const healthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const checkHealth = () => {
      fetchHealth()
        .then((data) => setSystemOnline(data.status === 'ok'))
        .catch(() => setSystemOnline(false))
    }

    // Initial checks
    checkHealth()

    fetchInfo()
      .then((info) => setLlmModel(info.llm_model || '--'))
      .catch(() => console.warn('Smart CS: failed to fetch model info'))

    fetchPrompts()
      .then((prompts) => setDefaultPrompts(prompts))
      .catch(() => console.warn('Smart CS: failed to fetch default prompts'))

    // Periodic health polling
    healthTimerRef.current = setInterval(checkHealth, HEALTH_POLL_INTERVAL)

    return () => {
      if (healthTimerRef.current) clearInterval(healthTimerRef.current)
    }
  }, [setSystemOnline, setLlmModel, setDefaultPrompts])

  return (
    <ErrorBoundary>
      <Layout>
        <AppContent />
      </Layout>
      <KeyboardShortcuts />
      <ToastContainer />
    </ErrorBoundary>
  )
}
