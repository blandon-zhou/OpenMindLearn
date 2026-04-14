import type { NodeImage } from '../../../types/index.js'
import type { ResolvedConfig } from '../types.js'

function withNoTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function buildInput(prompt: string, images?: NodeImage[]): string | Array<Record<string, unknown>> {
  if (!images || images.length === 0) {
    return prompt
  }

  return [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: prompt },
        ...images.map((img) => ({
          type: 'input_image',
          image_url: `data:${img.mimeType};base64,${img.base64}`
        }))
      ]
    }
  ]
}

export function buildOpenAIResponsesPayload(
  cfg: ResolvedConfig,
  prompt: string,
  images?: NodeImage[]
) {
  const body: Record<string, unknown> = {
    model: cfg.model,
    instructions: cfg.systemPrompt,
    input: buildInput(prompt, images)
  }

  if (typeof cfg.temperature === 'number') {
    body.temperature = cfg.temperature
  }
  if (typeof cfg.maxTokens === 'number') {
    body.max_output_tokens = cfg.maxTokens
  }

  return {
    url: `${withNoTrailingSlash(cfg.baseURL)}/responses`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`
    },
    body
  }
}
