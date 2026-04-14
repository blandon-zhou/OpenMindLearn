import type { ApiStyle, ResolvedConfig } from './types.js'

const STYLE_DEFAULT_PATHS: Record<ApiStyle, string[]> = {
  openai_chat: ['/openai/v1', '/v1', ''],
  openai_response: ['/openai/v1', '/v1', ''],
  anthropic: ['/anthropic/v1', '/v1', ''],
  google_gemini: ['/gemini/v1', '/gemini/v1beta', '/v1', '/v1beta', '']
}

const KNOWN_FAMILY_SUFFIXES = [
  '/gemini/v1beta',
  '/openai/v1',
  '/anthropic/v1',
  '/gemini/v1',
  '/v1beta',
  '/v1'
]

function withNoTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function normalizePath(value: string): string {
  const trimmed = (value || '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function splitKnownSuffix(baseURL: string): { root: string; suffix: string } {
  const lower = baseURL.toLowerCase()
  for (const suffix of KNOWN_FAMILY_SUFFIXES) {
    if (!lower.endsWith(suffix)) continue
    return {
      root: baseURL.slice(0, baseURL.length - suffix.length),
      suffix
    }
  }
  return { root: baseURL, suffix: '' }
}

function isEndpointNotFound(status: number, message: string): boolean {
  if (status === 404 || status === 405) return true
  return /(endpoint not found|not found|no route|no handler|unknown endpoint|404)/i.test(message)
}

export function shouldRetryWithNextBase(status: number, message: string): boolean {
  return isEndpointNotFound(status, message)
}

export function resolveRequestBaseCandidates(cfg: ResolvedConfig, style: ApiStyle): string[] {
  const baseURL = withNoTrailingSlash(cfg.baseURL)
  if (!baseURL) return []

  const explicitPath = normalizePath(cfg.requestPathByStyle[style] || '')
  const candidates = new Set<string>()

  if (explicitPath) {
    if (baseURL.toLowerCase().endsWith(explicitPath.toLowerCase())) {
      candidates.add(baseURL)
    } else {
      candidates.add(`${baseURL}${explicitPath}`)
      candidates.add(baseURL)
    }
    return Array.from(candidates)
  }

  const preferredPaths = STYLE_DEFAULT_PATHS[style]
  const { root, suffix } = splitKnownSuffix(baseURL)

  if (suffix) {
    candidates.add(baseURL)
    preferredPaths.forEach((path) => {
      const normalized = normalizePath(path)
      candidates.add(normalized ? `${root}${normalized}` : root)
    })
    return Array.from(candidates)
  }

  preferredPaths.forEach((path) => {
    const normalized = normalizePath(path)
    candidates.add(normalized ? `${baseURL}${normalized}` : baseURL)
  })
  candidates.add(baseURL)

  return Array.from(candidates)
}
