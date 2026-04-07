import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from './components/Canvas'
import { Toast } from './components/Toast'
import { useSettingsStore } from './stores/settingsStore'
import { syncActiveProfileToRuntime } from './services/profileRuntime'
import { tFromSettings } from './hooks/useI18n'

function LLMSettingsSync() {
  const llmSettings = useSettingsStore((state) => state.llmSettings)

  useEffect(() => {
    syncActiveProfileToRuntime(llmSettings).catch((error) => {
      console.error(tFromSettings('app.syncLLMFailed'), error)
    })
  }, [llmSettings])

  return null
}

function ThemeSync() {
  const theme = useSettingsStore((state) => state.uiSettings.theme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return null
}

function LocaleSync() {
  const { localeMode, localeResolved } = useSettingsStore((state) => state.uiSettings)
  const syncLocaleFromNavigator = useSettingsStore((state) => state.syncLocaleFromNavigator)

  useEffect(() => {
    syncLocaleFromNavigator()
  }, [localeMode, syncLocaleFromNavigator])

  useEffect(() => {
    const handleLanguageChange = () => {
      syncLocaleFromNavigator()
    }
    window.addEventListener('languagechange', handleLanguageChange)
    return () => window.removeEventListener('languagechange', handleLanguageChange)
  }, [syncLocaleFromNavigator])

  useEffect(() => {
    document.documentElement.lang = localeResolved
  }, [localeResolved])

  return null
}

export default function App() {
  return (
    <ReactFlowProvider>
      <LLMSettingsSync />
      <ThemeSync />
      <LocaleSync />
      <Canvas />
      <Toast />
    </ReactFlowProvider>
  )
}
