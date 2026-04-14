import { DEFAULT_ANSWER_ANCHOR_KEYWORDS, DEFAULT_PROMPT_TEMPLATES, DEFAULT_SYSTEM_PROMPT, resolveTemplate } from './prompts.js'
import type { ApiStyle, PromptTemplates, ResolvedConfig, RuntimeConfig, RuntimeKeySource } from './types.js'

let runtimeConfig: RuntimeConfig = {}
let runtimeUpdatedAt = new Date().toISOString()
const UNBOUNDED_MAX_TOKENS = Number.MAX_SAFE_INTEGER

function parseNumber(input: unknown): number | undefined {
  if (typeof input === 'number' && Number.isFinite(input)) return input
  if (typeof input === 'string' && input.trim()) {
    const parsed = Number(input)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function clamp(value: number, min: number, max: number, integer = false): number {
  const normalized = Math.max(min, Math.min(max, value))
  return integer ? Math.round(normalized) : normalized
}

function toEnvNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function getEnvApiKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim()
}

export function normalizeApiStyle(value: unknown): ApiStyle {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (normalized === 'openai_chat' || normalized === 'openai' || normalized === 'chat' || normalized === 'chat_completions') {
    return 'openai_chat'
  }
  if (normalized === 'google_gemini' || normalized === 'google') return 'google_gemini'
  if (normalized === 'anthropic' || normalized === 'claude') return 'anthropic'
  if (
    normalized === 'openai_response'
    || normalized === 'openai_responses'
    || normalized === 'openai-response'
    || normalized === 'responses'
    || normalized === 'response'
  ) {
    return 'openai_response'
  }
  return 'openai_chat'
}

export function normalizeAnswerAnchorKeywords(input: unknown): string[] {
  const raw: string[] = []
  if (Array.isArray(input)) {
    input.forEach((item) => {
      if (typeof item === 'string') raw.push(item)
    })
  } else if (typeof input === 'string') {
    raw.push(...input.split(/[\n,，]/))
  }

  const normalized = raw
    .map((item) => item.trim())
    .filter(Boolean)

  const unique = Array.from(new Set(normalized))
  return unique.length > 0 ? unique : [...DEFAULT_ANSWER_ANCHOR_KEYWORDS]
}

function getResolvedPromptTemplates(config: RuntimeConfig): PromptTemplates {
  return {
    directExpand: resolveTemplate(
      config.promptTemplates?.directExpand,
      DEFAULT_PROMPT_TEMPLATES.directExpand,
      ['text']
    ),
    targetedQuestion: resolveTemplate(
      config.promptTemplates?.targetedQuestion,
      DEFAULT_PROMPT_TEMPLATES.targetedQuestion,
      ['text']
    ),
    contextEnvelope: resolveTemplate(
      config.promptTemplates?.contextEnvelope,
      DEFAULT_PROMPT_TEMPLATES.contextEnvelope,
      ['contextXml', 'prompt']
    )
  }
}

export function getResolvedConfig(): ResolvedConfig {
  const envTemperature = toEnvNumber(process.env.GEMINI_TEMPERATURE)
  const envMaxTokens = toEnvNumber(process.env.GEMINI_MAX_TOKENS)
  const envContextMaxDepth = toEnvNumber(process.env.CONTEXT_MAX_DEPTH)
  const envApiStyle = process.env.API_STYLE
  const envAnswerAnchorKeywords = process.env.ANSWER_ANCHOR_KEYWORDS
  const envApiKey = getEnvApiKey()

  const temperature = clamp(
    runtimeConfig.temperature ?? envTemperature ?? 0.7,
    0,
    2
  )
  const maxTokens = clamp(
    runtimeConfig.maxTokens ?? envMaxTokens ?? 4096,
    1,
    UNBOUNDED_MAX_TOKENS,
    true
  )
  const contextMaxDepth = clamp(
    runtimeConfig.contextMaxDepth ?? envContextMaxDepth ?? 10,
    1,
    50,
    true
  )

  return {
    apiKey: runtimeConfig.apiKey || envApiKey || '',
    baseURL: runtimeConfig.baseURL || process.env.GEMINI_BASE_URL || '',
    model: runtimeConfig.model || process.env.GEMINI_MODEL || '',
    apiStyle: normalizeApiStyle(runtimeConfig.apiStyle || envApiStyle || 'openai_chat'),
    answerAnchorKeywords: normalizeAnswerAnchorKeywords(
      runtimeConfig.answerAnchorKeywords ?? envAnswerAnchorKeywords ?? DEFAULT_ANSWER_ANCHOR_KEYWORDS
    ),
    temperature,
    maxTokens,
    contextMaxDepth,
    systemPrompt: (runtimeConfig.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim() || DEFAULT_SYSTEM_PROMPT,
    promptTemplates: getResolvedPromptTemplates(runtimeConfig)
  }
}

export function setLLMConfig(config: RuntimeConfig) {
  const nextConfig: RuntimeConfig = { ...config }
  if (config.apiStyle) {
    nextConfig.apiStyle = normalizeApiStyle(config.apiStyle)
  }
  if (config.answerAnchorKeywords !== undefined) {
    nextConfig.answerAnchorKeywords = normalizeAnswerAnchorKeywords(config.answerAnchorKeywords)
  }

  const parsedTemperature = parseNumber(config.temperature)
  if (parsedTemperature !== undefined) {
    nextConfig.temperature = clamp(parsedTemperature, 0, 2)
  }

  const parsedMaxTokens = parseNumber(config.maxTokens)
  if (parsedMaxTokens !== undefined) {
    nextConfig.maxTokens = clamp(parsedMaxTokens, 1, UNBOUNDED_MAX_TOKENS, true)
  }

  const parsedContextDepth = parseNumber(config.contextMaxDepth)
  if (parsedContextDepth !== undefined) {
    nextConfig.contextMaxDepth = clamp(parsedContextDepth, 1, 50, true)
  }

  runtimeConfig = {
    ...runtimeConfig,
    ...nextConfig,
    promptTemplates: {
      ...(runtimeConfig.promptTemplates || {}),
      ...(nextConfig.promptTemplates || {})
    }
  }
  runtimeUpdatedAt = new Date().toISOString()
}

export function getLLMConfig() {
  return getResolvedConfig()
}

export function getRuntimeConfigRaw(): RuntimeConfig {
  return {
    ...runtimeConfig,
    promptTemplates: {
      ...(runtimeConfig.promptTemplates || {})
    }
  }
}

export function getRuntimeConfigUpdatedAt(): string {
  return runtimeUpdatedAt
}

export function resolveRuntimeApiKeySource(requestApiKey?: string): RuntimeKeySource {
  if ((requestApiKey || '').trim()) return 'request'
  if ((runtimeConfig.apiKey || '').trim()) return 'runtime'
  if (getEnvApiKey()) return 'env'
  return 'none'
}
