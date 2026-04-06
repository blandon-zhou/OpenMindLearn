import { useCallback } from 'react'
import { useGraphStore } from '../stores/graphStore'
import { useToastStore } from '../stores/toastStore'
import { saveFile, loadFile } from '../services/api'
import type { Node, SourceReference, Region, NodeImage, NodeAttachment } from '../types'
import type { ExpandMode } from '../stores/settingsStore'
import type { SourceHighlight } from '../types/canvas'
import {
  NODE_DEFAULT_WIDTH, NODE_DEFAULT_HEIGHT, NODE_MIN_WIDTH, NODE_MIN_HEIGHT,
} from '../types/canvas'
import { parseNodeDimension, getNodeWidth, getNodeHeight, normalizeNodeForRuntime } from '../utils/nodeDimension'
import { normalizeRegionsWithNodeFallback } from '../utils/region'
import { fileToBase64, base64ToBlob } from '../utils/base64'
import { tFromSettings } from './useI18n'

interface DesktopFileApi {
  pickOpenOmlPath: () => Promise<string | null>
  pickSaveOmlPath: (suggestedName: string) => Promise<string | null>
  readFileBase64: (filePath: string) => Promise<string>
  writeFileBase64: (filePath: string, base64Data: string) => Promise<boolean>
}

function getDesktopFileApi() {
  const api = window.omlDesktop
  if (!api?.pickOpenOmlPath || !api.pickSaveOmlPath || !api.readFileBase64 || !api.writeFileBase64) {
    return null
  }
  return api as DesktopFileApi
}

function getFileNameFromPath(filePath: string | null | undefined): string {
  if (!filePath) return ''
  const normalized = filePath.replace(/\\/g, '/')
  const rawName = normalized.split('/').pop() || ''
  return rawName.replace(/\.oml$/i, '')
}

export interface FileIODeps {
  nodes: any[]
  edges: any[]
  regions: Region[]
  setNodes: (nds: any) => void
  setEdges: (eds: any) => void
  setRegions: (regions: Region[]) => void
  skipDirtyFlagRef: React.MutableRefObject<boolean>
  refreshNodeRuntimeData: (rfNodes: any[], edgeList: any[]) => any[]
  handleGenerate: (nodeId: string, content: string) => Promise<void>
  handleSaveNodeContent: (nodeId: string, content: string) => void
  handleExpand: (...args: any[]) => string | void
  handleImagesChange: (nodeId: string, images: NodeImage[]) => void
  handleAttachmentsChange: (nodeId: string, attachments: NodeAttachment[]) => void
  resetSearch: () => void
  setDetailPanel: (v: null) => void
  setMetaEditor: (v: null) => void
  setVersionDialog: (v: null) => void
  setShowRegionPanel: (v: boolean) => void
  setInitialInput: (v: string) => void
  setInitialGenerating: (v: boolean) => void
  setInitialImages: (v: NodeImage[]) => void
  setInitialAttachments: (v: NodeAttachment[]) => void
}

export interface LocalDraftPayload {
  fileName: string
  filePath: string | null
  nodes: Node[]
  edges: any[]
  regions: Region[]
  initialInput?: string
  initialImages?: NodeImage[]
  initialAttachments?: NodeAttachment[]
  initialGenerating?: boolean
}

interface GraphLoadLikeData {
  nodes: Node[]
  edges?: any[]
  regions?: Region[]
  name?: string
}

