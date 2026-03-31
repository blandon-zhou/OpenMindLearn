import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ClipboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { Node as RFNode, Viewport } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Layers } from 'lucide-react'
import { Toolbar } from '../Toolbar'
import { NodeCard } from '../NodeCard'
import { ImageLightbox } from '../ImageLightbox'
import { cn } from '../../utils/cn'
import { generateNode } from '../../services/api'
import type { CanvasMode, DetailPanelState, MetaEditorState, VersionDialogState } from '../../types/canvas'
import type { NodeAttachment, NodeImage } from '../../types'
import { buildDiffLines } from '../../utils/search'
import { readClipboardImages, readFilesAsNodeImages } from '../../utils/image'
import { readFilesAsNodeAttachments } from '../../utils/attachment'
import { useToastStore } from '../../stores/toastStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useCanvasContextMenu } from '../../hooks/useCanvasContextMenu'
import { useCanvasFileIO } from '../../hooks/useCanvasFileIO'
import { useCanvasLocalDraft } from '../../hooks/useCanvasLocalDraft'
import { useCanvasNodes } from '../../hooks/useCanvasNodes'
import { useCanvasRegions } from '../../hooks/useCanvasRegions'
import { useCanvasSearch } from '../../hooks/useCanvasSearch'
import { useI18n } from '../../hooks/useI18n'
import { CanvasContextMenu } from './CanvasContextMenu'
import { CanvasFirstNodePanel } from './CanvasFirstNodePanel'
import { CanvasFlow } from './CanvasFlow'
import { CanvasRegionInteractionLayer } from './CanvasRegionInteractionLayer'
import { CanvasRegionLayer } from './CanvasRegionLayer'
import { CanvasRegionPanel } from './CanvasRegionPanel'
import { CanvasSearchPanel } from './CanvasSearchPanel'
import { MetaEditorDialog } from './MetaEditorDialog'
import { NodeDetailPanel } from './NodeDetailPanel'
import { VersionDialog } from './VersionDialog'
import { useDetailPanelResize } from './hooks/useDetailPanelResize'
import { useGlobalImagePaste } from './hooks/useGlobalImagePaste'
import { useSourceLinkHighlight } from './hooks/useSourceLinkHighlight'
const nodeTypes = { custom: NodeCard }
export function Canvas() {
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('learn')
  const [isFlowInteractive, setIsFlowInteractive] = useState(true)
  const [detailPanel, setDetailPanel] = useState<DetailPanelState | null>(null)
  const [detailFontSize, setDetailFontSize] = useState(15)
  const [initialInput, setInitialInput] = useState('')
  const [initialGenerating, setInitialGenerating] = useState(false)
  const [initialImages, setInitialImages] = useState<NodeImage[]>([])
  const [initialAttachments, setInitialAttachments] = useState<NodeAttachment[]>([])
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [metaEditor, setMetaEditor] = useState<MetaEditorState | null>(null)
  const [versionDialog, setVersionDialog] = useState<VersionDialogState | null>(null)
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(0)
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const canvasRef = useRef<HTMLDivElement>(null)
  const regionsRef = useRef<any[]>([])
  const theme = useSettingsStore((state) => state.uiSettings.theme)
  const { showToast } = useToastStore()
  const { t } = useI18n()
  const { detailPanelWidth, handleStartResize } = useDetailPanelResize(520)
  const {
    sourceLinkedSourceNodeId,
    sourceLinkedNodeIds,
    triggerSourceHighlight,
    clearSourceHighlight
  } = useSourceLinkHighlight()
  const {
    nodes,
    setNodes,
    onNodesChange,
    edges,
    setEdges,
    onEdgesChange,
    skipDirtyFlagRef,
    refreshNodeRuntimeData,
    handleSaveNodeContent,
    handleGenerate,
    handleExpand,
    handleImagesChange,
    handleAttachmentsChange,
    createFirstNode,
    createNode,
    triggerNodeEdit,
    handleSaveNodeMeta: handleSaveNodeMetaRaw,
    handleRestoreVersion: handleRestoreVersionRaw,
    handleExportNode
  } = useCanvasNodes(canvasRef, regionsRef.current)
  const {
    regions,
    setRegions,
    regionDrag,
    setRegionDrag,
    regionCreateMode,
    regionCreateDraft,
    regionTitleEdit,
    setRegionTitleEdit,
    showRegionPanel,
    setShowRegionPanel,
    newRegionName,
    setNewRegionName,
    newRegionColor,
    setNewRegionColor,
    newRegionDescription,
    setNewRegionDescription,
    regionBoxes,
    regionCoveredNodeCount,
    handleToggleRegionCreateMode,
    handlePaneMouseDownForRegionCreate,
    handleUpdateRegion,
    handleDeleteRegion,
    startRegionTitleEdit,
    commitRegionTitleEdit,
    handleStartRegionDrag,
    handleStartRegionResize
  } = useCanvasRegions(nodes, setNodes, canvasMode, isFlowInteractive)
  regionsRef.current = regions
  const { contextMenu, setContextMenu, handlePaneContextMenu, handleNodeContextMenu } = useCanvasContextMenu(canvasMode)
  const {
    searchQuery,
    setSearchQuery,
    activeSearchIndex,
    searchResults,
    highlightedNodeSet,
    activeSearchNodeId,
    matchedPreview,
    focusSearchResult,
    resetSearch
  } = useCanvasSearch(nodes, viewport)
  const { handleSave, handleLoad, handleNew, handleRestoreLocalDraft } = useCanvasFileIO({
    nodes,
    edges,
    regions,
    setNodes,
    setEdges,
    setRegions,
    skipDirtyFlagRef,
    refreshNodeRuntimeData,
    handleGenerate,
    handleSaveNodeContent,
    handleExpand,
    handleImagesChange,
    handleAttachmentsChange,
    resetSearch,
    setDetailPanel,
    setMetaEditor,
    setVersionDialog,
    setShowRegionPanel,
    setInitialInput,
    setInitialGenerating,
    setInitialImages,
    setInitialAttachments
  })
  useCanvasLocalDraft({
    nodes,
    edges,
    regions,
    initialInput,
    initialImages,
    initialAttachments,
    initialGenerating,
    onRestoreDraft: handleRestoreLocalDraft
  })
  useGlobalImagePaste({
    enabled: canvasMode === 'learn',
    nodes,
    handleImagesChange,
    setInitialImages,
    showToast,
    t
  })
  const renderedNodes = useMemo(() => {
    const sourceLinkedSet = new Set(sourceLinkedNodeIds)
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        mode: canvasMode,
        searchMatched: highlightedNodeSet.has(node.id),
        searchActive: activeSearchNodeId === node.id,
        sourceLinkedActive: sourceLinkedSet.has(node.id),
        onSourceHighlightClick: (targetNodeIds: string[], sourceNodeId: string) => {
          triggerSourceHighlight(targetNodeIds, sourceNodeId)
        }
      }
    }))
  }, [nodes, highlightedNodeSet, activeSearchNodeId, canvasMode, sourceLinkedNodeIds, triggerSourceHighlight])
  const renderedEdges = useMemo(() => {
    if (!sourceLinkedSourceNodeId || sourceLinkedNodeIds.length === 0) return edges
    const targetSet = new Set(sourceLinkedNodeIds)
    return edges.map((edge) => {
      const isLinked = edge.source === sourceLinkedSourceNodeId && targetSet.has(edge.target)
      if (!isLinked) return edge
      return {
        ...edge,
        animated: true,
        style: {
          ...edge.style,
          stroke: '#0ea5e9',
          strokeWidth: Math.max(3.5, Number(edge.style?.strokeWidth || 0) + 1.5)
        }
      }
    })
  }, [edges, sourceLinkedNodeIds, sourceLinkedSourceNodeId])
  const regionCreatePreview = useMemo(() => {
    if (!regionCreateDraft) return null
    const { startPointer, currentPointer } = regionCreateDraft
    const x = Math.min(startPointer.x, currentPointer.x)
    const y = Math.min(startPointer.y, currentPointer.y)
    const width = Math.abs(currentPointer.x - startPointer.x)
    const height = Math.abs(currentPointer.y - startPointer.y)
    return { x, y, width, height }
  }, [regionCreateDraft])
  const selectedDiffLines = useMemo(() => {
    if (!versionDialog) return []
    const version = versionDialog.versions[selectedVersionIndex]
    if (!version) return []
    return buildDiffLines(version.content, versionDialog.currentContent)
  }, [selectedVersionIndex, versionDialog])
  useEffect(() => {
    setContextMenu(null)
    setRegionDrag(null)
    setRegionTitleEdit(null)
    if (canvasMode === 'view') {
      setNodes((nds) =>
        nds.map((node) =>
          node.data?.isEditing
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
      setShowRegionPanel(false)
      setMetaEditor(null)
      setVersionDialog(null)
      clearSourceHighlight()
    }
  }, [canvasMode, clearSourceHighlight, setContextMenu, setNodes, setRegionDrag, setRegionTitleEdit, setShowRegionPanel])
  const openNodeDetailById = useCallback((nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) return
    setDetailPanel({
      nodeId,
      content: String(node.data.content || ''),
      thinking: String(node.data.thinking || ''),
      question: String(node.data.question || '')
    })
  }, [nodes])
  const handleNodeClick = useCallback((_: ReactMouseEvent, node: RFNode) => {
    if (canvasMode !== 'view') return
    openNodeDetailById(node.id)
  }, [canvasMode, openNodeDetailById])
  const openNodeMetaEditor = useCallback((nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) return
    setMetaEditor({
      nodeId,
      tagsText: (node.data.tags || []).join(', '),
      note: node.data.note || ''
    })
  }, [nodes])
  const openVersionDialog = useCallback((nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) return
    const versions = node.data.versions || []
    setVersionDialog({
      nodeId,
      versions,
      currentContent: node.data.content || ''
    })
    setSelectedVersionIndex(Math.max(0, versions.length - 1))
  }, [nodes])
  const handleSaveNodeMeta = useCallback(() => {
    if (!metaEditor) return
    handleSaveNodeMetaRaw(metaEditor, () => setMetaEditor(null))
  }, [metaEditor, handleSaveNodeMetaRaw])
  const handleRestoreVersion = useCallback(() => {
    if (!versionDialog) return
    handleRestoreVersionRaw(versionDialog, selectedVersionIndex, () => setVersionDialog(null))
  }, [versionDialog, selectedVersionIndex, handleRestoreVersionRaw])
  const handleCreateFirstFromText = useCallback(() => {
    const text = initialInput.trim()
    if (!text) return
    const images = initialImages.length > 0 ? initialImages : undefined
    const attachments = initialAttachments.length > 0 ? initialAttachments : undefined
    createFirstNode(text, false, text, images, attachments)
    setInitialInput('')
    setInitialImages([])
    setInitialAttachments([])
    showToast(t('canvas.toast.firstNodeCreated'), 'success')
  }, [createFirstNode, initialInput, initialAttachments, initialImages, showToast, t])
  const handleGenerateFirstFromPrompt = useCallback(async () => {
    const prompt = initialInput.trim()
    if (!prompt) return
    const images = initialImages.length > 0 ? initialImages : undefined
    const attachments = initialAttachments.length > 0 ? initialAttachments : undefined
    const placeholderNodeId = createFirstNode('', false, prompt, images, attachments, '', true)
    setInitialInput('')
    setInitialImages([])
    setInitialAttachments([])
    setInitialGenerating(true)
    try {
      const result = await generateNode(prompt, images)
      setNodes((nds) => {
        const now = new Date().toISOString()
        const nextNodes = nds.map((node) =>
          node.id === placeholderNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  content: result.content || '',
                  thinking: result.thinking || '',
                  question: prompt,
                  isGenerating: false,
                  updatedAt: now
                }
              }
            : node
        )
        return refreshNodeRuntimeData(nextNodes, edges)
      })
      showToast(t('canvas.toast.firstNodeGenerated'), 'success')
    } catch (error) {
      console.error(t('canvas.toast.firstNodeGenerateFailed'), error)
      setNodes((nds) => {
        const now = new Date().toISOString()
        const nextNodes = nds.map((node) =>
          node.id === placeholderNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  content: t('canvas.toast.firstNodeGenerateFailed'),
                  thinking: '',
                  question: prompt,
                  isGenerating: false,
                  updatedAt: now
                }
              }
            : node
        )
        return refreshNodeRuntimeData(nextNodes, edges)
      })
      showToast(t('canvas.toast.firstNodeGenerateFailed'), 'error')
    } finally {
      setInitialGenerating(false)
    }
  }, [createFirstNode, edges, initialAttachments, initialInput, initialImages, refreshNodeRuntimeData, setNodes, showToast, t])
  const handleInitialImageUpload = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    readFilesAsNodeImages(files).then((newImages) => {
      setInitialImages((prev) => [...prev, ...newImages])
    })
    e.target.value = ''
  }, [])
  const handleInitialAttachmentUpload = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    readFilesAsNodeAttachments(files).then(({ attachments, tooLargeFiles }) => {
      if (attachments.length > 0) {
        setInitialAttachments((prev) => [...prev, ...attachments])
      }
      if (tooLargeFiles.length > 0) {
        const displayNames = tooLargeFiles.length > 3
          ? `${tooLargeFiles.slice(0, 3).join(', ')}...`
          : tooLargeFiles.join(', ')
        showToast(t('toast.attachmentsTooLarge', { files: displayNames, maxSize: '50MB' }), 'error')
      }
    })
    e.target.value = ''
  }, [showToast, t])
  const handleInitialInputPaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    const hasImage = Array.from(items).some((item) => item.type.startsWith('image/'))
    if (!hasImage) return
    e.preventDefault()
    readClipboardImages(items).then((newImages) => {
      if (newImages.length === 0) return
      setInitialImages((prev) => [...prev, ...newImages])
      showToast(t('canvas.toast.pastedImages', { count: newImages.length }), 'success')
    })
  }, [showToast, t])
  return (
    <div className="w-screen h-screen flex flex-col bg-background">
      <Toolbar onSave={handleSave} onLoad={handleLoad} onNew={handleNew} mode={canvasMode} onModeChange={setCanvasMode} />
      <div className="flex-1 flex min-h-0">
        <div ref={canvasRef} className={cn('flex-1 transition-all duration-300 relative min-h-0', detailPanel && 'flex-[2]')}>
          <div className="absolute inset-0 z-20">
            <CanvasFlow
              nodes={renderedNodes as any[]}
              edges={renderedEdges as any[]}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange as any}
              onEdgesChange={onEdgesChange as any}
              onPaneContextMenu={handlePaneContextMenu as any}
              onPaneMouseDown={handlePaneMouseDownForRegionCreate as any}
              onNodeContextMenu={handleNodeContextMenu as any}
              onNodeClick={handleNodeClick as any}
              onMove={setViewport}
              canvasMode={canvasMode}
              isFlowInteractive={isFlowInteractive}
              regionDragActive={Boolean(regionDrag)}
              regionCreateMode={regionCreateMode}
              theme={theme}
              onInteractiveChange={setIsFlowInteractive}
            />
          </div>
          <div className="absolute top-3 left-3 z-30 pointer-events-auto flex items-start gap-2">
            <CanvasSearchPanel
              searchQuery={searchQuery}
              activeSearchIndex={activeSearchIndex}
              searchResultsLength={searchResults.length}
              matchedPreview={matchedPreview ? { highlighted: matchedPreview.highlighted } : null}
              onSearchQueryChange={setSearchQuery}
              onNext={() => focusSearchResult(activeSearchIndex + 1)}
              onPrev={() => focusSearchResult(activeSearchIndex - 1)}
              t={t}
            />
            {canvasMode === 'learn' && (
              <button
                onClick={() => setShowRegionPanel((value) => !value)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background/95 shadow-md text-sm hover:bg-accent backdrop-blur"
              >
                <Layers className="w-4 h-4" />
                {t('canvas.regions.button')}
              </button>
            )}
          </div>
          <CanvasRegionLayer
            regionBoxes={regionBoxes}
            regionDrag={regionDrag}
            regionTitleEdit={regionTitleEdit}
            regionCoveredNodeCount={regionCoveredNodeCount}
            viewport={viewport}
          />
          <CanvasRegionInteractionLayer
            visible={canvasMode === 'learn' && isFlowInteractive && !regionCreateMode && !regionCreateDraft}
            regionBoxes={regionBoxes}
            viewport={viewport}
            regionTitleEdit={regionTitleEdit}
            setRegionTitleEdit={setRegionTitleEdit as any}
            regionCoveredNodeCount={regionCoveredNodeCount}
            handleStartRegionDrag={handleStartRegionDrag as any}
            startRegionTitleEdit={startRegionTitleEdit}
            commitRegionTitleEdit={commitRegionTitleEdit}
            handleStartRegionResize={handleStartRegionResize as any}
          />
          {canvasMode === 'learn' && regionCreatePreview && (
            <div className="absolute inset-0 z-[32] pointer-events-none">
              <div
                className="absolute rounded-md"
                style={{
                  left: regionCreatePreview.x * viewport.zoom + viewport.x,
                  top: regionCreatePreview.y * viewport.zoom + viewport.y,
                  width: Math.max(2, regionCreatePreview.width * viewport.zoom),
                  height: Math.max(2, regionCreatePreview.height * viewport.zoom),
                  border: `1.5px dashed ${newRegionColor}`,
                  backgroundColor: `${newRegionColor}18`
                }}
              />
            </div>
          )}
          {canvasMode === 'learn' && (
            <CanvasRegionPanel
              open={showRegionPanel}
              regions={regions}
              isFlowInteractive={isFlowInteractive}
              regionCreateMode={regionCreateMode}
              newRegionName={newRegionName}
              newRegionColor={newRegionColor}
              newRegionDescription={newRegionDescription}
              regionCoveredNodeCount={regionCoveredNodeCount}
              onClose={() => setShowRegionPanel(false)}
              onSetNewRegionName={setNewRegionName}
              onSetNewRegionColor={setNewRegionColor}
              onSetNewRegionDescription={setNewRegionDescription}
              onToggleCreateMode={handleToggleRegionCreateMode}
              onUpdateRegion={handleUpdateRegion as any}
              onDeleteRegion={handleDeleteRegion}
              t={t}
            />
          )}
          <CanvasFirstNodePanel
            mode={canvasMode}
            hasNodes={nodes.length > 0}
            initialInput={initialInput}
            initialGenerating={initialGenerating}
            initialImages={initialImages}
            initialAttachments={initialAttachments}
            onInitialInputChange={setInitialInput}
            onInitialInputPaste={handleInitialInputPaste}
            onInitialImageUpload={handleInitialImageUpload}
            onInitialAttachmentUpload={handleInitialAttachmentUpload}
            onRemoveInitialImage={(imageId) => setInitialImages((prev) => prev.filter((img) => img.id !== imageId))}
            onRemoveInitialAttachment={(attachmentId) => setInitialAttachments((prev) => prev.filter((item) => item.id !== attachmentId))}
            onPreviewImage={setPreviewImage}
            onCreateFromText={handleCreateFirstFromText}
            onGenerateFromPrompt={handleGenerateFirstFromPrompt}
            t={t}
          />
          {nodes.length === 0 && canvasMode === 'view' && (
            <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center p-4">
              <div className="pointer-events-auto w-full max-w-[520px] bg-background/95 border border-border rounded-xl shadow-lg p-4 text-center">
                <h3 className="text-base font-semibold text-foreground">{t('canvas.viewEmpty.title')}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t('canvas.viewEmpty.description')}</p>
              </div>
            </div>
          )}
          <CanvasContextMenu
            contextMenu={contextMenu}
            onCreateNode={createNode}
            onOpenDetail={openNodeDetailById}
            onEditNode={triggerNodeEdit}
            onOpenMeta={openNodeMetaEditor}
            onOpenVersions={openVersionDialog}
            onExportNode={handleExportNode}
            onClose={() => setContextMenu(null)}
            t={t}
          />
        </div>
        <NodeDetailPanel
          detailPanel={detailPanel}
          detailPanelWidth={detailPanelWidth}
          detailFontSize={detailFontSize}
          nodes={nodes as any[]}
          onStartResize={handleStartResize}
          onChangeFontSize={setDetailFontSize}
          onClose={() => setDetailPanel(null)}
          onPreviewImage={setPreviewImage}
          t={t}
        />
      </div>
      <MetaEditorDialog
        metaEditor={metaEditor}
        onClose={() => setMetaEditor(null)}
        onChange={setMetaEditor}
        onSave={handleSaveNodeMeta}
        t={t}
      />
      <VersionDialog
        versionDialog={versionDialog}
        selectedVersionIndex={selectedVersionIndex}
        selectedDiffLines={selectedDiffLines}
        onSelectVersion={setSelectedVersionIndex}
        onRestore={handleRestoreVersion}
        onClose={() => setVersionDialog(null)}
        t={t}
      />
      {previewImage && <ImageLightbox src={previewImage} onClose={() => setPreviewImage(null)} />}
    </div>
  )
}
