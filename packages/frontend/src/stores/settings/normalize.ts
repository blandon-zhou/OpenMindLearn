import { getBrowserLanguage, resolveLocaleMode } from '../../i18n'
import type { LocaleCode } from '../../i18n/types'
import { buildProfileSecretId, getDefaultSecretProvider } from '../../services/secureSecret'
import {
  DEFAULT_ANSWER_ANCHOR_KEYWORDS_BY_LOCALE,
  clonePromptTemplates,
  getDefaultPromptConfig
} from './defaults'
import type {
  ApiStyle,
  LLMProfile,
  LLMProfileConfig,
  LLMProfileSecret,
  LLMSettings,
  LocalizedPromptConfig,
  UISettings
} from './types'

interface LegacyLLMSettingsLike {
  activeProfileId?: unknown
  profiles?: unknown
  contextMaxDepth?: unknown
  promptLocale?: unknown
  localizedPrompts?: unknown
  answerAnchorKeywords?: string[] | string
  systemPrompt?: string
  promptTemplates?: Partial<LocalizedPromptConfig['promptTemplates']>
}

const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_MAX_TOKENS = 4096
const UNBOUNDED_MAX_TOKENS = Number.MAX_SAFE_INTEGER
const DEFAULT_CONTEXT_MAX_DEPTH = 10

function clamp(value: number, min: number, max: number, integer = false): number {
  const normalized = Math.max(min, Math.min(max, value))
  return integer ? Math.round(normalized) : normalized
}

function normalizeNumber(
  input: unknown,
  fallback: number,
  min: number,
  max: number,
  integer = false
): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return fallback
  return clamp(input, min, max, integer)
}

function nowIsoString(): string {
  return new Date().toISOString()
}

function createProfileId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function resolveProfileName(value: unknown, fallbackIndex: number): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return fallbackIndex === 0 ? '默认配置' : `配置 ${fallbackIndex + 1}`
}

function normalizeProfileSecret(profileId: string, source?: Partial<LLMProfileSecret>): LLMProfileSecret {
  const provider = source?.provider === 'os_keychain' || source?.provider === 'webcrypto'
    ? source.provider
    : getDefaultSecretProvider()

  return {
    provider,
    secretId: (source?.secretId || '').trim() || buildProfileSecretId(profileId),
    hasApiKey: Boolean(source?.hasApiKey),
    updatedAt: source?.updatedAt
  }
}

function normalizeModelOptionsCache(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined
  const unique = Array.from(new Set(input
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)))

  return unique.length > 0 ? unique : undefined
}

export function resolvePromptLocale(value: unknown): LocaleCode {
  return value === 'en-US' ? 'en-US' : 'zh-CN'
}

export function normalizeApiStyle(value: unknown): ApiStyle {
  if (value === 'google_gemini') return 'google_gemini'
  if (value === 'anthropic') return 'anthropic'
  if (value === 'openai_response') return 'openai_response'
  return 'openai_chat'
}

export function normalizeAnswerAnchorKeywords(input: unknown, fallback: string[]): string[] {
  const raw: string[] = []
  if (Array.isArray(input)) {
    input.forEach((item) => {
      if (typeof item === 'string') raw.push(item)
    })
  } else if (typeof input === 'string') {
    raw.push(...input.split(/[\r\n,，]+/))
  }

  const normalized = Array.from(new Set(raw.map((item) => item.trim()).filter(Boolean)))
  return normalized.length > 0 ? normalized : [...fallback]
}

export function normalizeLocalizedPrompt(locale: LocaleCode, source?: Partial<LocalizedPromptConfig>): LocalizedPromptConfig {
  const fallback = getDefaultPromptConfig(locale)
  return {
    systemPrompt: (source?.systemPrompt || '').trim() || fallback.systemPrompt,
    promptTemplates: {
      ...fallback.promptTemplates,
      ...(source?.promptTemplates || {})
    },
    answerAnchorKeywords: normalizeAnswerAnchorKeywords(source?.answerAnchorKeywords, fallback.answerAnchorKeywords)
  }
}

export function normalizeLLMProfileConfig(source?: Partial<LLMProfileConfig>): LLMProfileConfig {
  return {
    baseURL: (source?.baseURL || '').trim(),
    model: (source?.model || '').trim(),
    apiStyle: normalizeApiStyle(source?.apiStyle),
    temperature: normalizeNumber(source?.temperature, DEFAULT_TEMPERATURE, 0, 2),
    maxTokens: normalizeNumber(source?.maxTokens, DEFAULT_MAX_TOKENS, 1, UNBOUNDED_MAX_TOKENS, true)
  }
}

export function createLLMProfile(name?: string, config?: Partial<LLMProfileConfig>): LLMProfile {
  const id = createProfileId()
  const now = nowIsoString()

  return {
    id,
    name: (name || '').trim() || '默认配置',
    config: normalizeLLMProfileConfig(config),
    secret: {
      provider: getDefaultSecretProvider(),
      secretId: buildProfileSecretId(id),
      hasApiKey: false,
      updatedAt: undefined
    },
    modelOptionsCache: [],
    updatedAt: now
  }
}

