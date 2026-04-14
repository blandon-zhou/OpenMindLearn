import type { NodeImage } from '../../types/index.js'
import { buildAnthropicPayload, normalizeAnthropicResponse } from './adapters/anthropic.js'
import { buildGoogleGeminiPayload, normalizeGoogleResponse } from './adapters/googleGemini.js'
import { buildOpenAIChatPayload, normalizeOpenAIResponse } from './adapters/openaiChat.js'
import { buildOpenAIResponsesPayload } from './adapters/openaiResponses.js'
import { getLLMConfig, getResolvedConfig, resolveRuntimeApiKeySource, setLLMConfig } from './config.js'
import { resolveRequestBaseCandidates, shouldRetryWithNextBase } from './endpointRouting.js'
import { buildContextPromptFromTemplates, buildExpandPromptFromTemplates } from './prompts.js'
import { getProviderDefinitionByApiStyle } from './providerRegistry.js'
import { createProfileHealth, createRuntimeSnapshot } from './runtimeState.js'
import { extractErrorMessage, parseResponseJson } from './transport.js'
import type {
  AnthropicMessageResponse,
  ApiStyle,
  ChatCompletionResponse,
  ExpandMode,
  GeneratedAnswer,
  GoogleGenerateResponse,
  ProfileHealth,
  PromptTemplates,
  RequestPathByStyle,
  ResolvedConfig,
  RuntimeKeySource,
  RuntimeSnapshot,
  RuntimeSyncState
} from './types.js'
import { listAvailableModels } from './models.js'

export type {
  ApiStyle,
  ExpandMode,
  GeneratedAnswer,
  ProfileHealth,
  PromptTemplates,
  RequestPathByStyle,
  RuntimeKeySource,
  RuntimeSnapshot,
  RuntimeSyncState
}

export { setLLMConfig, getLLMConfig }
export { listAvailableModels }
export { getProviderDefinitionByApiStyle, createRuntimeSnapshot, createProfileHealth, resolveRuntimeApiKeySource }

export function buildExpandPrompt(text: string, mode: ExpandMode = 'direct'): string {
  const cfg = getResolvedConfig()
  return buildExpandPromptFromTemplates(text, mode, cfg.promptTemplates)
}

function buildContextPrompt(prompt: string, contextXml: string): string {
  const cfg = getResolvedConfig()
  return buildContextPromptFromTemplates(prompt, contextXml, cfg.promptTemplates)
}

function assertConfigured(cfg: ResolvedConfig): void {
  if (!cfg.apiKey.trim()) {
    throw new Error('未配置 API Key，请在设置中重新保存当前配置')
  }
  if (!cfg.baseURL.trim()) {
    throw new Error('未配置 Base URL，请在设置中填写完整地址（例如 https://api.openai.com/v1）')
  }
  if (!cfg.model.trim()) {
    throw new Error('未配置模型名称，请在设置中填写 Model')
  }
}

function assertAbsoluteUrl(url: string): void {
  try {
    new URL(url)
  } catch {
    throw new Error('Base URL 配置无效，请填写完整地址（例如 https://api.openai.com/v1）')
  }
}

interface FetchPayload {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

interface RetryResult {
  success: boolean
  data?: unknown
  error?: string
}

async function fetchWithRetry(
  payload: FetchPayload,
  attemptStyle: ApiStyle,
  errorPrefix: string
): Promise<RetryResult> {
  assertAbsoluteUrl(payload.url)
  let retriedServerError = false

  while (true) {
    const response = await fetch(payload.url, {
      method: 'POST',
      headers: payload.headers,
      body: JSON.stringify(payload.body)
    })
    const data = await parseResponseJson(response)

    if (!response.ok) {
      const message = extractErrorMessage(data, `${errorPrefix}：HTTP ${response.status}`)
      const messageWithEndpoint = `${message} (style: ${attemptStyle}, endpoint: ${payload.url})`

      if (!retriedServerError && response.status >= 500) {
        retriedServerError = true
        continue
      }

      const shouldRetry = response.status >= 500 || shouldRetryWithNextBase(response.status, message)
      return {
        success: false,
        error: messageWithEndpoint,
        data: shouldRetry ? undefined : new Error(messageWithEndpoint)
      }
    }

    return { success: true, data }
  }
}

async function generateByStyle(prompt: string, images?: NodeImage[]): Promise<GeneratedAnswer> {
  const cfg = getResolvedConfig()
  assertConfigured(cfg)
  let lastErrorMessage = ''
  const candidateFailures: string[] = []
  const styleCandidates: ApiStyle[] = [cfg.apiStyle]
  if (cfg.apiStyle === 'google_gemini') {
    styleCandidates.push('openai_chat')
  }

  for (const attemptStyle of styleCandidates) {
    const baseCandidates = resolveRequestBaseCandidates(cfg, attemptStyle)
    for (const candidateBase of baseCandidates) {
      const scoped = { ...cfg, apiStyle: attemptStyle, baseURL: candidateBase }

      let payload: FetchPayload
      let normalizer: (data: any, keywords: string[]) => GeneratedAnswer
      let errorPrefix: string

      if (scoped.apiStyle === 'google_gemini') {
        payload = buildGoogleGeminiPayload(scoped, prompt, images)
        normalizer = normalizeGoogleResponse
        errorPrefix = 'Google API 请求失败'
      } else if (scoped.apiStyle === 'anthropic') {
        payload = buildAnthropicPayload(scoped, prompt, images)
        normalizer = normalizeAnthropicResponse
        errorPrefix = 'Anthropic API 请求失败'
      } else {
        payload = scoped.apiStyle === 'openai_response'
          ? buildOpenAIResponsesPayload(scoped, prompt, images)
          : buildOpenAIChatPayload(scoped, prompt, images)
        normalizer = normalizeOpenAIResponse
        errorPrefix = 'LLM 请求失败'
      }

      const result = await fetchWithRetry(payload, attemptStyle, errorPrefix)

      if (result.success) {
        return normalizer(result.data, scoped.answerAnchorKeywords)
      }

      lastErrorMessage = result.error!
      candidateFailures.push(result.error!)
      if (result.data instanceof Error) {
        throw result.data
      }
    }
  }

  if (candidateFailures.length > 0) {
    const allEndpointNotFound = candidateFailures.every((item) => /endpoint not found/i.test(item))
    if (cfg.apiStyle === 'google_gemini' && allEndpointNotFound) {
      throw new Error(
        `LLM 请求失败：已尝试 ${candidateFailures.length} 个端点；最后错误：${lastErrorMessage}；` +
        '提示：已自动回退尝试 OpenAI Chat 协议但仍失败；该网关的 Gemini 路由通常按模型白名单发布，请确认当前模型已发布可用于对应协议'
      )
    }
    throw new Error(`LLM 请求失败：已尝试 ${candidateFailures.length} 个端点；最后错误：${lastErrorMessage}`)
  }
  throw new Error(lastErrorMessage || 'LLM 请求失败：无法匹配可用端点')
}

export async function generateContent(prompt: string, images?: NodeImage[]): Promise<GeneratedAnswer> {
  return generateByStyle(prompt, images)
}

export async function generateWithContext(
  prompt: string,
  contextXml: string,
  images?: NodeImage[]
): Promise<GeneratedAnswer> {
  const fullPrompt = buildContextPrompt(prompt, contextXml)
  return generateByStyle(fullPrompt, images)
}
