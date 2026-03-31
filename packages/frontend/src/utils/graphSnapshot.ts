import type { Node, NodeVersion } from '../types'
import type { SourceHighlight } from '../types/canvas'
import { MAX_NODE_VERSIONS } from '../types/canvas'
import { getNodeWidth, getNodeHeight } from './nodeDimension'

export function getNextVersions(versions: NodeVersion[], previousContent: string): NodeVersion[] {
  const trimmed = previousContent.trim()
  if (!trimmed) return versions
  const latest = versions[versions.length - 1]
  if (latest?.content === previousContent) return versions
  const next = [...versions, { content: previousContent, timestamp: new Date().toISOString() }]
  return next.slice(-MAX_NODE_VERSIONS)
}

export function buildNodeSnapshots(rfNodes: any[], rfEdges: any[]): Node[] {
  const now = new Date().toISOString()
  return rfNodes.map((n) => ({
    id: n.id,
    content: n.data.content || '',
    thinking: n.data.thinking || '',
    question: n.data.question || '',
    position: n.position,
    width: getNodeWidth(n),
    height: getNodeHeight(n),
    parentIds: rfEdges.filter((e) => e.target === n.id).map((e) => e.source),
    createdAt: n.data.createdAt || now,
    updatedAt: n.data.updatedAt || n.data.createdAt || now,
    tags: n.data.tags || [],
    note: n.data.note || '',
    versions: n.data.versions || [],
    expansionColor: n.data.expansionColor,
    sourceRef: n.data.sourceRef,
    images: n.data.images || [],
    attachments: n.data.attachments || []
  }))
}

export function buildSourceHighlightMap(nodes: Node[]): Map<string, SourceHighlight[]> {
  const map = new Map<string, Map<string, SourceHighlight>>()
  nodes.forEach((node) => {
    const parentId = node.parentIds[0]
    if (!parentId || !node.sourceRef) return
    const current = map.get(parentId) || new Map<string, SourceHighlight>()
    const key = `${node.sourceRef.upstreamFingerprintBase64}:${node.sourceRef.rangeStart}:${node.sourceRef.rangeEnd}`
    const existing = current.get(key)
    if (existing) {
      const nextTargets = new Set([...(existing.targetNodeIds || []), node.id])
      existing.targetNodeIds = Array.from(nextTargets)
      return
    }

    current.set(key, {
      ...node.sourceRef,
      color: node.expansionColor || '#3b82f6',
      targetNodeIds: [node.id]
    })
    map.set(parentId, current)
  })

  const result = new Map<string, SourceHighlight[]>()
  map.forEach((group, parentId) => {
    result.set(parentId, Array.from(group.values()))
  })
  return result
}
