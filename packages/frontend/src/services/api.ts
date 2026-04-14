import { Node, SourceReference, Region, NodeImage } from '../types'
import type {
  ApiStyle,
  ExpandMode,
  ProfileHealth,
  PromptTemplates,
  RuntimeSnapshot
} from '../stores/settingsStore'

const API_BASE = window.omlDesktop?.apiBase || '/api'

async function parseJsonOrThrow(res: Response) {
  const rawText = await res.text()
  let data: any = null
  if (rawText) {
    try {
      data = JSON.parse(rawText)
    } catch {
      data = null
    }
  }
  if (!res.ok) {
    const message = data?.error || data?.message || rawText || `HTTP ${res.status}`
    throw new Error(String(message))
  }
  return data
}

export async function generateNode(prompt: string, images?: NodeImage[], signal?: AbortSignal) {
  const res = await fetch(`${API_BASE}/nodes/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, images }),
    signal
  })
  return parseJsonOrThrow(res)
}

export function isAbortError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof DOMException) return error.name === 'AbortError'
  if (error instanceof Error) return error.name === 'AbortError'
  return false
}

export function stripImagesFromNodes(nodes: Node[]): Node[] {
  return nodes.map(({ images, attachments, ...rest }) => rest) as Node[]
}

export async function expandNode(
  text: string,
  parentId: string,
  allNodes?: Node[],
  selectedNodeIds?: string[],
  sourceRef?: SourceReference,
  expandMode?: ExpandMode,
  contextMaxDepth?: number,
  images?: NodeImage[],
  signal?: AbortSignal
) {
  const res = await fetch(`${API_BASE}/nodes/expand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, parentId, allNodes, selectedNodeIds, sourceRef, expandMode, contextMaxDepth, images }),
    signal
  })
  return parseJsonOrThrow(res)
}

export async function saveFile(nodes: Node[], edges: any[], name: string, regions?: Region[]) {
  const res = await fetch(`${API_BASE}/files/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes, edges, regions, name })
  })
  return parseJsonOrThrow(res)
}

export async function loadFile(base64Data: string) {
  const res = await fetch(`${API_BASE}/files/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: base64Data })
  })
  return parseJsonOrThrow(res)
}

export async function updateLLMConfig(config: {
  apiKey?: string
  baseURL: string
  model: string
  apiStyle: ApiStyle
  answerAnchorKeywords: string[]
  temperature: number
  maxTokens: number
  contextMaxDepth: number
  systemPrompt: string
  promptTemplates: PromptTemplates
}) {
  const res = await fetch(`${API_BASE}/config/llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  })
  return parseJsonOrThrow(res) as Promise<{ success: boolean; hasApiKey: boolean }>
}

export async function getRuntimeLLMConfigStatus() {
  const res = await fetch(`${API_BASE}/config/llm/status`, {
    method: 'GET'
  })
  return parseJsonOrThrow(res) as Promise<{
    hasApiKey: boolean
    runtimeSnapshot?: RuntimeSnapshot
    health?: ProfileHealth
  }>
}

export async function syncRuntimeLLMConfig(payload: {
  profileId: string
  config: {
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
  apiKey?: string
  allowRuntimeApiKeyFallback?: boolean
}) {
  const res = await fetch(`${API_BASE}/config/llm/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return parseJsonOrThrow(res) as Promise<{
    success: boolean
    hasApiKey: boolean
    runtimeSnapshot: RuntimeSnapshot
    health: ProfileHealth
    diagnostics?: string[]
  }>
}

export async function getRuntimeConfigState(profileId?: string) {
  const query = profileId ? `?profileId=${encodeURIComponent(profileId)}` : ''
  const res = await fetch(`${API_BASE}/config/state${query}`, {
    method: 'GET'
  })
  return parseJsonOrThrow(res) as Promise<{
    runtimeSnapshot: RuntimeSnapshot
    health: ProfileHealth
    diagnostics?: string[]
  }>
}

export async function listAvailableModels(config: {
  apiKey: string
  baseURL: string
  apiStyle: ApiStyle
  modelsPath?: string
}) {
  const res = await fetch(`${API_BASE}/config/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  })
  return parseJsonOrThrow(res) as Promise<{ models: string[] }>
}
