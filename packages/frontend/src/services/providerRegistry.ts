import type { ApiStyle, ProviderId } from '../stores/settings'

export interface ProviderDefinition {
  id: ProviderId
  label: string
  supportedApiStyles: ApiStyle[]
  defaultModelsPath: string
  authSchemes: Array<'bearer' | 'x-api-key' | 'x-goog-api-key' | 'anthropic-version'>
  baseUrlRules: {
    supportsV1AutoVariant: boolean
  }
}

const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  openai_compatible: {
    id: 'openai_compatible',
    label: 'OpenAI Compatible',
    supportedApiStyles: ['openai_chat', 'openai_response'],
    defaultModelsPath: 'models',
    authSchemes: ['bearer'],
    baseUrlRules: {
      supportsV1AutoVariant: true
    }
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    supportedApiStyles: ['anthropic'],
    defaultModelsPath: 'models',
    authSchemes: ['x-api-key', 'anthropic-version'],
    baseUrlRules: {
      supportsV1AutoVariant: true
    }
  },
  google_gemini: {
    id: 'google_gemini',
    label: 'Google Gemini',
    supportedApiStyles: ['google_gemini'],
    defaultModelsPath: 'models',
    authSchemes: ['x-goog-api-key', 'bearer'],
    baseUrlRules: {
      supportsV1AutoVariant: true
    }
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    supportedApiStyles: ['openai_chat'],
    defaultModelsPath: 'models',
    authSchemes: ['bearer'],
    baseUrlRules: {
      supportsV1AutoVariant: true
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

export function getProviderDefinitionByApiStyle(apiStyle: ApiStyle): ProviderDefinition {
  const providerId = resolveProviderIdFromApiStyle(apiStyle)
  return PROVIDERS[providerId] || PROVIDERS.custom
}