export function useCanvasFileIO(deps: FileIODeps) {
  const { fileName, currentFilePath, setCurrentFilePath, setDirty, loadGraph, clearGraph } = useGraphStore()
  const { showToast } = useToastStore()

  const applyGraphData = useCallback((graphData: GraphLoadLikeData, openedFilePath: string | null, options?: {
    dirty?: boolean
    toastKey?: string
  }) => {
    if (!graphData?.nodes || !Array.isArray(graphData.nodes)) {
      throw new Error('Invalid graph data')
    }

    const loadedNodes: Node[] = graphData.nodes.map((node: Node) => normalizeNodeForRuntime(node))
    const loadedRegions = normalizeRegionsWithNodeFallback(graphData.regions, loadedNodes)

    const graphName = typeof graphData.name === 'string' && graphData.name.trim()
      ? graphData.name.trim()
      : getFileNameFromPath(openedFilePath) || 'Untitled'

    const loadedEdges = (graphData.edges || []).map((edge: any) => {
      if (edge.style) return edge
      const childNode = loadedNodes.find((node) => node.id === edge.target)
      return {
        ...edge,
        style: childNode?.expansionColor
          ? { stroke: childNode.expansionColor, strokeWidth: 2 }
          : undefined
      }
    })

    deps.skipDirtyFlagRef.current = true
    loadGraph({ nodes: loadedNodes, name: graphName, regions: loadedRegions }, openedFilePath)

    const rfNodes = loadedNodes.map((node) => ({
      id: node.id,
      type: 'custom',
      position: node.position,
      style: {
        width: parseNodeDimension(node.width, NODE_DEFAULT_WIDTH, NODE_MIN_WIDTH),
        height: parseNodeDimension(node.height, NODE_DEFAULT_HEIGHT, NODE_MIN_HEIGHT)
      },
      data: {
        content: node.content,
        thinking: node.thinking || '',
        question: node.question || '',
        nodeId: node.id,
        width: parseNodeDimension(node.width, NODE_DEFAULT_WIDTH, NODE_MIN_WIDTH),
        height: parseNodeDimension(node.height, NODE_DEFAULT_HEIGHT, NODE_MIN_HEIGHT),
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        tags: node.tags || [],
        note: node.note || '',
        versions: node.versions || [],
        expansionColor: node.expansionColor,
        sourceRef: node.sourceRef,
        images: node.images || [],
        attachments: node.attachments || [],
        onImagesChange: (imgs: NodeImage[]) => deps.handleImagesChange(node.id, imgs),
        onAttachmentsChange: (attachments: NodeAttachment[]) => deps.handleAttachmentsChange(node.id, attachments),
        onGenerate: (c: string) => deps.handleGenerate(node.id, c),
        onSaveContent: (c: string) => deps.handleSaveNodeContent(node.id, c),
        onExpand: (text: string, selectedIds?: string[], sourceRef?: SourceReference, expandMode?: ExpandMode) =>
          deps.handleExpand(text, node.id, selectedIds, sourceRef, expandMode),
        allNodes: loadedNodes,
        sourceHighlights: [] as SourceHighlight[]
      }
    }))

    deps.setNodes(deps.refreshNodeRuntimeData(rfNodes, loadedEdges))
    deps.setEdges(loadedEdges)
    deps.setRegions(loadedRegions)
    deps.resetSearch()
    deps.setDetailPanel(null)
    setDirty(Boolean(options?.dirty))
    if (options?.toastKey) {
      showToast(tFromSettings(options.toastKey), 'success')
    }
  }, [deps, loadGraph, setDirty, showToast])

  const applyLoadedGraph = useCallback(async (base64: string, openedFilePath: string | null) => {
    const result = await loadFile(base64)
    if (!result?.nodes || !Array.isArray(result.nodes)) {
      throw new Error(result?.error || 'Invalid load response')
    }

    const graphName = typeof result.name === 'string' && result.name.trim()
      ? result.name.trim()
      : getFileNameFromPath(openedFilePath) || 'Untitled'

    applyGraphData({
      ...result,
      name: graphName
    }, openedFilePath, {
      dirty: false,
      toastKey: 'toast.fileLoaded'
    })
  }, [applyGraphData])

  const handleRestoreLocalDraft = useCallback((draft: LocalDraftPayload) => {
    const resolvedFileName = typeof draft.fileName === 'string' && draft.fileName.trim()
      ? draft.fileName.trim()
      : 'Untitled'

    deps.setInitialInput(draft.initialInput || '')
    deps.setInitialImages(draft.initialImages || [])
    deps.setInitialAttachments(draft.initialAttachments || [])
    deps.setInitialGenerating(Boolean(draft.initialGenerating))

    applyGraphData({
      nodes: draft.nodes || [],
      edges: draft.edges || [],
      regions: draft.regions || [],
      name: resolvedFileName
    }, draft.filePath || null, {
      dirty: true
    })
  }, [applyGraphData, deps])

  const handleSave = useCallback(async () => {
    try {
      const graphNodes: Node[] = deps.nodes.map((node) => ({
        id: node.id,
        content: node.data.content || '',
        thinking: node.data.thinking || '',
        question: node.data.question || '',
        position: node.position,
        width: getNodeWidth(node),
        height: getNodeHeight(node),
        parentIds: deps.edges.filter((edge) => edge.target === node.id).map((edge) => edge.source),
        createdAt: node.data.createdAt || new Date().toISOString(),
        updatedAt: node.data.updatedAt,
        tags: node.data.tags || [],
        note: node.data.note || '',
        versions: node.data.versions || [],
        expansionColor: node.data.expansionColor,
        sourceRef: node.data.sourceRef,
        images: node.data.images || [],
        attachments: node.data.attachments || []
      }))

      const result = await saveFile(graphNodes, deps.edges, fileName, deps.regions)
      if (!result?.data || typeof result.data !== 'string') {
        throw new Error(result?.error || 'Invalid save response')
      }

      const desktopFileApi = getDesktopFileApi()
      if (desktopFileApi) {
        let targetFilePath = currentFilePath
        if (!targetFilePath) {
          targetFilePath = await desktopFileApi.pickSaveOmlPath(`${fileName}.oml`)
          if (!targetFilePath) {
            return
          }
        }

        await desktopFileApi.writeFileBase64(targetFilePath, result.data)
        setCurrentFilePath(targetFilePath)
      } else {
        const blob = base64ToBlob(result.data, 'application/zip')
        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = `${fileName}.oml`
        link.click()
        URL.revokeObjectURL(blobUrl)
      }

      setDirty(false)
      showToast(tFromSettings('toast.fileSaved'), 'success')
    } catch (error) {
      console.error('保存失败:', error)
      const message = error instanceof Error ? error.message : ''
      showToast(tFromSettings('toast.fileSaveFailed', { message }), 'error')
    }
  }, [deps.nodes, deps.edges, deps.regions, fileName, currentFilePath, setCurrentFilePath, setDirty, showToast])

  const handleLoad = useCallback(async () => {
    const desktopFileApi = getDesktopFileApi()

    if (desktopFileApi) {
      try {
        const filePath = await desktopFileApi.pickOpenOmlPath()
        if (!filePath) return

        const base64 = await desktopFileApi.readFileBase64(filePath)
        await applyLoadedGraph(base64, filePath)
      } catch (error) {
        console.error('加载失败:', error)
        const message = error instanceof Error ? error.message : ''
        showToast(tFromSettings('toast.fileLoadFailed', { message }), 'error')
      }
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.oml'

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const base64 = await fileToBase64(file)
        await applyLoadedGraph(base64, null)
      } catch (error) {
        console.error('加载失败:', error)
        const message = error instanceof Error ? error.message : ''
        showToast(tFromSettings('toast.fileLoadFailed', { message }), 'error')
      }
    }

    input.click()
  }, [applyLoadedGraph, showToast])

  const handleNew = useCallback(() => {
    if (deps.nodes.length > 0 || deps.edges.length > 0 || deps.regions.length > 0) {
      if (!confirm(tFromSettings('confirm.newUnsaved'))) return
    }

    deps.skipDirtyFlagRef.current = true
    clearGraph()
    setCurrentFilePath(null)
    deps.setNodes([])
    deps.setEdges([])
    deps.setRegions([])
    deps.setInitialInput('')
    deps.setInitialGenerating(false)
    deps.setInitialImages([])
    deps.setInitialAttachments([])
    deps.resetSearch()
    deps.setDetailPanel(null)
    deps.setMetaEditor(null)
    deps.setVersionDialog(null)
    deps.setShowRegionPanel(false)
  }, [deps, clearGraph, setCurrentFilePath])

  return {
    handleSave,
    handleLoad,
    handleNew,
    handleRestoreLocalDraft
  }
}
