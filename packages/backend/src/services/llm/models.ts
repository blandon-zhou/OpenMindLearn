import { normalizeApiStyle } from './config.js'
import { extractErrorMessage, parseResponseJson } from './transport.js'
import type { ApiStyle } from './types.js'

interface ModelListConfig {
  apiKey?: string
  baseURL?: string
  apiStyle?: ApiStyle | string
}

function withNoTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function toGoogleBaseURL(baseURL: string): string {
  const normalized = withNoTrailingSlash(baseURL)
  if (normalized.endsWith('/v1')) {
    return `${normalized.slice(0, -3)}/gemini/v1`
  }
  if (normalized.includes('/openai/v1')) {
    return normalized.replace('/openai/v1', '/gemini/v1')
  }
  return normalized
}

function normalizeModelId(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.replace(/^models\//, '')
}

function collectModelIds(data: any): string[] {
  const buckets: unknown[] = []

  if (Array.isArray(data?.data)) buckets.push(...data.data)
  if (Array.isArray(data?.models)) buckets.push(...data.models)

  const values: string[] = []
  const seen = new Set<string>()

  buckets.forEach((item) => {
    if (!item || typeof item !== 'object') return
    const record = item as Record<string, unknown>
    const candidates = [record.id, record.model, record.name]

    candidates.forEach((candidate) => {
      if (typeof candidate !== 'string') return
      const normalized = normalizeModelId(candidate)
      if (!normalized || seen.has(normalized)) return
      seen.add(normalized)
      values.push(normalized)
    })
  })

  return values
}

function buildModelListRequest(style: ApiStyle, baseURL: string, apiKey: string) {
  const normalizedBase = style === 'google_gemini'
    ? toGoogleBaseURL(baseURL)
    : withNoTrailingSlash(baseURL)

  const headers: Record<string, string> = {}
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
    headers['x-api-key'] = apiKey
    headers['x-goog-api-key'] = apiKey
  }
  if (style === 'anthropic') {
    headers['anthropic-version'] = '2023-06-01'
  }

  return {
    url: `${normalizedBase}/models`,
    headers
  }
}

export async function listAvailableModels(config: ModelListConfig): Promise<string[]> {
  const apiKey = (config.apiKey || '').trim()
  const baseURL = (config.baseURL || '').trim()
  const style = normalizeApiStyle(config.apiStyle)

  if (!baseURL) throw new Error('请先填写 Base URL')
  if (!apiKey) throw new Error('请先填写 API Key')

  const request = buildModelListRequest(style, baseURL, apiKey)
  const response = await fetch(request.url, { method: 'GET', headers: request.headers })
  const data = await parseResponseJson(response)

  if (!response.ok) {
    throw new Error(extractErrorMessage(data, `获取模型列表失败：HTTP ${response.status}`))
  }

  const models = collectModelIds(data)
  if (models.length === 0) {
    throw new Error('未获取到可用模型，请检查 API 风格与 Base URL 是否匹配')
  }

  return models
}
