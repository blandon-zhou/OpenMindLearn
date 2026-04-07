import { getBrowserLanguage, resolveLocaleMode } from '../../i18n'
import type { LocaleCode } from '../../i18n/types'
import {
  DEFAULT_ANSWER_ANCHOR_KEYWORDS_BY_LOCALE,
  clonePromptTemplates,
  getDefaultPromptConfig
} from './defaults'
import { upgradeLegacyPromptDefaults } from './legacyUpgrade'
import type { ApiStyle, LLMSettings, LocalizedPromptConfig, UISettings } from './types'

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

export function normalizeLLMSettings(settings?: Partial<LLMSettings>): LLMSettings {
  const upgraded = upgradeLegacyPromptDefaults(settings)
  const promptLocale = resolvePromptLocale(upgraded.promptLocale)
  const localizedPromptsRaw = (upgraded.localizedPrompts || {}) as Partial<Record<LocaleCode, Partial<LocalizedPromptConfig>>>

  const localizedPrompts: Record<LocaleCode, LocalizedPromptConfig> = {
    'zh-CN': normalizeLocalizedPrompt('zh-CN', localizedPromptsRaw['zh-CN']),
    'en-US': normalizeLocalizedPrompt('en-US', localizedPromptsRaw['en-US'])
  }

  if (!upgraded.localizedPrompts) {
    localizedPrompts[promptLocale] = normalizeLocalizedPrompt(promptLocale, {
      ...localizedPrompts[promptLocale],
      systemPrompt: upgraded.systemPrompt || localizedPrompts[promptLocale].systemPrompt,
      promptTemplates: {
        ...localizedPrompts[promptLocale].promptTemplates,
        ...(upgraded.promptTemplates || {})
      },
      answerAnchorKeywords: upgraded.answerAnchorKeywords || localizedPrompts[promptLocale].answerAnchorKeywords
    })
  }

  const activePromptConfig = localizedPrompts[promptLocale]

  return {
    apiKey: upgraded.apiKey || '',
    baseURL: upgraded.baseURL || '',
    model: upgraded.model || '',
    apiStyle: normalizeApiStyle(upgraded.apiStyle),
    promptLocale,
    localizedPrompts,
    answerAnchorKeywords: [...activePromptConfig.answerAnchorKeywords],
    temperature: typeof upgraded.temperature === 'number' ? upgraded.temperature : 0.7,
    maxTokens: typeof upgraded.maxTokens === 'number' ? upgraded.maxTokens : 4096,
    contextMaxDepth: typeof upgraded.contextMaxDepth === 'number' ? upgraded.contextMaxDepth : 10,
    systemPrompt: activePromptConfig.systemPrompt,
    promptTemplates: clonePromptTemplates(activePromptConfig.promptTemplates)
  }
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
