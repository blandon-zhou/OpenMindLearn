import type { NodeImage } from '../../types/index.js'
import { buildAnthropicPayload, normalizeAnthropicResponse } from './adapters/anthropic.js'
import { buildGoogleGeminiPayload, normalizeGoogleResponse } from './adapters/googleGemini.js'
import { buildOpenAIChatPayload, normalizeOpenAIResponse } from './adapters/openaiChat.js'
import { buildOpenAIResponsesPayload } from './adapters/openaiResponses.js'
import { getLLMConfig, getResolvedConfig, resolveRuntimeApiKeySource, setLLMConfig } from './config.js'
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
    // Node fetch requires absolute URL.
    new URL(url)
  } catch {
    throw new Error('Base URL 配置无效，请填写完整地址（例如 https://api.openai.com/v1）')
  }
}

async function generateByStyle(prompt: string, images?: NodeImage[]): Promise<GeneratedAnswer> {
  const cfg = getResolvedConfig()
  assertConfigured(cfg)

  if (cfg.apiStyle === 'google_gemini') {
    const payload = buildGoogleGeminiPayload(cfg, prompt, images)
    assertAbsoluteUrl(payload.url)
    const response = await fetch(payload.url, {
      method: 'POST',
      headers: payload.headers,
      body: JSON.stringify(payload.body)
    })
    const data = await parseResponseJson(response)
    if (!response.ok) {
      throw new Error(extractErrorMessage(data, `Google API 请求失败：HTTP ${response.status}`))
    }
    return normalizeGoogleResponse(data as GoogleGenerateResponse, cfg.answerAnchorKeywords)
  }

  if (cfg.apiStyle === 'anthropic') {
    const payload = buildAnthropicPayload(cfg, prompt, images)
    assertAbsoluteUrl(payload.url)
    const response = await fetch(payload.url, {
      method: 'POST',
      headers: payload.headers,
      body: JSON.stringify(payload.body)
    })
    const data = await parseResponseJson(response)
    if (!response.ok) {
      throw new Error(extractErrorMessage(data, `Anthropic API 请求失败：HTTP ${response.status}`))
    }
    return normalizeAnthropicResponse(data as AnthropicMessageResponse, cfg.answerAnchorKeywords)
  }

  const payload = cfg.apiStyle === 'openai_response'
    ? buildOpenAIResponsesPayload(cfg, prompt, images)
    : buildOpenAIChatPayload(cfg, prompt, images)
  assertAbsoluteUrl(payload.url)
  const response = await fetch(payload.url, {
    method: 'POST',
    headers: payload.headers,
    body: JSON.stringify(payload.body)
  })
  const data = await parseResponseJson(response)
  if (!response.ok) {
    throw new Error(extractErrorMessage(data, `LLM 请求失败：HTTP ${response.status}`))
  }
  return normalizeOpenAIResponse(data as ChatCompletionResponse, cfg.answerAnchorKeywords)
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
