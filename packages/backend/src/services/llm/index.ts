import type { NodeImage } from '../../types/index.js'
import { buildAnthropicPayload, normalizeAnthropicResponse } from './adapters/anthropic.js'
import { buildGoogleGeminiPayload, normalizeGoogleResponse } from './adapters/googleGemini.js'
import { buildOpenAIChatPayload, normalizeOpenAIResponse } from './adapters/openaiChat.js'
import { buildOpenAIResponsesPayload } from './adapters/openaiResponses.js'
import { getLLMConfig, getResolvedConfig, setLLMConfig } from './config.js'
import { buildContextPromptFromTemplates, buildExpandPromptFromTemplates } from './prompts.js'
import { extractErrorMessage, parseResponseJson } from './transport.js'
import type { AnthropicMessageResponse, ChatCompletionResponse, ExpandMode, GeneratedAnswer, GoogleGenerateResponse, ApiStyle, PromptTemplates } from './types.js'

export type { ExpandMode, ApiStyle, PromptTemplates, GeneratedAnswer }

export { setLLMConfig, getLLMConfig }

export function buildExpandPrompt(text: string, mode: ExpandMode = 'direct'): string {
  const cfg = getResolvedConfig()
  return buildExpandPromptFromTemplates(text, mode, cfg.promptTemplates)
}

function buildContextPrompt(prompt: string, contextXml: string): string {
  const cfg = getResolvedConfig()
  return buildContextPromptFromTemplates(prompt, contextXml, cfg.promptTemplates)
}

async function generateByStyle(prompt: string, images?: NodeImage[]): Promise<GeneratedAnswer> {
  const cfg = getResolvedConfig()

  if (cfg.apiStyle === 'google_gemini') {
    const payload = buildGoogleGeminiPayload(cfg, prompt, images)
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
