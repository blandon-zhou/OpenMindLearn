import type { LocaleCode, LocaleMode } from '../../i18n/types'

export type ExpandMode = 'direct' | 'targeted'
export type ThemeMode = 'light' | 'dark'
export type ApiStyle = 'openai_chat' | 'google_gemini' | 'anthropic' | 'openai_response'
export type SecretProvider = 'os_keychain' | 'webcrypto'
export type ProviderId = 'openai_compatible' | 'anthropic' | 'google_gemini' | 'custom'
export type RuntimeKeySource = 'request' | 'runtime' | 'env' | 'none'
export type SecretAvailability = 'unknown' | 'local' | 'runtime' | 'env' | 'missing' | 'error'
export type RuntimeSyncState = 'idle' | 'syncing' | 'synced' | 'stale' | 'failed'
export type ReadinessState = 'ready' | 'missing_base_url' | 'missing_model' | 'missing_key' | 'sync_failed'

export interface LLMProfileConfig {
  baseURL: string
  modelsPath: string
  model: string
  apiStyle: ApiStyle
  temperature: number
  maxTokens: number
}

export interface LLMProfileSecret {
  provider: SecretProvider
  secretId: string
  hasApiKey: boolean
  updatedAt?: string
}

export interface LLMProfile {
  id: string
  name: string
  config: LLMProfileConfig
  secret: LLMProfileSecret
  modelOptionsCache?: string[]
  updatedAt: string
}

export interface PromptTemplates {
  directExpand: string
  targetedQuestion: string
  contextEnvelope: string
}

export interface LocalizedPromptConfig {
  systemPrompt: string
  promptTemplates: PromptTemplates
  answerAnchorKeywords: string[]
}

export interface LLMSettings {
  activeProfileId: string
  profiles: LLMProfile[]
  baseURL: string
  modelsPath: string
  model: string
  apiStyle: ApiStyle
  temperature: number
  maxTokens: number
  contextMaxDepth: number
  promptLocale: LocaleCode
  localizedPrompts: Record<LocaleCode, LocalizedPromptConfig>
  answerAnchorKeywords: string[]
  systemPrompt: string
  promptTemplates: PromptTemplates
}

export interface RuntimeSnapshot {
  hasApiKey: boolean
  keySource: RuntimeKeySource
  providerId: ProviderId
  baseURL: string
  model: string
  apiStyle: ApiStyle
  updatedAt: string
}

export interface ProfileHealth {
  profileId: string
  providerId: ProviderId
  secretAvailability: SecretAvailability
  runtimeSyncState: RuntimeSyncState
  readiness: ReadinessState
  lastSyncError?: string
  updatedAt: string
}

export interface UISettings {
  theme: ThemeMode
  localeMode: LocaleMode
  localeResolved: LocaleCode
}

export interface SettingsStore {
  llmSettings: LLMSettings
  uiSettings: UISettings
  runtimeSnapshot: RuntimeSnapshot | null
  profileHealthById: Record<string, ProfileHealth>
  updateLLMSettings: (settings: Partial<LLMSettings>) => void
  createLLMProfile: (name?: string) => string
  renameLLMProfile: (profileId: string, name: string) => void
  deleteLLMProfile: (profileId: string) => void
  setActiveLLMProfile: (profileId: string) => void
  updateLLMProfileConfig: (profileId: string, config: Partial<LLMProfileConfig>) => void
  updateLLMProfileSecret: (profileId: string, secret: Partial<LLMProfileSecret>) => void
  setLLMProfileModelOptionsCache: (profileId: string, models: string[]) => void
  setRuntimeSnapshot: (snapshot: RuntimeSnapshot | null) => void
  setProfileHealth: (profileId: string, health: ProfileHealth) => void
  removeProfileHealth: (profileId: string) => void
  updateUISettings: (settings: Partial<UISettings>) => void
  setTheme: (theme: ThemeMode) => void
  setLocaleMode: (mode: LocaleMode) => void
  syncLocaleFromNavigator: () => void
}
