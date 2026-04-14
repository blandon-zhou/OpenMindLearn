import type { NodeImage } from '../../../types/index.js'
import { extractAnswerAndThinking } from '../parsing/thinkingExtractor.js'
import { asText } from '../parsing/normalize.js'
import type { AnthropicMessageResponse, GeneratedAnswer, ResolvedConfig } from '../types.js'

function withNoTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function toAnthropicContent(prompt: string, images?: NodeImage[]): string | Array<Record<string, unknown>> {
  if (!images || images.length === 0) {
    return prompt
  }

  return [
    { type: 'text', text: prompt },
    ...images.map((img) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mimeType,
        data: img.base64
      }
    }))
  ]
}

function clampAnthropicTemperature(value: number): number {
  return Math.max(0, Math.min(1, value))
}

const DEFAULT_ANTHROPIC_MAX_TOKENS = 4096

export function buildAnthropicPayload(
  cfg: ResolvedConfig,
  prompt: string,
  images?: NodeImage[]
) {
  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: typeof cfg.maxTokens === 'number' ? cfg.maxTokens : DEFAULT_ANTHROPIC_MAX_TOKENS,
    system: cfg.systemPrompt,
    messages: [
      {
        role: 'user',
        content: toAnthropicContent(prompt, images)
      }
    ]
  }
  if (typeof cfg.temperature === 'number') {
    body.temperature = clampAnthropicTemperature(cfg.temperature)
  }

  return {
    url: `${withNoTrailingSlash(cfg.baseURL)}/messages`,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body
  }
}

function collectTextLike(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== 'object') return ''
        const record = item as Record<string, unknown>
        return asText(record.text || record.content || record.value)
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

export function normalizeAnthropicResponse(data: AnthropicMessageResponse, answerAnchorKeywords: string[]): GeneratedAnswer {
  const fallbackText = asText((data as Record<string, unknown>).output_text || (data as Record<string, unknown>).text).trim()
  if (fallbackText) {
    return extractAnswerAndThinking(fallbackText, answerAnchorKeywords)
  }

  const contentList = Array.isArray(data.content) ? data.content : []
  if (contentList.length === 0) return { content: '' }

  const answerParts: string[] = []
  const thinkingParts: string[] = []

  contentList.forEach((part) => {
    if (typeof part === 'string') {
      if (part.trim()) answerParts.push(part)
      return
    }

    const partType = asText(part?.type).toLowerCase()
    const text = collectTextLike(part?.text || part?.content || part?.value).trim()
    const thinking = collectTextLike(part?.thinking || part?.reasoning || part?.analysis).trim()

    if (thinking) thinkingParts.push(thinking)
    if (!text) return

    if (/(reason|think|analysis)/i.test(partType)) {
      thinkingParts.push(text)
    } else {
      answerParts.push(text)
    }
  })

  const parsed = extractAnswerAndThinking(answerParts.join('\n').trim(), answerAnchorKeywords)
  const allThinking = [...thinkingParts]
  if (parsed.thinking) allThinking.push(parsed.thinking)

  return {
    content: parsed.content,
    thinking: allThinking.join('\n\n').trim() || undefined
  }
}
