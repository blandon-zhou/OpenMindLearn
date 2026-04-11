import { useCallback, useEffect, useRef } from 'react'
import { useNodesState, useEdgesState, useReactFlow, addEdge } from '@xyflow/react'
import { useGraphStore } from '../stores/graphStore'
import { useSettingsStore, type ExpandMode } from '../stores/settingsStore'
import { useToastStore } from '../stores/toastStore'
import { expandNode, generateNode, isAbortError, stripImagesFromNodes } from '../services/api'
import { getExpansionColor } from '../utils/colors'
import type { Node, SourceReference, Region, NodeVersion, NodeImage, NodeAttachment } from '../types'
import type { SourceHighlight, MetaEditorState, VersionDialogState } from '../types/canvas'
import {
  NODE_DEFAULT_WIDTH, NODE_DEFAULT_HEIGHT,
} from '../types/canvas'
import { toPlacementNode } from '../utils/nodeDimension'
import { calculateChildNodePosition, calculateInitialNodePosition } from '../utils/nodePosition'
import { getNextVersions, buildNodeSnapshots, buildSourceHighlightMap } from '../utils/graphSnapshot'
import { parseTags } from '../utils/search'
import { tFromSettings } from './useI18n'

export function useCanvasNodes(
  canvasRef: React.RefObject<HTMLDivElement>,
  regions: Region[]
) {
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([])
  const skipDirtyFlagRef = useRef(false)

  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow()
  const { setDirty } = useGraphStore()
  const { showToast } = useToastStore()
  const llmSettings = useSettingsStore((state) => state.llmSettings)
  const generationControllersRef = useRef(new Map<string, Set<AbortController>>())

  const registerGenerationController = useCallback((nodeId: string, controller: AbortController) => {
    const map = generationControllersRef.current
    const current = map.get(nodeId) || new Set<AbortController>()
    current.add(controller)
    map.set(nodeId, current)
    return controller
  }, [])

  const unregisterGenerationController = useCallback((nodeId: string, controller: AbortController) => {
    const map = generationControllersRef.current
    const current = map.get(nodeId)
    if (!current) return
    current.delete(controller)
    if (current.size === 0) {
      map.delete(nodeId)
    }
  }, [])

  const stopNodeGeneration = useCallback((nodeId: string) => {
    const current = generationControllersRef.current.get(nodeId)
    if (!current || current.size === 0) return 0
    const controllers = Array.from(current)
    controllers.forEach((controller) => controller.abort())
    return controllers.length
  }, [])

  const registerExternalGenerationController = useCallback((nodeId: string, controller: AbortController) => {
    registerGenerationController(nodeId, controller)
    return () => unregisterGenerationController(nodeId, controller)
  }, [registerGenerationController, unregisterGenerationController])

  const stopAllGenerations = useCallback(() => {
    let count = 0
    generationControllersRef.current.forEach((controllers) => {
      count += controllers.size
      controllers.forEach((controller) => controller.abort())
    })
    return count
  }, [])

  useEffect(() => {
    return () => {
      generationControllersRef.current.forEach((controllers) => {
        controllers.forEach((controller) => controller.abort())
      })
      generationControllersRef.current.clear()
    }
  }, [])

  const refreshNodeRuntimeData = useCallback((rfNodes: any[], edgeList: any[]) => {
    const snapshots = buildNodeSnapshots(rfNodes, edgeList)
    const highlightMap = buildSourceHighlightMap(snapshots)
    return rfNodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        allNodes: snapshots,
        sourceHighlights: highlightMap.get(node.id) || []
      }
    }))
  }, [])

  // Dirty flag tracking
  useEffect(() => {
    if (skipDirtyFlagRef.current) {
      skipDirtyFlagRef.current = false
      return
    }

    if (nodes.length === 0 && edges.length === 0 && regions.length === 0) {
      return
    }

    setDirty(true)
  }, [nodes, edges, regions, setDirty])

  const getCanvasCenterFlowPosition = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 200, y: 120 }
    return screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    })
  }, [canvasRef, screenToFlowPosition])

  const handleSaveNodeContent = useCallback((nodeId: string, nextContent: string) => {
    setNodes((nds) => {
      let changed = false
      const now = new Date().toISOString()
      const nextNodes = nds.map((node) => {
        if (node.id !== nodeId) return node
        const previousContent = node.data.content || ''
        if (previousContent === nextContent) return node
        changed = true
        return {
          ...node,
          data: {
            ...node.data,
            content: nextContent,
            isEditing: false,
            updatedAt: now,
            versions: getNextVersions(node.data.versions || [], previousContent)
          }
        }
      })

      if (!changed) return nds
      return refreshNodeRuntimeData(nextNodes, getEdges())
    })
  }, [getEdges, refreshNodeRuntimeData, setNodes])

  const handleCancelNodeEdit = useCallback((nodeId: string) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                isEditing: false
              }
            }
          : node
      )
    )
  }, [setNodes])

  const handleImagesChange = useCallback((nodeId: string, images: NodeImage[]) => {
    setNodes((nds) => {
      const now = new Date().toISOString()
      const nextNodes = nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, images, updatedAt: now } }
          : node
      )
      return refreshNodeRuntimeData(nextNodes, getEdges())
    })
  }, [getEdges, refreshNodeRuntimeData, setNodes])

  const handleAttachmentsChange = useCallback((nodeId: string, attachments: NodeAttachment[]) => {
    setNodes((nds) => {
      const now = new Date().toISOString()
      const nextNodes = nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, attachments, updatedAt: now } }
          : node
      )
      return refreshNodeRuntimeData(nextNodes, getEdges())
    })
  }, [getEdges, refreshNodeRuntimeData, setNodes])

  const handleGenerate = useCallback(async (nodeId: string, content: string) => {
    const currentNode = getNodes().find((n) => n.id === nodeId)
    const images: NodeImage[] = (currentNode?.data?.images as NodeImage[]) || []
    const controller = registerGenerationController(nodeId, new AbortController())

    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                isGenerating: true,
                isEditing: false
              }
            }
          : node
      )
    )

    try {
      const result = await generateNode(content, images.length > 0 ? images : undefined, controller.signal)
      setNodes((nds) => {
        const now = new Date().toISOString()
        const nextNodes = nds.map((node) => {
          if (node.id !== nodeId) return node
          const previousContent = node.data.content || ''
          return {
            ...node,
            data: {
              ...node.data,
              content: result.content,
              thinking: result.thinking || '',
              question: content,
              isEditing: false,
              isGenerating: false,
              updatedAt: now,
              versions: getNextVersions(node.data.versions || [], previousContent)
            }
          }
        })
        return refreshNodeRuntimeData(nextNodes, getEdges())
      })
    } catch (error) {
      if (isAbortError(error)) {
        setNodes((nds) =>
          nds.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    isGenerating: false,
                    isEditing: true
                  }
                }
              : node
          )
        )
        return
      }
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  isGenerating: false,
                  isEditing: true
                }
              }
            : node
        )
      )
      throw error
    } finally {
      unregisterGenerationController(nodeId, controller)
    }
  }, [getEdges, getNodes, refreshNodeRuntimeData, registerGenerationController, setNodes, unregisterGenerationController])

  const handleExpand = useCallback((
    text: string,
    parentId: string,
    selectedNodeIds?: string[],
    sourceRef?: SourceReference,
    expandMode: ExpandMode = 'direct'
  ) => {
    const currentNodes = getNodes()
    const currentEdges = getEdges()
    const allNodes: Node[] = buildNodeSnapshots(currentNodes, currentEdges)

    const newNodeId = `node-${Date.now()}`
    const relationshipId = `${parentId}-${Date.now()}`
    const expansionColor = getExpansionColor(relationshipId)
    const parentNode = currentNodes.find((n) => n.id === parentId)
    const parentImages: NodeImage[] = (parentNode?.data?.images as NodeImage[]) || []
    const now = new Date().toISOString()

    const placeholderNode = {
      id: newNodeId,
      type: 'custom',
      position: calculateChildNodePosition(
        parentNode ? toPlacementNode(parentNode) : undefined,
        currentNodes.map(toPlacementNode),
        { nodeWidth: NODE_DEFAULT_WIDTH, nodeHeight: NODE_DEFAULT_HEIGHT }
      ),
      style: {
        width: NODE_DEFAULT_WIDTH,
        height: NODE_DEFAULT_HEIGHT
      },
      data: {
        content: tFromSettings('toast.nodeGenerating'),
        thinking: '',
        question: text,
        nodeId: newNodeId,
        width: NODE_DEFAULT_WIDTH,
        height: NODE_DEFAULT_HEIGHT,
        isGenerating: true,
        createdAt: now,
        updatedAt: now,
        tags: [],
        note: '',
        versions: [] as NodeVersion[],
        expansionColor,
        sourceRef,
        images: [] as NodeImage[],
        attachments: [] as NodeAttachment[],
        onImagesChange: (imgs: NodeImage[]) => handleImagesChange(newNodeId, imgs),
        onAttachmentsChange: (attachments: NodeAttachment[]) => handleAttachmentsChange(newNodeId, attachments),
        onGenerate: (c: string) => handleGenerate(newNodeId, c),
        onStopGenerate: () => stopNodeGeneration(newNodeId),
        onSaveContent: (c: string) => handleSaveNodeContent(newNodeId, c),
        onCancelEdit: () => handleCancelNodeEdit(newNodeId),
        onExpand: (nextText: string, selectedIds?: string[], nextSourceRef?: SourceReference, nextExpandMode?: ExpandMode) =>
          handleExpand(nextText, newNodeId, selectedIds, nextSourceRef, nextExpandMode),
        allNodes,
        sourceHighlights: [] as SourceHighlight[]
      }
    }

    const newEdge = {
      id: `e${parentId}-${newNodeId}`,
      source: parentId,
      target: newNodeId,
      style: { stroke: expansionColor, strokeWidth: 2 }
    }

    const edgesWithNewEdge = [...currentEdges, newEdge]

    setNodes((nds) => {
      const nextNodes = [...nds, placeholderNode]
      return refreshNodeRuntimeData(nextNodes, edgesWithNewEdge)
    })
    setEdges((eds) => addEdge(newEdge, eds))

    const controller = registerGenerationController(newNodeId, new AbortController())

    void (async () => {
      try {
        const result = await expandNode(
          text,
          parentId,
          stripImagesFromNodes(allNodes),
          selectedNodeIds,
          sourceRef,
          expandMode,
          llmSettings.contextMaxDepth,
          parentImages.length > 0 ? parentImages : undefined,
          controller.signal
        )
        setNodes((nds) => {
          const nowUpdated = new Date().toISOString()
          const updatedNodes = nds.map((node) =>
            node.id === newNodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    content: result.content,
                    thinking: result.thinking || '',
                    question: text,
                    updatedAt: nowUpdated,
                    isGenerating: false,
                    sourceRef: result.sourceRef || sourceRef
                  }
                }
              : node
          )
          return refreshNodeRuntimeData(updatedNodes, edgesWithNewEdge)
        })
      } catch (error) {
        if (isAbortError(error)) {
          setNodes((nds) => {
            const nowUpdated = new Date().toISOString()
            const updatedNodes = nds.map((node) =>
              node.id === newNodeId
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      content: tFromSettings('toast.nodeGenerationStopped'),
                      thinking: '',
                      question: text,
                      updatedAt: nowUpdated,
                      isGenerating: false,
                      sourceRef
                    }
                  }
                : node
            )
            return refreshNodeRuntimeData(updatedNodes, edgesWithNewEdge)
          })
          return
        }
        console.error('Failed to expand node:', error)
        setNodes((nds) => {
          const nowUpdated = new Date().toISOString()
          const updatedNodes = nds.map((node) =>
            node.id === newNodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    content: tFromSettings('toast.nodeGenerateFailed'),
                    thinking: '',
                    question: text,
                    updatedAt: nowUpdated,
                    isGenerating: false,
                    sourceRef
                  }
                }
              : node
          )
          return refreshNodeRuntimeData(updatedNodes, edgesWithNewEdge)
        })
      } finally {
        unregisterGenerationController(newNodeId, controller)
      }
    })()

    return newNodeId
  }, [getNodes, getEdges, handleCancelNodeEdit, handleGenerate, handleAttachmentsChange, handleImagesChange, handleSaveNodeContent, llmSettings.contextMaxDepth, refreshNodeRuntimeData, registerGenerationController, setEdges, setNodes, stopNodeGeneration, unregisterGenerationController])

  const createNodeAtPosition = useCallback(
    (
      position: { x: number; y: number },
      content: string,
      isEditing: boolean,
      question?: string,
      initialImages?: NodeImage[],
      initialAttachments?: NodeAttachment[],
      initialThinking?: string,
      initialIsGenerating = false
    ) => {
    const nodeId = Date.now().toString()
    const currentEdges = getEdges()
    const now = new Date().toISOString()

    const newNode = {
      id: nodeId,
      type: 'custom',
      position,
      style: {
        width: NODE_DEFAULT_WIDTH,
        height: NODE_DEFAULT_HEIGHT
      },
      data: {
        content,
        thinking: initialThinking || '',
        question: question || '',
        isGenerating: initialIsGenerating,
        isEditing,
        editMode: 'edit',
        nodeId,
        width: NODE_DEFAULT_WIDTH,
        height: NODE_DEFAULT_HEIGHT,
        createdAt: now,
        updatedAt: now,
        tags: [] as string[],
        note: '',
        versions: [] as NodeVersion[],
        images: initialImages || [] as NodeImage[],
        attachments: initialAttachments || [] as NodeAttachment[],
        onImagesChange: (imgs: NodeImage[]) => handleImagesChange(nodeId, imgs),
        onAttachmentsChange: (attachments: NodeAttachment[]) => handleAttachmentsChange(nodeId, attachments),
        onGenerate: (c: string) => handleGenerate(nodeId, c),
        onStopGenerate: () => stopNodeGeneration(nodeId),
        onSaveContent: (c: string) => handleSaveNodeContent(nodeId, c),
        onCancelEdit: () => handleCancelNodeEdit(nodeId),
        onExpand: (text: string, selectedIds?: string[], sourceRef?: SourceReference, expandMode?: ExpandMode) =>
          handleExpand(text, nodeId, selectedIds, sourceRef, expandMode),
        allNodes: [] as Node[],
        sourceHighlights: [] as SourceHighlight[]
      }
    }

    setNodes((nds) => {
      const nextNodes = [...nds, newNode]
      return refreshNodeRuntimeData(nextNodes, currentEdges)
    })
    return nodeId
  }, [getEdges, handleCancelNodeEdit, handleGenerate, handleAttachmentsChange, handleExpand, handleImagesChange, handleSaveNodeContent, refreshNodeRuntimeData, setNodes, stopNodeGeneration])

  const createFirstNode = useCallback((
    content: string,
    isEditing: boolean,
    question?: string,
    initialImages?: NodeImage[],
    initialAttachments?: NodeAttachment[],
    initialThinking?: string,
    initialIsGenerating = false
  ) => {
    const center = getCanvasCenterFlowPosition()
    const position = calculateInitialNodePosition(
      getNodes().map(toPlacementNode),
      center,
      { nodeWidth: NODE_DEFAULT_WIDTH, nodeHeight: NODE_DEFAULT_HEIGHT }
    )
    return createNodeAtPosition(position, content, isEditing, question, initialImages, initialAttachments, initialThinking, initialIsGenerating)
  }, [createNodeAtPosition, getCanvasCenterFlowPosition, getNodes])

  const createNode = useCallback((position: { x: number; y: number }) => {
    createNodeAtPosition(position, '', true)
  }, [createNodeAtPosition])

  const openNodeEditor = useCallback((
    nodeId: string,
    mode: 'edit' | 'regenerate',
    presetContent?: string
  ) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== nodeId) return node
        const fallbackContent = String(node.data.content || '')
        const nextDraft = typeof presetContent === 'string' ? presetContent : fallbackContent
        return {
          ...node,
          data: {
            ...node.data,
            isEditing: true,
            editMode: mode,
            editDraft: nextDraft,
            editDraftVersion: `${Date.now()}-${nodeId}`
          }
        }
      })
    )
  }, [setNodes])

  const triggerNodeEdit = useCallback((nodeId: string) => {
    openNodeEditor(nodeId, 'edit')
  }, [openNodeEditor])

  const triggerNodeRegenerate = useCallback((nodeId: string) => {
    const targetNode = getNodes().find((node) => node.id === nodeId)
    if (!targetNode) return
    const question = String(targetNode.data?.question || '').trim()
    const fallbackContent = String(targetNode.data?.content || '')
    openNodeEditor(nodeId, 'regenerate', question || fallbackContent)
  }, [getNodes, openNodeEditor])

  const handleSaveNodeMeta = useCallback((metaEditor: MetaEditorState, onDone: () => void) => {
    const tags = parseTags(metaEditor.tagsText)
    const note = metaEditor.note.trim()

    setNodes((nds) => {
      const now = new Date().toISOString()
      const nextNodes = nds.map((node) =>
        node.id === metaEditor.nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                tags,
                note,
                updatedAt: now
              }
            }
          : node
      )
      return refreshNodeRuntimeData(nextNodes, getEdges())
    })

    onDone()
    showToast(tFromSettings('toast.metaUpdated'), 'success')
  }, [getEdges, refreshNodeRuntimeData, setNodes, showToast])

  const handleRestoreVersion = useCallback((versionDialog: VersionDialogState, selectedVersionIndex: number, onDone: () => void) => {
    const targetVersion = versionDialog.versions[selectedVersionIndex]
    if (!targetVersion) return

    setNodes((nds) => {
      const now = new Date().toISOString()
      const nextNodes = nds.map((node) => {
        if (node.id !== versionDialog.nodeId) return node
        const currentContent = node.data.content || ''
        return {
          ...node,
          data: {
            ...node.data,
            content: targetVersion.content,
            updatedAt: now,
            versions: getNextVersions(node.data.versions || [], currentContent)
          }
        }
      })
      return refreshNodeRuntimeData(nextNodes, getEdges())
    })

    onDone()
    showToast(tFromSettings('toast.versionRestored'), 'success')
  }, [getEdges, refreshNodeRuntimeData, setNodes, showToast])

  const handleExportNode = useCallback((nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) {
      showToast(tFromSettings('toast.nodeNotFound'), 'error')
      return
    }

    const tags = node.data.tags || []
    const note = (node.data.note || '').trim()
    const thinking = (node.data.thinking || '').trim()
    const metadata = [
      `id: ${node.id}`,
      `updatedAt: ${node.data.updatedAt || ''}`,
      `tags: ${tags.join(', ')}`
    ].join('\n')

    let markdown = `<!--\n${metadata}\n-->\n\n${node.data.content || ''}`
    if (thinking) {
      markdown += `\n\n## ${tFromSettings('canvas.detail.thinking')}\n${thinking}\n`
    }
    if (note) {
      markdown += `\n\n## ${tFromSettings('node.note')}\n${note}\n`
    }

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${node.id}.md`
    link.click()
    URL.revokeObjectURL(link.href)

    showToast(tFromSettings('toast.nodeExported'), 'success')
  }, [nodes, showToast])

  return {
    nodes,
    setNodes,
    onNodesChange,
    edges,
    setEdges,
    onEdgesChange,
    skipDirtyFlagRef,
    refreshNodeRuntimeData,
    getCanvasCenterFlowPosition,
    handleSaveNodeContent,
    handleCancelNodeEdit,
    handleGenerate,
    handleExpand,
    stopNodeGeneration,
    registerExternalGenerationController,
    handleImagesChange,
    handleAttachmentsChange,
    createNodeAtPosition,
    createFirstNode,
    createNode,
    triggerNodeEdit,
    triggerNodeRegenerate,
    stopAllGenerations,
    handleSaveNodeMeta,
    handleRestoreVersion,
    handleExportNode
  }
}