function normalizeLLMProfile(source: unknown, index: number): LLMProfile {
  if (!source || typeof source !== 'object') {
    return createLLMProfile(resolveProfileName(undefined, index))
  }

  const record = source as Partial<LLMProfile>
  const id = (record.id || '').trim() || createProfileId()
  const normalizedSecret = normalizeProfileSecret(id, record.secret)

  return {
    id,
    name: resolveProfileName(record.name, index),
    config: normalizeLLMProfileConfig(record.config),
    secret: normalizedSecret,
    modelOptionsCache: normalizeModelOptionsCache(record.modelOptionsCache) || [],
    updatedAt: record.updatedAt || nowIsoString()
  }
}

function ensureProfiles(input: LegacyLLMSettingsLike): LLMProfile[] {
  if (Array.isArray(input.profiles) && input.profiles.length > 0) {
    return input.profiles.map((profile, index) => normalizeLLMProfile(profile, index))
  }

  return [createLLMProfile('默认配置')]
}

function resolveActiveProfileId(activeProfileId: unknown, profiles: LLMProfile[]): string {
  const preferred = typeof activeProfileId === 'string' ? activeProfileId : ''
  if (preferred && profiles.some((profile) => profile.id === preferred)) {
    return preferred
  }
  return profiles[0].id
}

export function ensureActiveProfileState(settings: LLMSettings): LLMSettings {
  const profiles = settings.profiles.length > 0 ? settings.profiles : [createLLMProfile()]
  const activeProfileId = resolveActiveProfileId(settings.activeProfileId, profiles)
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0]

  return {
    ...settings,
    profiles,
    activeProfileId,
    baseURL: activeProfile.config.baseURL,
    model: activeProfile.config.model,
    apiStyle: activeProfile.config.apiStyle,
    temperature: activeProfile.config.temperature,
    maxTokens: activeProfile.config.maxTokens
  }
}

export function normalizeLLMSettings(settings?: Partial<LLMSettings> | Record<string, unknown>): LLMSettings {
  const upgraded = (settings || {}) as LegacyLLMSettingsLike
  const promptLocale = resolvePromptLocale(upgraded.promptLocale)
  const localizedPromptsRaw = (upgraded.localizedPrompts || {}) as Partial<Record<LocaleCode, Partial<LocalizedPromptConfig>>>

  const localizedPrompts: Record<LocaleCode, LocalizedPromptConfig> = {
    'zh-CN': normalizeLocalizedPrompt('zh-CN', localizedPromptsRaw['zh-CN']),
    'en-US': normalizeLocalizedPrompt('en-US', localizedPromptsRaw['en-US'])
  }

  if (!upgraded.localizedPrompts) {
    localizedPrompts[promptLocale] = normalizeLocalizedPrompt(promptLocale, {
      ...localizedPrompts[promptLocale],
      systemPrompt: typeof upgraded.systemPrompt === 'string'
        ? upgraded.systemPrompt
        : localizedPrompts[promptLocale].systemPrompt,
      promptTemplates: {
        ...localizedPrompts[promptLocale].promptTemplates,
        ...((upgraded.promptTemplates as Partial<LocalizedPromptConfig['promptTemplates']>) || {})
      },
      answerAnchorKeywords: upgraded.answerAnchorKeywords as string[] | undefined
    })
  }

  const activePromptConfig = localizedPrompts[promptLocale]
  const profiles = ensureProfiles(upgraded)

  const llmSettings: LLMSettings = {
    activeProfileId: resolveActiveProfileId(upgraded.activeProfileId, profiles),
    profiles,
    baseURL: '',
    model: '',
    apiStyle: 'openai_chat',
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
    contextMaxDepth: normalizeNumber(upgraded.contextMaxDepth, DEFAULT_CONTEXT_MAX_DEPTH, 1, 50, true),
    promptLocale,
    localizedPrompts,
    answerAnchorKeywords: [...activePromptConfig.answerAnchorKeywords],
    systemPrompt: activePromptConfig.systemPrompt,
    promptTemplates: clonePromptTemplates(activePromptConfig.promptTemplates)
  }

  return ensureActiveProfileState(llmSettings)
}

export function normalizeUISettings(settings?: Partial<UISettings>): UISettings {
  const mode = settings?.localeMode || 'auto'
  return {
    theme: settings?.theme || 'light',
    localeMode: mode,
    localeResolved: resolveLocaleMode(mode, getBrowserLanguage())
  }
}

export function getDefaultUISettings(): UISettings {
  return {
    theme: 'light',
    localeMode: 'auto',
    localeResolved: resolveLocaleMode('auto', getBrowserLanguage())
  }
}

export function getFallbackAnswerAnchorKeywords(locale: LocaleCode): string[] {
  return [...DEFAULT_ANSWER_ANCHOR_KEYWORDS_BY_LOCALE[locale]]
}
