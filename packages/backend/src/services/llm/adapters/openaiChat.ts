import type { NodeImage } from '../../../types/index.js'
import { extractAnswerAndThinking } from '../parsing/thinkingExtractor.js'
import { asText } from '../parsing/normalize.js'
import type { ChatCompletionChoice, ChatCompletionResponse, GeneratedAnswer, ResolvedConfig } from '../types.js'

function withNoTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function buildOpenAIChatPayload(
  cfg: ResolvedConfig,
  prompt: string,
  images?: NodeImage[]
) {
  const userContent = images && images.length > 0
    ? [
        { type: 'text' as const, text: prompt },
        ...images.map(img => ({
          type: 'image_url' as const,
          image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
        }))
      ]
    : prompt

  return {
    url: `${withNoTrailingSlash(cfg.baseURL)}/chat/completions`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`
    },
    body: {
      model: cfg.model,
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      messages: [
        {
          role: 'system',
          content: cfg.systemPrompt
        },
        { role: 'user', content: userContent }
      ]
    }
  }
}

function normalizeMessagePayload(choice: ChatCompletionChoice | undefined, answerAnchorKeywords: string[]): GeneratedAnswer {
  const message = choice?.message
  if (!message) return { content: '' }

  const externalThinking: string[] = []
  const pushExternalThinking = (value: unknown) => {
    const text = asText(value).trim()
    if (text) externalThinking.push(text)
  }

  pushExternalThinking(message.reasoning_content)
  pushExternalThinking(message.reasoning)
  pushExternalThinking(choice?.reasoning_content)

  let contentText = ''
  if (typeof message.content === 'string') {
    contentText = message.content
  } else if (Array.isArray(message.content)) {
    const answerParts: string[] = []
    const thinkingParts: string[] = []

    message.content.forEach((part) => {
      if (typeof part === 'string') {
        if (part.trim()) answerParts.push(part)
        return
      }
      if (!part || typeof part !== 'object') return

      const type = asText((part as Record<string, unknown>).type).toLowerCase()
      const text = asText(
        (part as Record<string, unknown>).text
        || (part as Record<string, unknown>).content
        || (part as Record<string, unknown>).value
      ).trim()
      if (!text) return

      if (/(reason|think|analysis)/i.test(type)) {
        thinkingParts.push(text)
      } else {
        answerParts.push(text)
      }
    })

    if (thinkingParts.length > 0) {
      externalThinking.push(thinkingParts.join('\n\n'))
    }
    contentText = answerParts.join('\n').trim()
  }

  const parsed = extractAnswerAndThinking(contentText, answerAnchorKeywords)
  const allThinking = [...externalThinking]
  if (parsed.thinking) allThinking.push(parsed.thinking)

  return {
    content: parsed.content,
    thinking: allThinking.join('\n\n').trim() || undefined
  }
}

function normalizeOutputPayload(output: Array<Record<string, unknown>> | undefined, answerAnchorKeywords: string[]): GeneratedAnswer {
  if (!Array.isArray(output) || output.length === 0) return { content: '' }

  const thinkingParts: string[] = []
  const answerParts: string[] = []

  output.forEach((item) => {
    const itemType = asText(item?.type).toLowerCase()
    const contentList = Array.isArray(item?.content) ? item.content : []

    if (itemType.includes('reason')) {
      const summary = asText((item as Record<string, unknown>).summary).trim()
      if (summary) thinkingParts.push(summary)
    }

    if (contentList.length > 0) {
      contentList.forEach((part) => {
        if (!part || typeof part !== 'object') return
        const partRecord = part as Record<string, unknown>
        const partType = asText(partRecord.type).toLowerCase()
        const text = asText(partRecord.text || partRecord.content || partRecord.summary).trim()
        if (!text) return
        if (/(reason|think|analysis)/i.test(partType)) {
          thinkingParts.push(text)
        } else {
          answerParts.push(text)
        }
      })
      return
    }

    const directText = asText(item?.text || item?.content).trim()
    if (!directText) return
    if (/(reason|think|analysis)/i.test(itemType)) {
      thinkingParts.push(directText)
    } else {
      answerParts.push(directText)
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

export function normalizeOpenAIResponse(data: ChatCompletionResponse, answerAnchorKeywords: string[]): GeneratedAnswer {
  const outputText = asText(data.output_text).trim()
  if (outputText) {
    return extractAnswerAndThinking(outputText, answerAnchorKeywords)
  }

  if (Array.isArray(data.output) && data.output.length > 0) {
    return normalizeOutputPayload(data.output, answerAnchorKeywords)
  }
  return normalizeMessagePayload(data.choices?.[0], answerAnchorKeywords)
}
