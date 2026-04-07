import { Node, SourceReference, Region, NodeImage } from '../types'
import type { ApiStyle, ExpandMode, PromptTemplates } from '../stores/settingsStore'

const API_BASE = window.omlDesktop?.apiBase || '/api'

async function parseJsonOrThrow(res: Response) {
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`)
  }
  return data
}

export async function generateNode(prompt: string, images?: NodeImage[]) {
  const res = await fetch(`${API_BASE}/nodes/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, images })
  })
  return parseJsonOrThrow(res)
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
  images?: NodeImage[]
) {
  const res = await fetch(`${API_BASE}/nodes/expand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, parentId, allNodes, selectedNodeIds, sourceRef, expandMode, contextMaxDepth, images })
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
}) {
  const res = await fetch(`${API_BASE}/config/llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  })
  return parseJsonOrThrow(res)
}

export async function listAvailableModels(config: {
  apiKey: string
  baseURL: string
  apiStyle: ApiStyle
}) {
  const res = await fetch(`${API_BASE}/config/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  })
  return parseJsonOrThrow(res) as Promise<{ models: string[] }>
}
