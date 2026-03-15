import { useEffect } from 'react'
import { Layout } from '@/components/layout/Layout'
import { KeyboardShortcuts } from '@/components/layout/KeyboardShortcuts'
import { ComposePage } from '@/pages/ComposePage'
import { DashboardPage } from '@/pages/DashboardPage'
import { TemplatesPage } from '@/pages/TemplatesPage'
import { BatchPage } from '@/pages/BatchPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { HumanAssistDialog } from '@/components/compose/HumanAssistDialog'
import { useStore } from '@/store/useStore'
import { fetchHealth, fetchInfo, fetchPrompts } from '@/lib/api'

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
    default:
      return <ComposePage />
  }
}

export default function App() {
  const { setSystemOnline, setLlmModel, setDefaultPrompts } = useStore()

  useEffect(() => {
    fetchHealth()
      .then((data) => {
        if (data.status === 'ok') setSystemOnline(true)
      })
      .catch(() => setSystemOnline(false))

    fetchInfo()
      .then((info) => setLlmModel(info.llm_model || '--'))
      .catch(() => {})

    fetchPrompts()
      .then((prompts) => setDefaultPrompts(prompts))
      .catch(() => {})
  }, [setSystemOnline, setLlmModel, setDefaultPrompts])

  return (
    <>
      <Layout>
        <AppContent />
      </Layout>
      <HumanAssistDialog />
      <KeyboardShortcuts />
    </>
  )
}
