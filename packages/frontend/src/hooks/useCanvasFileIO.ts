import { useCallback, useMemo } from 'react'
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
import { buildNodeSnapshots } from '../utils/graphSnapshot'
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
  initialInput: string
  initialGenerating: boolean
  initialImages: NodeImage[]
  initialAttachments: NodeAttachment[]
  setNodes: (nds: any) => void
  setEdges: (eds: any) => void
  setRegions: (regions: Region[]) => void
  skipDirtyFlagRef: React.MutableRefObject<boolean>
  refreshNodeRuntimeData: (rfNodes: any[], edgeList: any[]) => any[]
  handleGenerate: (nodeId: string, content: string) => Promise<void>
  handleStopNodeGeneration: (nodeId: string) => number
  handleSaveNodeContent: (nodeId: string, content: string) => void
  handleCancelNodeEdit: (nodeId: string) => void
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

export interface LocalDraftDocPayload {
  id: string
  fileName: string
  filePath: string | null
  isDirty: boolean
  nodes: Node[]
  edges: any[]
  regions: Region[]
  initialInput?: string
  initialImages?: NodeImage[]
  initialAttachments?: NodeAttachment[]
  initialGenerating?: boolean
  updatedAt?: string
}

export interface LocalDraftWorkspacePayload {
  activeDocId: string | null
  openedDocIds: string[]
  docsById: Record<string, LocalDraftDocPayload>
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

function toWorkspaceDraft(input: LocalDraftWorkspacePayload | LocalDraftPayload): LocalDraftWorkspacePayload {
  if ('docsById' in input) return input
  const docId = `doc-${Date.now()}-legacy`
  return {
    activeDocId: docId,
    openedDocIds: [docId],
    docsById: {
      [docId]: {
        id: docId,
        fileName: input.fileName,
        filePath: input.filePath,
        isDirty: true,
        nodes: input.nodes,
        edges: input.edges,
        regions: input.regions,
        initialInput: input.initialInput,
        initialImages: input.initialImages,
        initialAttachments: input.initialAttachments,
        initialGenerating: input.initialGenerating,
        updatedAt: new Date().toISOString()
      }
    }
  }
}

export function useCanvasFileIO(deps: FileIODeps) {
  const activeDocId = useGraphStore((state) => state.activeDocId)
  const openedDocIds = useGraphStore((state) => state.openedDocIds)
  const docsById = useGraphStore((state) => state.docsById)
  const maxOpenedDocs = useGraphStore((state) => state.maxOpenedDocs)
  const setCurrentFilePath = useGraphStore((state) => state.setCurrentFilePath)
  const setDirty = useGraphStore((state) => state.setDirty)
  const setFileName = useGraphStore((state) => state.setFileName)
  const createDocument = useGraphStore((state) => state.createDocument)
  const activateDocument = useGraphStore((state) => state.activateDocument)
  const closeDocument = useGraphStore((state) => state.closeDocument)
  const openGraphDocument = useGraphStore((state) => state.openGraphDocument)
  const updateDocSnapshot = useGraphStore((state) => state.updateDocSnapshot)
  const replaceWorkspace = useGraphStore((state) => state.replaceWorkspace)
  const { showToast } = useToastStore()

  const activeDoc = activeDocId ? docsById[activeDocId] : null

  const documents = useMemo(() => {
    return openedDocIds
      .map((docId) => docsById[docId])
      .filter(Boolean)
      .map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        isDirty: doc.isDirty
      }))
  }, [docsById, openedDocIds])

  const hydrateRuntimeFromDoc = useCallback((docId: string) => {
    const doc = useGraphStore.getState().docsById[docId]
    if (!doc) return

    const loadedNodes: Node[] = (doc.nodes || []).map((node) => normalizeNodeForRuntime(node))
    const loadedRegions = normalizeRegionsWithNodeFallback(doc.regions, loadedNodes)
    const loadedEdges = (doc.edges || []).map((edge: any) => {
      if (edge.style) return edge
      const childNode = loadedNodes.find((node) => node.id === edge.target)
      return {
        ...edge,
        style: childNode?.expansionColor
          ? { stroke: childNode.expansionColor, strokeWidth: 2 }
          : undefined
      }
    })

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
        onStopGenerate: () => deps.handleStopNodeGeneration(node.id),
        onSaveContent: (c: string) => deps.handleSaveNodeContent(node.id, c),
        onCancelEdit: () => deps.handleCancelNodeEdit(node.id),
        onExpand: (text: string, selectedIds?: string[], sourceRef?: SourceReference, expandMode?: ExpandMode) =>
          deps.handleExpand(text, node.id, selectedIds, sourceRef, expandMode),
        allNodes: loadedNodes,
        sourceHighlights: [] as SourceHighlight[]
      }
    }))

    deps.skipDirtyFlagRef.current = true
    deps.setNodes(deps.refreshNodeRuntimeData(rfNodes, loadedEdges))
    deps.setEdges(loadedEdges)
    deps.setRegions(loadedRegions)
    deps.setInitialInput(doc.ui.initialInput || '')
    deps.setInitialGenerating(Boolean(doc.ui.initialGenerating))
    deps.setInitialImages(doc.ui.initialImages || [])
    deps.setInitialAttachments(doc.ui.initialAttachments || [])
    deps.resetSearch()
    deps.setDetailPanel(null)
    deps.setMetaEditor(null)
    deps.setVersionDialog(null)
    deps.setShowRegionPanel(false)
  }, [deps])

  const captureActiveDocSnapshot = useCallback(() => {
    const state = useGraphStore.getState()
    if (!state.activeDocId) return

    updateDocSnapshot({
      docId: state.activeDocId,
      nodes: buildNodeSnapshots(deps.nodes, deps.edges),
      edges: deps.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        style: edge.style
      })),
      regions: deps.regions,
      ui: {
        initialInput: deps.initialInput,
        initialGenerating: deps.initialGenerating,
        initialImages: deps.initialImages,
        initialAttachments: deps.initialAttachments
      }
    })
  }, [
    deps.edges,
    deps.initialAttachments,
    deps.initialGenerating,
    deps.initialImages,
    deps.initialInput,
    deps.nodes,
    deps.regions,
    updateDocSnapshot
  ])

  const buildActiveGraphNodes = useCallback((): Node[] => {
    return deps.nodes.map((node) => ({
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
  }, [deps.edges, deps.nodes])

  const saveDocById = useCallback(async (docId: string) => {
    const state = useGraphStore.getState()
    const targetDoc = state.docsById[docId]
    if (!targetDoc) return false

    const isActiveDoc = state.activeDocId === docId
    const docFileName = targetDoc.fileName || 'Untitled'

    const graphNodes = isActiveDoc
      ? buildActiveGraphNodes()
      : targetDoc.nodes
    const graphEdges = isActiveDoc
      ? deps.edges
      : (targetDoc.edges || [])
    const graphRegions = isActiveDoc
      ? deps.regions
      : (targetDoc.regions || [])

    const result = await saveFile(graphNodes, graphEdges, docFileName, graphRegions)
    if (!result?.data || typeof result.data !== 'string') {
      throw new Error(result?.error || 'Invalid save response')
    }

    const desktopFileApi = getDesktopFileApi()
    if (desktopFileApi) {
      let targetFilePath = targetDoc.currentFilePath
      if (!targetFilePath) {
        targetFilePath = await desktopFileApi.pickSaveOmlPath(`${docFileName}.oml`)
        if (!targetFilePath) {
          return false
        }
      }

      await desktopFileApi.writeFileBase64(targetFilePath, result.data)
      setCurrentFilePath(targetFilePath, docId)
    } else {
      const blob = base64ToBlob(result.data, 'application/zip')
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `${docFileName}.oml`
      link.click()
      URL.revokeObjectURL(blobUrl)
    }

    if (isActiveDoc) {
      captureActiveDocSnapshot()
    }
    setDirty(false, docId)
    showToast(tFromSettings('toast.fileSaved'), 'success')
    return true
  }, [buildActiveGraphNodes, captureActiveDocSnapshot, deps.edges, deps.regions, setCurrentFilePath, setDirty, showToast])

  const applyLoadedGraph = useCallback(async (base64: string, openedFilePath: string | null) => {
    const result = await loadFile(base64)
    if (!result?.nodes || !Array.isArray(result.nodes)) {
      throw new Error(result?.error || 'Invalid load response')
    }

    const loadedNodes: Node[] = result.nodes.map((node: Node) => normalizeNodeForRuntime(node))
    const loadedRegions = normalizeRegionsWithNodeFallback(result.regions, loadedNodes)
    const graphName = typeof result.name === 'string' && result.name.trim()
      ? result.name.trim()
      : getFileNameFromPath(openedFilePath) || 'Untitled'

    const loadedEdges = (result.edges || []).map((edge: any) => {
      if (edge.style) return edge
      const childNode = loadedNodes.find((node) => node.id === edge.target)
      return {
        ...edge,
        style: childNode?.expansionColor
          ? { stroke: childNode.expansionColor, strokeWidth: 2 }
          : undefined
      }
    })

    captureActiveDocSnapshot()

    const docId = openGraphDocument({
      nodes: loadedNodes,
      name: graphName,
      regions: loadedRegions
    }, openedFilePath, loadedEdges)

    if (!docId) {
      showToast(tFromSettings('toast.maxOpenedDocsExceeded', { count: maxOpenedDocs }), 'error')
      return
    }

    hydrateRuntimeFromDoc(docId)
    showToast(tFromSettings('toast.fileLoaded'), 'success')
  }, [captureActiveDocSnapshot, hydrateRuntimeFromDoc, maxOpenedDocs, openGraphDocument, showToast])

  const handleRestoreLocalDraft = useCallback((draftPayload: LocalDraftWorkspacePayload | LocalDraftPayload) => {
    const workspaceDraft = toWorkspaceDraft(draftPayload)
    if (!workspaceDraft.openedDocIds.length) return

    const normalizedDocs = workspaceDraft.openedDocIds.reduce<Record<string, any>>((acc, docId) => {
      const draftDoc = workspaceDraft.docsById[docId]
      if (!draftDoc) return acc
      const loadedNodes = (draftDoc.nodes || []).map((node) => normalizeNodeForRuntime(node))
      const loadedRegions = normalizeRegionsWithNodeFallback(draftDoc.regions, loadedNodes)
      acc[docId] = {
        id: docId,
        fileName: draftDoc.fileName || 'Untitled',
        currentFilePath: draftDoc.filePath || null,
        isDirty: Boolean(draftDoc.isDirty),
        nodes: loadedNodes,
        edges: draftDoc.edges || [],
        regions: loadedRegions,
        ui: {
          initialInput: draftDoc.initialInput || '',
          initialGenerating: Boolean(draftDoc.initialGenerating),
          initialImages: draftDoc.initialImages || [],
          initialAttachments: draftDoc.initialAttachments || []
        },
        updatedAt: draftDoc.updatedAt || new Date().toISOString()
      }
      return acc
    }, {})

    const openedDocIds = workspaceDraft.openedDocIds.filter((docId) => normalizedDocs[docId])
    if (openedDocIds.length === 0) return

    const activeId = workspaceDraft.activeDocId && normalizedDocs[workspaceDraft.activeDocId]
      ? workspaceDraft.activeDocId
      : openedDocIds[0]

    replaceWorkspace({
      activeDocId: activeId,
      openedDocIds,
      docsById: normalizedDocs
    })

    if (activeId) {
      hydrateRuntimeFromDoc(activeId)
    }
  }, [hydrateRuntimeFromDoc, replaceWorkspace])

  const handleSave = useCallback(async () => {
    try {
      if (!activeDocId) return
      await saveDocById(activeDocId)
    } catch (error) {
      console.error('保存失败:', error)
      const message = error instanceof Error ? error.message : ''
      showToast(tFromSettings('toast.fileSaveFailed', { message }), 'error')
    }
  }, [activeDocId, saveDocById, showToast])

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
    captureActiveDocSnapshot()

    const newDocId = createDocument()
    if (!newDocId) {
      showToast(tFromSettings('toast.maxOpenedDocsExceeded', { count: maxOpenedDocs }), 'error')
      return
    }
    hydrateRuntimeFromDoc(newDocId)
  }, [captureActiveDocSnapshot, createDocument, hydrateRuntimeFromDoc, maxOpenedDocs, showToast])

  const handleSwitchDoc = useCallback((docId: string) => {
    const state = useGraphStore.getState()
    if (!state.docsById[docId] || state.activeDocId === docId) return

    captureActiveDocSnapshot()
    activateDocument(docId)
    hydrateRuntimeFromDoc(docId)
  }, [activateDocument, captureActiveDocSnapshot, hydrateRuntimeFromDoc])

  const handleCloseDoc = useCallback(async (docId: string) => {
    const state = useGraphStore.getState()
    if (!state.docsById[docId]) return

    if (state.activeDocId === docId) {
      captureActiveDocSnapshot()
    }

    const latestDoc = useGraphStore.getState().docsById[docId]
    if (!latestDoc) return

    if (latestDoc.isDirty) {
      const shouldSaveAndClose = window.confirm(tFromSettings('confirm.closeTabSave', { name: latestDoc.fileName }))
      if (shouldSaveAndClose) {
        try {
          const didSave = await saveDocById(docId)
          if (!didSave) return
        } catch (error) {
          const message = error instanceof Error ? error.message : ''
          showToast(tFromSettings('toast.fileSaveFailed', { message }), 'error')
          return
        }
      } else {
        const shouldDiscard = window.confirm(tFromSettings('confirm.closeTabDiscard', { name: latestDoc.fileName }))
        if (!shouldDiscard) return
      }
    }

    const wasActive = useGraphStore.getState().activeDocId === docId
    const nextActiveId = closeDocument(docId)
    if (wasActive && nextActiveId) {
      hydrateRuntimeFromDoc(nextActiveId)
    }
  }, [captureActiveDocSnapshot, closeDocument, hydrateRuntimeFromDoc, saveDocById, showToast])

  const handleRenameDoc = useCallback((docId: string, name: string) => {
    const nextName = name.trim()
    if (!nextName) return
    setFileName(nextName, docId)
  }, [setFileName])

  const handleCloseActiveDoc = useCallback(async () => {
    const currentActiveDocId = useGraphStore.getState().activeDocId
    if (!currentActiveDocId) return
    await handleCloseDoc(currentActiveDocId)
  }, [handleCloseDoc])

  return {
    documents,
    activeDocId,
    activeDoc,
    openedDocIds,
    docsById,
    handleSave,
    handleLoad,
    handleNew,
    handleSwitchDoc,
    handleCloseDoc,
    handleCloseActiveDoc,
    handleRenameDoc,
    handleRestoreLocalDraft
  }
}
