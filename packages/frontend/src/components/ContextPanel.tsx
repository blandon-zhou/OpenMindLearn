import { useState, useEffect } from 'react'
import { X, Check } from 'lucide-react'
import { Node } from '../types'
import { useI18n } from '../hooks/useI18n'
import { Z_INDEX } from '../utils/zIndex'

interface ContextPanelProps {
  currentNodeId: string
  allNodes: Node[]
  onDirectExpand: (selectedNodeIds: string[]) => void
  onTargetedQuestion: (selectedNodeIds: string[]) => void
  onClose: () => void
}

export function ContextPanel({ currentNodeId, allNodes, onDirectExpand, onTargetedQuestion, onClose }: ContextPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [upstreamNodes, setUpstreamNodes] = useState<Node[]>([])
  const { t } = useI18n()

  useEffect(() => {
    const nodeMap = new Map(allNodes.map(n => [n.id, n]))
    const allUpstreamIds = new Set<string>([currentNodeId])
    const distanceFromCurrent = new Map<string, number>([[currentNodeId, 0]])
    const visited = new Set<string>()
    const stack: Array<{ id: string; depth: number }> = [{ id: currentNodeId, depth: 0 }]

    while (stack.length > 0) {
      const current = stack.pop()
      if (!current) continue
      if (visited.has(current.id)) continue
      visited.add(current.id)

      const node = nodeMap.get(current.id)
      if (!node || !node.parentIds || node.parentIds.length === 0) continue

      node.parentIds.forEach((parentId) => {
        allUpstreamIds.add(parentId)
        const nextDepth = current.depth + 1
        if (!distanceFromCurrent.has(parentId)) {
          distanceFromCurrent.set(parentId, nextDepth)
        }
        if (!visited.has(parentId)) stack.push({ id: parentId, depth: nextDepth })
      })
    }

    const ordered = Array.from(allUpstreamIds)
      .map((id) => nodeMap.get(id))
      .filter((node): node is Node => Boolean(node))
      .sort((a, b) => {
        const depthA = distanceFromCurrent.get(a.id) ?? 0
        const depthB = distanceFromCurrent.get(b.id) ?? 0
        if (depthA !== depthB) return depthB - depthA
        return (a.createdAt || '').localeCompare(b.createdAt || '')
      })

    setUpstreamNodes(ordered)
    // 默认全部选中
    setSelectedIds(new Set(ordered.map(n => n.id)))
  }, [currentNodeId, allNodes])

  const toggleNode = (nodeId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      return newSet
    })
  }

  const getConfirmedIds = () => {
    return upstreamNodes.filter((node) => selectedIds.has(node.id)).map((node) => node.id)
  }

  const handleDirectExpand = () => {
    onDirectExpand(getConfirmedIds())
  }

  const handleTargetedQuestion = () => {
    onTargetedQuestion(getConfirmedIds())
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center"
      style={{ zIndex: Z_INDEX.canvasModal }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="bg-background text-foreground rounded-lg border border-border shadow-xl w-[600px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{t('context.title')}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-accent rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 节点列表 */}
        <div className="flex-1 overflow-y-auto p-4">
          {upstreamNodes.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{t('context.none')}</p>
          ) : (
            <div className="space-y-2">
              {upstreamNodes.map((node, index) => {
                const isSelected = selectedIds.has(node.id)
                const summary = node.content.slice(0, 100) + (node.content.length > 100 ? '...' : '')

                return (
                  <div
                    key={node.id}
                    onClick={() => toggleNode(node.id)}
                    className={`p-3 border rounded cursor-pointer transition-colors ${
                      isSelected ? 'bg-primary/10 border-primary/40' : 'hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 border-2 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isSelected ? 'bg-primary border-primary' : 'border-border'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-muted-foreground">{t('context.nodeLabel', { index: index + 1 })}</span>
                          {node.id === currentNodeId && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-primary/15 text-primary">{t('common.current')}</span>
                          )}
                          <span className="text-xs text-muted-foreground/80">{node.id.slice(0, 8)}</span>
                        </div>
                        <p className="text-sm text-foreground/90 line-clamp-2">{summary}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between p-4 border-t bg-muted/35">
          <p className="text-sm text-muted-foreground">
            {t('context.selected', { selected: selectedIds.size, total: upstreamNodes.length })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleDirectExpand()
              }}
              disabled={selectedIds.size === 0}
              className="px-4 py-2 text-sm font-medium border border-border bg-background text-foreground hover:bg-accent rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('node.selection.direct')}
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleTargetedQuestion()
              }}
              disabled={selectedIds.size === 0}
              className="px-4 py-2 text-sm font-medium border border-border bg-background text-foreground hover:bg-accent rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('node.selection.targeted')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
