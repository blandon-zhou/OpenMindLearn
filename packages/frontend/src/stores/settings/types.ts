import type { LocaleCode, LocaleMode } from '../../i18n/types'

export type ExpandMode = 'direct' | 'targeted' | 'custom_context'
export type ThemeMode = 'light' | 'dark'
export type ApiStyle = 'openai_chat' | 'google_gemini' | 'anthropic' | 'openai_response'

export interface PromptTemplates {
  directExpand: string
  targetedQuestion: string
  customContextExpand: string
  contextEnvelope: string
}

export interface LocalizedPromptConfig {
  systemPrompt: string
  promptTemplates: PromptTemplates
  answerAnchorKeywords: string[]
}

export interface LLMSettings {
  apiKey: string
  baseURL: string
  model: string
  apiStyle: ApiStyle
  promptLocale: LocaleCode
  localizedPrompts: Record<LocaleCode, LocalizedPromptConfig>
  answerAnchorKeywords: string[]
  temperature: number
  maxTokens: number
  contextMaxDepth: number
  systemPrompt: string
  promptTemplates: PromptTemplates
}

export interface UISettings {
  theme: ThemeMode
  localeMode: LocaleMode
  localeResolved: LocaleCode
}

export interface SettingsStore {
  llmSettings: LLMSettings
  uiSettings: UISettings
  updateLLMSettings: (settings: Partial<LLMSettings>) => void
  updateUISettings: (settings: Partial<UISettings>) => void
  setTheme: (theme: ThemeMode) => void
  setLocaleMode: (mode: LocaleMode) => void
  syncLocaleFromNavigator: () => void
}
