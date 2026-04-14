import { normalizeApiStyle } from './config.js'
import { getProviderDefinitionByApiStyle } from './providerRegistry.js'
import { extractErrorMessage, parseResponseJson } from './transport.js'
import type { ApiStyle } from './types.js'

interface ModelListConfig {
  apiKey?: string
  baseURL?: string
  apiStyle?: ApiStyle | string
  modelsPath?: string
}

function withNoTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function withBaseVariants(value: string): string[] {
  const normalized = withNoTrailingSlash(value)
  if (!normalized) return []
  if (normalized.endsWith('/v1')) {
    return [normalized, normalized.slice(0, -3)].filter(Boolean)
  }
  return [normalized, `${normalized}/v1`].filter(Boolean)
}

function normalizeModelsPath(value: string | undefined): string {
  const trimmed = (value || '').trim()
  if (!trimmed) return 'models'
  return trimmed.replace(/^\/+/, '').replace(/\/+$/, '') || 'models'
}

function joinBaseAndModelsPath(base: string, modelsPath: string): string {
  if (base.endsWith('/v1') && modelsPath === 'v1') return base
  if (base.endsWith('/v1') && modelsPath.startsWith('v1/')) {
    return `${base}/${modelsPath.slice(3)}`
  }
  return `${base}/${modelsPath}`
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

function buildModelListRequests(style: ApiStyle, baseURL: string, apiKey: string, modelsPath?: string) {
  const provider = getProviderDefinitionByApiStyle(style)
  const normalizedBase = provider.baseUrlRules.normalize(baseURL)
  const candidateBases = provider.baseUrlRules.supportsV1AutoVariant
    ? withBaseVariants(normalizedBase)
    : [withNoTrailingSlash(normalizedBase)].filter(Boolean)
  const normalizedPath = normalizeModelsPath(modelsPath || provider.defaultModelsPath)

  const headers: Record<string, string> = {}
  if (apiKey) {
    if (provider.authSchemes.includes('bearer')) {
      headers.Authorization = `Bearer ${apiKey}`
    }
    if (provider.authSchemes.includes('x-api-key')) {
      headers['x-api-key'] = apiKey
    }
    if (provider.authSchemes.includes('x-goog-api-key')) {
      headers['x-goog-api-key'] = apiKey
    }
  }
  if (provider.authSchemes.includes('anthropic-version')) {
    headers['anthropic-version'] = '2023-06-01'
  }

  return Array.from(new Set(candidateBases.map((base) => joinBaseAndModelsPath(base, normalizedPath)))).map((url) => ({
    url,
    headers
  }))
}

export async function listAvailableModels(config: ModelListConfig): Promise<string[]> {
  const apiKey = (config.apiKey || '').trim()
  const baseURL = (config.baseURL || '').trim()
  const style = normalizeApiStyle(config.apiStyle)
  const modelsPath = (config.modelsPath || '').trim()

  if (!baseURL) throw new Error('请先填写 Base URL')

  const requests = buildModelListRequests(style, baseURL, apiKey, modelsPath)
  let lastErrorMessage = '未获取到可用模型，请检查 API 风格与 Base URL 是否匹配'

  for (const request of requests) {
    try {
      const response = await fetch(request.url, { method: 'GET', headers: request.headers })
      const data = await parseResponseJson(response)

      if (!response.ok) {
        lastErrorMessage = extractErrorMessage(data, `获取模型列表失败：HTTP ${response.status}`)
        continue
      }

      const models = collectModelIds(data)
      if (models.length > 0) return models

      lastErrorMessage = '未获取到可用模型，请检查 API 风格与 Base URL 是否匹配'
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : '获取模型列表失败'
    }
  }

  throw new Error(`获取模型列表失败（已尝试带 /v1 与不带 /v1 两种路径）：${lastErrorMessage}`)
}
