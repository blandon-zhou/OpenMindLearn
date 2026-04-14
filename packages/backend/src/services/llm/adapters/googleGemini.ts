import type { NodeImage } from '../../../types/index.js'
import { extractAnswerAndThinking } from '../parsing/thinkingExtractor.js'
import { asText } from '../parsing/normalize.js'
import type { GeneratedAnswer, GoogleGenerateResponse, ResolvedConfig } from '../types.js'

function withNoTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function shouldAttachBearer(baseURL: string): boolean {
  try {
    const hostname = new URL(baseURL).hostname.toLowerCase()
    return !hostname.endsWith('googleapis.com')
  } catch {
    return true
  }
}

function toGoogleBaseURL(baseURL: string): string {
  const normalized = withNoTrailingSlash(baseURL)

  // Replace known suffixes with /gemini/v1
  const replacements: [RegExp, string][] = [
    [/\/gemini\/v1beta$/i, '/gemini/v1'],
    [/\/gemini\/v1$/i, '/gemini/v1'],
    [/\/openai\/v1$/i, '/gemini/v1'],
    [/\/v1beta$/, '/gemini/v1'],
    [/\/v1$/, '/gemini/v1']
  ]

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(normalized)) {
      return normalized.replace(pattern, replacement)
    }
  }

  return normalized
}

export function buildGoogleGeminiPayload(
  cfg: ResolvedConfig,
  prompt: string,
  images?: NodeImage[]
) {
  const baseURL = toGoogleBaseURL(cfg.baseURL)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-goog-api-key': cfg.apiKey
  }
  if (shouldAttachBearer(baseURL)) {
    headers.Authorization = `Bearer ${cfg.apiKey}`
  }

  const parts = [
    { text: prompt },
    ...((images || []).map((img) => ({
      inlineData: {
        mimeType: img.mimeType,
        data: img.base64
      }
    })))
  ]

  const generationConfig: Record<string, unknown> = {
    thinkingConfig: {
      includeThoughts: true
    }
  }
  if (typeof cfg.temperature === 'number') {
    generationConfig.temperature = cfg.temperature
  }
  if (typeof cfg.maxTokens === 'number') {
    generationConfig.maxOutputTokens = cfg.maxTokens
  }

  return {
    url: `${baseURL}/models/${encodeURIComponent(cfg.model)}:generateContent`,
    headers,
    body: {
      systemInstruction: {
        parts: [{ text: cfg.systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts
        }
      ],
      generationConfig
    }
  }
}

export function normalizeGoogleResponse(data: GoogleGenerateResponse, answerAnchorKeywords: string[]): GeneratedAnswer {
  const parts = data.candidates?.[0]?.content?.parts || []
  const thinkingParts: string[] = []
  const answerParts: string[] = []

  parts.forEach((part) => {
    const text = asText(part?.text).trim()
    if (!text) return
    // Gemini-compatible gateways may include thoughtSignature on normal answer parts.
    // Only explicit thought=true should be classified as thinking text.
    if (part?.thought === true) {
      thinkingParts.push(text)
      return
    }
    answerParts.push(text)
  })

  const answerText = answerParts.join('\n').trim()
  const parsed = extractAnswerAndThinking(answerText, answerAnchorKeywords)
  const allThinking = [...thinkingParts]
  if (parsed.thinking) allThinking.push(parsed.thinking)

  return {
    content: parsed.content,
    thinking: allThinking.join('\n\n').trim() || undefined
  }
}
