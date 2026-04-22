import { useEffect } from 'react'
import type React from 'react'
import { createPortal } from 'react-dom'
import { Download, MessageSquareText, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ContextPanel } from '../ContextPanel'
import type { Node, NodeAttachment, NodeImage } from '../../types'
import type { DetailPanelState } from '../../types/canvas'
import type { NodeCardData } from '../../types/nodeCard'
import { downloadNodeAttachment, formatFileSize } from '../../utils/attachment'
import { cn } from '../../utils/cn'
import { useNodeCardSelection } from '../../hooks/useNodeCardSelection'
import { useToastStore } from '../../stores/toastStore'
import { Z_INDEX } from '../../utils/zIndex'

interface NodeDetailPanelProps {
  detailPanel: DetailPanelState | null
  detailPanelWidth: number
  detailFontSize: number
  allowSelectionActions: boolean
  nodes: Array<{ id: string; data?: Partial<NodeCardData> }>
  onStartResize: (event: React.MouseEvent) => void
  onChangeFontSize: (next: number | ((current: number) => number)) => void
  onClose: () => void
  onOpenInChat: (nodeId: string) => void
  onPreviewImage: (src: string) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

export function NodeDetailPanel({
  detailPanel,
  detailPanelWidth,
  detailFontSize,
  allowSelectionActions,
  nodes,
  onStartResize,
  onChangeFontSize,
  onClose,
  onOpenInChat,
  onPreviewImage,
  t
}: NodeDetailPanelProps) {
  const { showToast } = useToastStore()
  const selection = useNodeCardSelection()

  useEffect(() => {
    selection.clearReadOnlyState()
  }, [detailPanel?.nodeId, selection.clearReadOnlyState])

  if (!detailPanel) return null

  const detailNode = nodes.find((n) => n.id === detailPanel.nodeId)
  const detailNodeData = (detailNode?.data || {}) as Partial<NodeCardData>
  const detailImages: NodeImage[] = (detailNode?.data?.images as NodeImage[]) || []
  const detailAttachments: NodeAttachment[] = (detailNode?.data?.attachments as NodeAttachment[]) || []
  const detailAllNodes = (detailNodeData.allNodes || []) as Node[]
  const canExpandFromSelection = allowSelectionActions && typeof detailNodeData.onExpand === 'function'

  const handleDownloadAttachment = (attachment: NodeAttachment) => {
    try {
      downloadNodeAttachment(attachment)
    } catch (error) {
      console.error('Failed to download attachment:', error)
      showToast(t('toast.attachmentDownloadFailed'), 'error')
    }
  }

  return (
    <div
      className="relative z-50 min-h-0 bg-background border-l border-border flex flex-col shadow-lg shrink-0"
      style={{ width: `${detailPanelWidth}px` }}
    >
      <div
        className="absolute left-0 top-0 h-full w-2 -translate-x-1/2 cursor-col-resize z-50"
        onMouseDown={onStartResize}
      />
      <div className="flex items-center justify-between px-4 py-3 border-b bg-secondary/30">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{t('canvas.detail.title')}</div>
          <div className="text-[11px] text-muted-foreground truncate">ID: {detailPanel.nodeId}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenInChat(detailPanel.nodeId)}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={t('canvas.detail.openInChat')}
          >
            <MessageSquareText className="w-3.5 h-3.5" />
            {t('canvas.detail.openInChat')}
          </button>
          <span className="text-xs text-muted-foreground">{t('canvas.detail.fontSize')}</span>
          <button
            onClick={() => onChangeFontSize((size) => Math.max(12, size - 1))}
            className="px-1.5 py-1 text-xs rounded border border-border hover:bg-accent"
            title={t('canvas.detail.fontDecrease')}
          >
            A-
          </button>
          <input
            type="range"
            min={12}
            max={24}
            value={detailFontSize}
            onChange={(e) => onChangeFontSize(Number(e.target.value))}
            className="w-24"
          />
          <button
            onClick={() => onChangeFontSize((size) => Math.min(24, size + 1))}
            className="px-1.5 py-1 text-xs rounded border border-border hover:bg-accent"
            title={t('canvas.detail.fontIncrease')}
          >
            A+
          </button>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5" onWheelCapture={(event) => event.stopPropagation()}>
        {(detailImages.length > 0 || detailAttachments.length > 0 || detailPanel.question.trim()) && (
          <div className="mb-4 rounded border border-border bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground mb-2">{t('canvas.detail.question')}</div>
            {detailImages.length > 0 && (
              <>
                <div className="mb-3 grid grid-cols-3 gap-2 md:grid-cols-4">
                  {detailImages.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => onPreviewImage(`data:${img.mimeType};base64,${img.base64}`)}
                      className="group relative overflow-hidden rounded-md border border-border/70 bg-background text-left shadow-sm transition-all hover:border-primary/45 hover:shadow"
                      title={img.name || t('node.imageAttachment')}
                    >
                      <img
                        src={`data:${img.mimeType};base64,${img.base64}`}
                        alt={img.name || t('node.imageAttachment')}
                        className="h-16 w-full object-cover md:h-20"
                      />
                      {(img.name || '').trim() && (
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-1.5 py-1">
                          <div className="line-clamp-1 text-[10px] text-white/90">{img.name}</div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
            {detailAttachments.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {detailAttachments.map((attachment) => (
                  <div key={attachment.id} className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs">
                    <span className="truncate text-foreground">{attachment.name}</span>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-muted-foreground">{formatFileSize(attachment.size)}</span>
                      <button
                        type="button"
                        onClick={() => handleDownloadAttachment(attachment)}
                        className="w-5 h-5 rounded border border-border/70 text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center transition-colors"
                        title={t('node.downloadAttachment')}
                      >
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {detailPanel.question.trim() && (
              <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{detailPanel.question}</div>
            )}
          </div>
        )}
        {detailPanel.thinking.trim() && (
          <details className="mb-4 rounded border border-border bg-muted/30 p-3 nowheel nodrag" onWheelCapture={(event) => event.stopPropagation()}>
            <summary className="cursor-pointer select-none text-xs text-muted-foreground">{t('canvas.detail.thinking')}</summary>
            <div className="mt-2 max-h-56 overflow-y-auto nowheel nodrag" onWheelCapture={(event) => event.stopPropagation()}>
              <div
                className="prose prose-slate dark:prose-invert max-w-none prose-p:text-muted-foreground prose-li:text-muted-foreground prose-code:text-[11px] prose-pre:text-[11px] prose-strong:text-foreground/80"
                style={{
                  fontSize: `${Math.max(12, detailFontSize - 2)}px`,
                  lineHeight: 1.65
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{detailPanel.thinking}</ReactMarkdown>
              </div>
            </div>
          </details>
        )}
        <div
          ref={selection.contentRef}
          onMouseUp={() => selection.handleTextSelection(!canExpandFromSelection, false)}
          className="prose prose-slate dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground/90 prose-li:text-foreground/90 prose-strong:text-foreground"
          style={{
            fontSize: `${detailFontSize}px`,
            lineHeight: 1.7
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{detailPanel.content}</ReactMarkdown>
        </div>
      </div>

      {canExpandFromSelection && selection.selectionMenu && !selection.showPromptInput && !selection.showContextPanel && createPortal(
        <div
          className="selection-menu fixed bg-background text-foreground rounded-lg shadow-lg border border-border p-1 flex gap-1"
          style={{
            zIndex: Z_INDEX.canvasSelectionMenu,
            left: selection.selectionMenu.x,
            top: selection.selectionMenu.y,
            transform: 'translateX(-50%)'
          }}
        >
          <button
            onClick={() => selection.handleDirectExpand(detailNodeData.onExpand!)}
            className="px-3 py-1.5 text-xs font-medium rounded hover:bg-accent transition-colors whitespace-nowrap"
          >
            {t('node.selection.direct')}
          </button>
          <button
            onClick={() => selection.handleCustomPrompt()}
            className="px-3 py-1.5 text-xs font-medium rounded hover:bg-accent transition-colors whitespace-nowrap"
          >
            {t('node.selection.targeted')}
          </button>
          <button
            onClick={() => selection.handleContextExpand(detailAllNodes, showToast)}
            className="px-3 py-1.5 text-xs font-medium rounded hover:bg-accent transition-colors whitespace-nowrap"
          >
            {t('node.selection.context')}
          </button>
        </div>,
        document.body
      )}

      {canExpandFromSelection && selection.showPromptInput && selection.selectionMenu && createPortal(
        <div
          className="selection-menu fixed bg-background text-foreground rounded-lg shadow-lg border border-border p-3"
          style={{
            zIndex: Z_INDEX.canvasSelectionMenu,
            left: selection.selectionMenu.x,
            top: selection.selectionMenu.y,
            transform: 'translateX(-50%)',
            width: '320px'
          }}
        >
          <textarea
            value={selection.customPrompt}
            onChange={(event) => selection.setCustomPrompt(event.target.value)}
            rows={3}
            className="w-full p-2 text-sm rounded border border-border/60 bg-background resize-none outline-none focus:border-primary/40 mb-2"
            placeholder={t('node.selection.placeholder')}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => selection.clearSelection()}
              className="px-3 py-1 text-xs font-medium rounded hover:bg-accent transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => selection.handleSubmitCustomPrompt(detailNodeData.onExpand!)}
              disabled={!selection.customPrompt.trim()}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              {t('node.selection.confirmExpand')}
            </button>
          </div>
        </div>,
        document.body
      )}

      {canExpandFromSelection && selection.showContextPanel && selection.selectionMenu && createPortal(
        <ContextPanel
          currentNodeId={detailPanel.nodeId}
          allNodes={detailAllNodes}
          onDirectExpand={(selectedNodeIds) => {
            const text = selection.selectionMenu?.text
            const sourceRef = selection.selectionMenu?.sourceRef
            selection.clearSelection()
            if (text) {
              detailNodeData.onExpand?.(text, selectedNodeIds, sourceRef, 'direct')
            }
          }}
          onTargetedQuestion={(selectedNodeIds) => {
            selection.handleContextConfirm(selectedNodeIds)
            selection.handleCustomPrompt()
          }}
          onClose={selection.closeContextPanel}
        />,
        document.body
      )}
    </div>
  )
}
