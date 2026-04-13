import { useEffect, useRef } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from './components/Canvas'
import { Toast } from './components/Toast'
import { useSettingsStore } from './stores/settingsStore'
import { useToastStore } from './stores/toastStore'
import { syncActiveProfileToRuntime } from './services/profileRuntime'
import { tFromSettings } from './hooks/useI18n'

function LLMSettingsSync() {
  const llmSettings = useSettingsStore((state) => state.llmSettings)
  const { showToast } = useToastStore()
  const lastErrorMessageRef = useRef('')

  useEffect(() => {
    syncActiveProfileToRuntime(llmSettings)
      .then(() => {
        lastErrorMessageRef.current = ''
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error(tFromSettings('app.syncLLMFailed'), error)

        if (!message || message === lastErrorMessageRef.current) return
        lastErrorMessageRef.current = message
        showToast(`${tFromSettings('app.syncLLMFailed')} ${message}`, 'error')
      })
  }, [llmSettings, showToast])

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
