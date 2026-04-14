import type { ApiStyle, ProviderId } from './types.js'

export interface ProviderDefinition {
  id: ProviderId
  label: string
  supportedApiStyles: ApiStyle[]
  defaultModelsPath: string
  authSchemes: Array<'bearer' | 'x-api-key' | 'x-goog-api-key' | 'anthropic-version'>
  baseUrlRules: {
    supportsV1AutoVariant: boolean
    normalize: (input: string) => string
  }
}

function withNoTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function normalizeOpenAICompatibleBaseUrl(input: string): string {
  return withNoTrailingSlash(input)
}

function normalizeAnthropicBaseUrl(input: string): string {
  return withNoTrailingSlash(input)
}

function normalizeGoogleGeminiBaseUrl(input: string): string {
  const normalized = withNoTrailingSlash(input)
  if (!normalized) return normalized
  if (/\/gemini\/v1beta$/i.test(normalized)) {
    return normalized.replace(/\/gemini\/v1beta$/i, '/gemini/v1')
  }
  if (/\/gemini\/v1$/i.test(normalized)) {
    return normalized
  }
  if (/\/openai\/v1$/i.test(normalized)) {
    return normalized.replace(/\/openai\/v1$/i, '/gemini/v1')
  }
  if (normalized.endsWith('/v1beta')) {
    return `${normalized.slice(0, -7)}/gemini/v1`
  }
  if (normalized.endsWith('/v1')) {
    return `${normalized.slice(0, -3)}/gemini/v1`
  }
  return normalized
}

const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  openai_compatible: {
    id: 'openai_compatible',
    label: 'OpenAI Compatible',
    supportedApiStyles: ['openai_chat', 'openai_response'],
    defaultModelsPath: 'models',
    authSchemes: ['bearer'],
    baseUrlRules: {
      supportsV1AutoVariant: true,
      normalize: normalizeOpenAICompatibleBaseUrl
    }
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    supportedApiStyles: ['anthropic'],
    defaultModelsPath: 'models',
    authSchemes: ['x-api-key', 'anthropic-version'],
    baseUrlRules: {
      supportsV1AutoVariant: true,
      normalize: normalizeAnthropicBaseUrl
    }
  },
  google_gemini: {
    id: 'google_gemini',
    label: 'Google Gemini',
    supportedApiStyles: ['google_gemini'],
    defaultModelsPath: 'models',
    authSchemes: ['x-goog-api-key', 'bearer'],
    baseUrlRules: {
      supportsV1AutoVariant: true,
      normalize: normalizeGoogleGeminiBaseUrl
    }
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    supportedApiStyles: ['openai_chat'],
    defaultModelsPath: 'models',
    authSchemes: ['bearer'],
    baseUrlRules: {
      supportsV1AutoVariant: true,
      normalize: normalizeOpenAICompatibleBaseUrl
    }
  }
}

const API_STYLE_PROVIDER_MAP: Record<ApiStyle, ProviderId> = {
  openai_chat: 'openai_compatible',
  openai_response: 'openai_compatible',
  anthropic: 'anthropic',
  google_gemini: 'google_gemini'
}

export function resolveProviderIdFromApiStyle(apiStyle: ApiStyle): ProviderId {
  return API_STYLE_PROVIDER_MAP[apiStyle] || 'custom'
}

export function getProviderDefinitionById(providerId: ProviderId): ProviderDefinition {
  return PROVIDERS[providerId] || PROVIDERS.custom
}

export function getProviderDefinitionByApiStyle(apiStyle: ApiStyle): ProviderDefinition {
  return getProviderDefinitionById(resolveProviderIdFromApiStyle(apiStyle))
}
