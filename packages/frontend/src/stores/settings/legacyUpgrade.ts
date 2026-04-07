import {
  DEFAULT_PROMPT_TEMPLATES_BY_LOCALE,
  DEFAULT_SYSTEM_PROMPT_BY_LOCALE,
  LEGACY_PROMPT_TEMPLATES,
  LEGACY_SYSTEM_PROMPT,
  PREVIOUS_CONTEXT_ENVELOPE,
  PREVIOUS_SYSTEM_PROMPT,
  PREVIOUS_THINK_TAG_SYSTEM_PROMPT
} from './defaults'
import type { PromptTemplates } from './types'

interface LegacyPromptSettingsShape {
  systemPrompt?: string
  promptTemplates?: Partial<PromptTemplates>
}

function isLegacyValue(value: string | undefined, legacyValues: string[]): boolean {
  if (!value) return true
  return legacyValues.includes(value)
}

export function upgradeLegacyPromptDefaults<T extends LegacyPromptSettingsShape>(settings?: T): T | {} {
  if (!settings) return {}

  const upgraded: T = { ...settings }
  const promptTemplates: Partial<PromptTemplates> = settings.promptTemplates || {}
  const nextTemplates: Partial<PromptTemplates> = { ...promptTemplates }

  if (isLegacyValue(settings.systemPrompt, [LEGACY_SYSTEM_PROMPT, PREVIOUS_SYSTEM_PROMPT, PREVIOUS_THINK_TAG_SYSTEM_PROMPT])) {
    upgraded.systemPrompt = DEFAULT_SYSTEM_PROMPT_BY_LOCALE['zh-CN']
  }

  if (!promptTemplates.directExpand || promptTemplates.directExpand === LEGACY_PROMPT_TEMPLATES.directExpand) {
    nextTemplates.directExpand = DEFAULT_PROMPT_TEMPLATES_BY_LOCALE['zh-CN'].directExpand
  }
  if (!promptTemplates.targetedQuestion || promptTemplates.targetedQuestion === LEGACY_PROMPT_TEMPLATES.targetedQuestion) {
    nextTemplates.targetedQuestion = DEFAULT_PROMPT_TEMPLATES_BY_LOCALE['zh-CN'].targetedQuestion
  }
  if (!promptTemplates.customContextExpand || promptTemplates.customContextExpand === LEGACY_PROMPT_TEMPLATES.customContextExpand) {
    nextTemplates.customContextExpand = DEFAULT_PROMPT_TEMPLATES_BY_LOCALE['zh-CN'].customContextExpand
  }
  if (isLegacyValue(promptTemplates.contextEnvelope, [LEGACY_PROMPT_TEMPLATES.contextEnvelope, PREVIOUS_CONTEXT_ENVELOPE])) {
    nextTemplates.contextEnvelope = DEFAULT_PROMPT_TEMPLATES_BY_LOCALE['zh-CN'].contextEnvelope
  }

  upgraded.promptTemplates = nextTemplates as PromptTemplates
  return upgraded
}
