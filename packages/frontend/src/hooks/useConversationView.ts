import { useCallback, useMemo } from 'react'

export interface ConversationNodeSnapshot {
  id: string
  question: string
  content: string
  thinking: string
  createdAt: string
  updatedAt: string
  isGenerating: boolean
}

export interface ConversationTurn {
  nodeId: string
  parentNodeId: string | null
  question: string
  content: string
  thinking: string
  isGenerating: boolean
  childBranchIds: string[]
  activeChildId: string | null
}

function toTimestamp(value: string | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function byLatestTimeDesc(
  leftId: string,
  rightId: string,
  timestampMap: Map<string, number>
): number {
  const diff = (timestampMap.get(rightId) || 0) - (timestampMap.get(leftId) || 0)
  if (diff !== 0) return diff
  return rightId.localeCompare(leftId)
}

export function useConversationView(
  rfNodes: Array<{ id: string; data?: Record<string, unknown> }>,
  rfEdges: Array<{ source: string; target: string }>,
  activeNodeId: string | null
) {
  const nodeById = useMemo(() => {
    const map = new Map<string, ConversationNodeSnapshot>()
    rfNodes.forEach((node) => {
      const question = String(node.data?.question || '')
      const content = String(node.data?.content || '')
      const thinking = String(node.data?.thinking || '')
      const createdAt = String(node.data?.createdAt || '')
      const updatedAt = String(node.data?.updatedAt || createdAt || '')
      const isGenerating = Boolean(node.data?.isGenerating)
      map.set(node.id, {
        id: node.id,
        question,
        content,
        thinking,
        createdAt,
        updatedAt,
        isGenerating
      })
    })
    return map
  }, [rfNodes])

  const timestampById = useMemo(() => {
    const map = new Map<string, number>()
    nodeById.forEach((node, nodeId) => {
      map.set(nodeId, toTimestamp(node.updatedAt || node.createdAt))
    })
    return map
  }, [nodeById])

  const parentIdsByNodeId = useMemo(() => {
    const map = new Map<string, string[]>()
    nodeById.forEach((_, nodeId) => map.set(nodeId, []))
    rfEdges.forEach((edge) => {
      if (!map.has(edge.target)) return
      const list = map.get(edge.target)!
      if (edge.source && !list.includes(edge.source)) {
        list.push(edge.source)
      }
    })
    return map
  }, [nodeById, rfEdges])

  const childIdsByNodeId = useMemo(() => {
    const map = new Map<string, string[]>()
    nodeById.forEach((_, nodeId) => map.set(nodeId, []))
    parentIdsByNodeId.forEach((parentIds, childId) => {
      parentIds.forEach((parentId) => {
        if (!map.has(parentId)) {
          map.set(parentId, [])
        }
        const children = map.get(parentId)!
        if (!children.includes(childId)) {
          children.push(childId)
        }
      })
    })
    return map
  }, [nodeById, parentIdsByNodeId])

  const sortedChildIdsByNodeId = useMemo(() => {
    const map = new Map<string, string[]>()
    childIdsByNodeId.forEach((childIds, nodeId) => {
      const sorted = [...childIds].sort((leftId, rightId) => byLatestTimeDesc(leftId, rightId, timestampById))
      map.set(nodeId, sorted)
    })
    return map
  }, [childIdsByNodeId, timestampById])

  const latestNodeId = useMemo(() => {
    if (nodeById.size === 0) return null
    return [...nodeById.keys()].sort((leftId, rightId) => byLatestTimeDesc(leftId, rightId, timestampById))[0] || null
  }, [nodeById, timestampById])

  const resolvedActiveNodeId = useMemo(() => {
    if (activeNodeId && nodeById.has(activeNodeId)) return activeNodeId
    return latestNodeId
  }, [activeNodeId, latestNodeId, nodeById])

  const activeChainNodeIds = useMemo(() => {
    if (!resolvedActiveNodeId) return []
    const visited = new Set<string>()
    const chain: string[] = []
    let cursor: string | null = resolvedActiveNodeId

    while (cursor && !visited.has(cursor)) {
      chain.unshift(cursor)
      visited.add(cursor)
      const parents: string[] = parentIdsByNodeId.get(cursor) || []
      cursor = parents[0] || null
    }

    return chain
  }, [resolvedActiveNodeId, parentIdsByNodeId])

  const nextNodeIdOnActiveChainByNodeId = useMemo(() => {
    const map = new Map<string, string>()
    for (let index = 0; index < activeChainNodeIds.length - 1; index += 1) {
      map.set(activeChainNodeIds[index], activeChainNodeIds[index + 1])
    }
    return map
  }, [activeChainNodeIds])

  const turns = useMemo<ConversationTurn[]>(() => {
    return activeChainNodeIds.map((nodeId) => {
      const node = nodeById.get(nodeId)
      const parentIds = parentIdsByNodeId.get(nodeId) || []
      return {
        nodeId,
        parentNodeId: parentIds[0] || null,
        question: node?.question || '',
        content: node?.content || '',
        thinking: node?.thinking || '',
        isGenerating: Boolean(node?.isGenerating),
        childBranchIds: sortedChildIdsByNodeId.get(nodeId) || [],
        activeChildId: nextNodeIdOnActiveChainByNodeId.get(nodeId) || null
      }
    })
  }, [activeChainNodeIds, nextNodeIdOnActiveChainByNodeId, nodeById, parentIdsByNodeId, sortedChildIdsByNodeId])

  const resolveBranchLeafNodeId = useCallback((startNodeId: string) => {
    if (!nodeById.has(startNodeId)) return startNodeId

    const visited = new Set<string>()
    let cursor = startNodeId

    while (!visited.has(cursor)) {
      visited.add(cursor)
      const nextChildren = sortedChildIdsByNodeId.get(cursor) || []
      if (nextChildren.length === 0) return cursor
      cursor = nextChildren[0]
    }

    return cursor
  }, [nodeById, sortedChildIdsByNodeId])

  const getNodePreviewLabel = useCallback((nodeId: string) => {
    const node = nodeById.get(nodeId)
    if (!node) return nodeId
    const question = node.question.trim()
    if (question) return question.slice(0, 36)
    const content = node.content.trim()
    if (content) return content.slice(0, 36)
    return nodeId
  }, [nodeById])

  return {
    nodeById,
    turns,
    latestNodeId,
    activeNodeId: resolvedActiveNodeId,
    resolveBranchLeafNodeId,
    getNodePreviewLabel
  }
}
