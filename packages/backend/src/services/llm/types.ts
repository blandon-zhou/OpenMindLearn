import type { NodeImage } from '../../types/index.js'

export type ExpandMode = 'direct' | 'targeted'
export type ApiStyle = 'openai_chat' | 'google_gemini' | 'anthropic' | 'openai_response'

export interface PromptTemplates {
  directExpand: string
  targetedQuestion: string
  contextEnvelope: string
}

export interface RuntimeConfig {
  apiKey?: string
  baseURL?: string
  model?: string
  apiStyle?: ApiStyle
  answerAnchorKeywords?: string[]
  temperature?: number
  maxTokens?: number
  contextMaxDepth?: number
  systemPrompt?: string
  promptTemplates?: Partial<PromptTemplates>
}

export interface ResolvedConfig {
  apiKey: string
  baseURL: string
  model: string
  apiStyle: ApiStyle
  answerAnchorKeywords: string[]
  temperature: number
  maxTokens: number
  contextMaxDepth: number
  systemPrompt: string
  promptTemplates: PromptTemplates
}

export interface ChatCompletionMessage {
  content?: string | Array<Record<string, unknown> | string>
  reasoning_content?: string
  reasoning?: string
}

export interface ChatCompletionChoice {
  message?: ChatCompletionMessage
  reasoning_content?: string
}

export interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[]
  output?: Array<Record<string, unknown>>
  output_text?: string
}

export interface GoogleGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
        thought?: boolean
        thoughtSignature?: string
      }>
    }
  }>
}

export interface AnthropicMessageResponse {
  content?: Array<Record<string, unknown> | string>
}

export interface GeneratedAnswer {
  content: string
  thinking?: string
}

export interface HttpPayload {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

export type NodeImages = NodeImage[] | undefined
