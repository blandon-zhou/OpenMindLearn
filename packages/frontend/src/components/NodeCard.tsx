import { memo, useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, NodeResizer } from '@xyflow/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles, Loader2, Save, ImagePlus, FilePlus2, Paperclip, Download, X } from 'lucide-react'
import { cn } from '../utils/cn'
import { ImageLightbox } from './ImageLightbox'
import { ContextPanel } from './ContextPanel'
import { useToastStore } from '../stores/toastStore'
import { NODE_MIN_WIDTH, NODE_MIN_HEIGHT } from '../types/canvas'
import type { NodeCardProps } from '../types/nodeCard'

import { fingerprintBase64 } from '../utils/textMeta'
import { readFilesAsNodeImages, readClipboardImages } from '../utils/image'
import { formatFileSize, readFilesAsNodeAttachments, downloadNodeAttachment } from '../utils/attachment'
import { getContainerPlainText, clearSourceHighlightMarks, applySourceHighlightByRanges } from '../utils/sourceHighlight'
import { useNodeCardSelection } from '../hooks/useNodeCardSelection'
import { useI18n } from '../hooks/useI18n'

export const NodeCard = memo(({ data, selected }: NodeCardProps) => {
  const isReadOnly = data.mode === 'view'
  const isGenerating = Boolean(data.isGenerating)
  const images = data.images || []
  const hasImages = images.length > 0
  const attachments = data.attachments || []
  const hasAttachments = attachments.length > 0
  const { t } = useI18n()
  const [isEditing, setIsEditing] = useState(data.isEditing || false)
  const [content, setContent] = useState(data.content)
  const [loading, setLoading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [generateIndicatorScale, setGenerateIndicatorScale] = useState(1)
  const cardRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { showToast } = useToastStore()

  const selection = useNodeCardSelection()

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    readFilesAsNodeImages(files).then((newImages) => {
      data.onImagesChange?.([...(data.images || []), ...newImages])
    })
    e.target.value = ''
  }, [data])

  const handleAttachmentUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    readFilesAsNodeAttachments(files).then(({ attachments: newAttachments, tooLargeFiles }) => {
      if (newAttachments.length > 0) {
        data.onAttachmentsChange?.([...(data.attachments || []), ...newAttachments])
      }
      if (tooLargeFiles.length > 0) {
        const displayNames = tooLargeFiles.length > 3
          ? `${tooLargeFiles.slice(0, 3).join(', ')}...`
          : tooLargeFiles.join(', ')
        showToast(t('toast.attachmentsTooLarge', { files: displayNames, maxSize: '50MB' }), 'error')
      }
    })
    e.target.value = ''
  }, [data, showToast, t])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (isReadOnly) return
    const items = e.clipboardData.items
    const hasImage = Array.from(items).some((item) => item.type.startsWith('image/'))
    if (!hasImage) return
    e.preventDefault()
    readClipboardImages(items).then((newImages) => {
      if (newImages.length > 0) {
        data.onImagesChange?.([...(data.images || []), ...newImages])
      }
    })
  }, [data, isReadOnly])

  useEffect(() => {
    if (data.content && data.content !== content) {
      setContent(data.content)
      setIsEditing(false)
    }
  }, [data.content])

  useEffect(() => {
    setIsEditing(!isReadOnly && Boolean(data.isEditing))
  }, [data.isEditing, isReadOnly])

  useEffect(() => {
    if (isReadOnly) {
      setIsEditing(false)
      selection.clearReadOnlyState()
    }
  }, [isReadOnly])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isEditing])

  useEffect(() => {
    const card = cardRef.current
    if (!card) return

    const updateScale = () => {
      const rect = card.getBoundingClientRect()
      const minSide = Math.min(rect.width, rect.height)
      const nextScale = Math.max(1, Math.min(2.2, minSide / 320))
      setGenerateIndicatorScale((prev) => (Math.abs(prev - nextScale) < 0.05 ? prev : nextScale))
    }

    updateScale()
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => updateScale())
    observer.observe(card)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = selection.contentRef.current
    if (!container || isEditing) return

    clearSourceHighlightMarks(container)
    const plainText = getContainerPlainText(container)
    const validHighlights = (data.sourceHighlights || []).filter((highlight) => {
      if (!highlight.upstreamFingerprintBase64) return false
      if (highlight.rangeStart < 0 || highlight.rangeEnd <= highlight.rangeStart) return false
      if (highlight.rangeEnd > plainText.length) return false
      return highlight.upstreamFingerprintBase64 === fingerprintBase64(plainText)
    })

    if (validHighlights.length > 0) {
      applySourceHighlightByRanges(container, validHighlights)
    }

    const handleHighlightClick = (event: MouseEvent) => {
      if (!data.onSourceHighlightClick) return
      const target = event.target as HTMLElement | null
      const mark = target?.closest('mark[data-source-highlight="true"]') as HTMLElement | null
      if (!mark) return

      const targetNodeIds = (mark.dataset.targetNodeIds || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
      if (targetNodeIds.length === 0) return

      event.preventDefault()
      event.stopPropagation()
      data.onSourceHighlightClick(targetNodeIds, data.nodeId)
    }

    container.addEventListener('click', handleHighlightClick)
    return () => container.removeEventListener('click', handleHighlightClick)
  }, [content, isEditing, data.sourceHighlights, data.onSourceHighlightClick])

  const handleGenerate = async () => {
    if (!content.trim()) return
    setLoading(true)
    try {
      await data.onGenerate(content)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = () => {
    data.onSaveContent(content)
    setIsEditing(false)
  }

  const handleDownloadAttachment = useCallback((attachment: typeof attachments[number]) => {
    try {
      downloadNodeAttachment(attachment)
    } catch (error) {
      console.error('Failed to download attachment:', error)
      showToast(t('toast.attachmentDownloadFailed'), 'error')
    }
  }, [showToast, t])

  return (
    <div
      ref={cardRef}
      onPaste={handlePaste}
      className={cn(
        'rounded-lg border bg-background text-foreground shadow-sm transition-all',
        'w-full h-full min-h-0 relative group flex flex-col',
        data.searchMatched && 'ring-2 ring-amber-400/80 shadow-md',
        data.searchActive && 'ring-2 ring-amber-500 shadow-lg',
        data.sourceLinkedActive && 'ring-2 ring-sky-500/80 shadow-lg',
        isEditing && 'ring-1 ring-primary/40 shadow-md'
      )}
      style={{
        borderColor: data.expansionColor || undefined,
        borderWidth: data.expansionColor ? '2px' : undefined
      }}
    >
      <NodeResizer
        minWidth={NODE_MIN_WIDTH}
        minHeight={NODE_MIN_HEIGHT}
        shouldResize={(_, params) => (
          params.width >= NODE_MIN_WIDTH &&
          params.height >= NODE_MIN_HEIGHT
        )}
        isVisible={Boolean(selected) && !isReadOnly}
        lineClassName="!border-primary/35"
        handleClassName="!w-2.5 !h-2.5 !rounded-sm !bg-background !border !border-primary/55"
      />

      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-primary/50 !border-2 !border-background"
      />

      <div className="p-2 flex-1 min-h-0 flex flex-col overflow-hidden">
        {!isEditing && (
          <div className="mb-1 flex flex-wrap gap-1">
            {(data.tags || []).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 text-[11px] rounded bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/45 dark:text-blue-200 dark:border-blue-800">
                #{tag}
              </span>
            ))}
            {(data.note || '').trim() && (
              <span className="px-1.5 py-0.5 text-[11px] rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/45 dark:text-amber-200 dark:border-amber-800">
                {t('node.note')}
              </span>
            )}
          </div>
        )}
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            className={cn(
              'w-full flex-1 min-h-[180px] p-1.5 text-sm rounded border border-border/60 bg-background',
              'resize-none outline-none focus:border-primary/40',
              'placeholder:text-muted-foreground/50 nowheel nodrag'
            )}
            placeholder={t('node.placeholder')}
          />
        ) : isGenerating ? (
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <div
              className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary animate-pulse"
              style={{
                transform: `scale(${generateIndicatorScale})`,
                transformOrigin: 'center center'
              }}
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t('common.generating')}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-1 flex-1 min-h-0 flex flex-col">
            {(data.thinking || '').trim() && (
              <details
                className="text-[10px] rounded border border-border/60 bg-muted/35 p-1.5 shrink-0 nowheel nodrag"
                onWheelCapture={(event) => event.stopPropagation()}
              >
                <summary className="cursor-pointer select-none text-[10px] text-muted-foreground">{t('node.thinkingSummary')}</summary>
                <div
                  className="mt-1 max-h-36 overflow-y-auto nowheel nodrag text-muted-foreground"
                  onWheelCapture={(event) => event.stopPropagation()}
                >
                  <div className="prose prose-xs dark:prose-invert max-w-none leading-relaxed prose-p:text-[10px] prose-li:text-[10px] prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground/80 prose-headings:text-[11px] prose-headings:text-foreground/80 prose-code:text-[10px] prose-pre:text-[10px]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.thinking || ''}</ReactMarkdown>
                  </div>
                </div>
              </details>
            )}
            <div
              ref={selection.contentRef}
              onMouseUp={() => selection.handleTextSelection(isReadOnly, isEditing)}
              className="prose prose-sm prose-slate dark:prose-invert max-w-none flex-1 min-h-0 overflow-y-auto text-sm leading-relaxed nowheel nodrag select-text
                prose-p:text-[13px] prose-li:text-[13px] prose-blockquote:text-[13px]
                prose-headings:my-2 prose-headings:font-semibold
                prose-headings:text-foreground prose-p:text-foreground/90 prose-li:text-foreground/90 prose-strong:text-foreground
                prose-h1:text-[16px] prose-h2:text-[15px] prose-h3:text-[14px] prose-h4:text-[13px]
                prose-code:text-[12px] prose-pre:text-[12px]"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || t('node.empty')}</ReactMarkdown>
            </div>
            {(data.note || '').trim() && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded p-1.5 border border-border/60 line-clamp-3 shrink-0">
                {data.note}
              </div>
            )}
          </div>
        )}

        {hasImages && (
          <div className="mt-0 shrink-0 nowheel nodrag">
            <div className="flex gap-1 overflow-x-auto">
              {images.map((img) => (
                <div key={img.id} className="relative group/img shrink-0">
                  <button
                    type="button"
                    className="h-10 w-14 overflow-hidden rounded-sm border border-border/65 bg-background transition-colors hover:border-primary/45"
                    onClick={() => setPreviewImage(`data:${img.mimeType};base64,${img.base64}`)}
                    title={img.name || t('node.imageAttachment')}
                  >
                    <img
                      src={`data:${img.mimeType};base64,${img.base64}`}
                      alt={img.name || t('node.imageAttachment')}
                      className="h-full w-full object-cover"
                    />
                  </button>
                  {!isReadOnly && isEditing && (
                    <button
                      onClick={() => {
                        const next = images.filter(i => i.id !== img.id)
                        data.onImagesChange?.(next)
                      }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                      title={t('node.removeImage')}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasAttachments && (
          <div className="mt-1 shrink-0 nowheel nodrag space-y-1">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="flex items-center gap-2 rounded border border-border/65 bg-muted/30 px-2 py-1 text-[11px]">
                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-foreground" title={attachment.name}>{attachment.name}</div>
                  <div className="text-muted-foreground">{formatFileSize(attachment.size)}</div>
                </div>
                <button
                  onClick={() => handleDownloadAttachment(attachment)}
                  className="w-5 h-5 rounded border border-border/70 text-muted-foreground hover:text-foreground hover:bg-background flex items-center justify-center transition-colors"
                  title={t('node.downloadAttachment')}
                >
                  <Download className="w-3 h-3" />
                </button>
                {!isReadOnly && isEditing && (
                  <button
                    onClick={() => {
                      const next = attachments.filter((item) => item.id !== attachment.id)
                      data.onAttachmentsChange?.(next)
                    }}
                    className="w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    title={t('node.removeAttachment')}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isEditing && !isReadOnly && (
        <div className="flex items-center justify-end gap-1.5 px-2 py-1.5 bg-secondary/20 border-t">
          <label
            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded border border-border/70 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={t('node.addImage')}
          >
            <ImagePlus className="w-3 h-3" />
            <span>{t('node.imageButton', { count: images.length > 0 ? `(${images.length})` : '' })}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={handleFileUpload} />
          </label>
          <label
            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded border border-border/70 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={t('node.addAttachment')}
          >
            <FilePlus2 className="w-3 h-3" />
            <span>{t('node.attachmentButton', { count: attachments.length > 0 ? `(${attachments.length})` : '' })}</span>
            <input type="file" multiple className="hidden" onChange={handleAttachmentUpload} />
          </label>
          <button
            onClick={handleSave}
            disabled={!content.trim()}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded',
              'text-muted-foreground hover:text-foreground hover:bg-secondary',
              'disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
            )}
            title={t('node.saveContent')}
          >
            <Save className="w-3 h-3" />
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || !content.trim()}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
            )}
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {loading ? '...' : t('node.generate')}
          </button>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-primary/50 !border-2 !border-background"
      />

      {selection.selectionMenu && !selection.showPromptInput && !selection.showContextPanel && createPortal(
        <div
          className="selection-menu fixed z-[10000] bg-background text-foreground rounded-lg shadow-lg border border-border p-1 flex gap-1"
          style={{
            left: selection.selectionMenu.x,
            top: selection.selectionMenu.y,
            transform: 'translateX(-50%)'
          }}
        >
          <button
            onClick={() => selection.handleDirectExpand(data.onExpand)}
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
            onClick={() => selection.handleContextExpand(data.allNodes, showToast)}
            className="px-3 py-1.5 text-xs font-medium rounded hover:bg-accent transition-colors whitespace-nowrap"
          >
            {t('node.selection.context')}
          </button>
        </div>,
        document.body
      )}

      {selection.showPromptInput && selection.selectionMenu && createPortal(
        <div
          className="selection-menu fixed z-[10000] bg-background text-foreground rounded-lg shadow-lg border border-border p-3"
          style={{
            left: selection.selectionMenu.x,
            top: selection.selectionMenu.y,
            transform: 'translateX(-50%)',
            width: '320px'
          }}
        >
          <textarea
            value={selection.customPrompt}
            onChange={(e) => selection.setCustomPrompt(e.target.value)}
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
              onClick={() => selection.handleSubmitCustomPrompt(data.onExpand)}
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

      {selection.showContextPanel && selection.selectionMenu && data.allNodes && createPortal(
        <ContextPanel
          currentNodeId={data.nodeId}
          allNodes={data.allNodes}
          onConfirm={(selectedNodeIds) => {
            const text = selection.selectionMenu?.text
            const sourceRef = selection.selectionMenu?.sourceRef
            selection.clearSelection()
            if (text) {
              data.onExpand(text, selectedNodeIds, sourceRef, 'custom_context')
            }
          }}
          onClose={() => selection.clearSelection()}
        />,
        document.body
      )}

      {previewImage && (
        <ImageLightbox src={previewImage} onClose={() => setPreviewImage(null)} />
      )}
    </div>
  )
})
