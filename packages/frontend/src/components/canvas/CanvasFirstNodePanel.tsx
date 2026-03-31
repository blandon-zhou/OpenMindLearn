import { ClipboardPaste, FilePlus2, ImagePlus, Sparkles, X } from 'lucide-react'
import type { ChangeEvent, ClipboardEvent } from 'react'
import type { NodeAttachment, NodeImage } from '../../types'
import { formatFileSize } from '../../utils/attachment'

interface CanvasFirstNodePanelProps {
  mode: 'learn' | 'view'
  hasNodes: boolean
  initialInput: string
  initialGenerating: boolean
  initialImages: NodeImage[]
  initialAttachments: NodeAttachment[]
  onInitialInputChange: (value: string) => void
  onInitialInputPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void
  onInitialImageUpload: (e: ChangeEvent<HTMLInputElement>) => void
  onInitialAttachmentUpload: (e: ChangeEvent<HTMLInputElement>) => void
  onRemoveInitialImage: (imageId: string) => void
  onRemoveInitialAttachment: (attachmentId: string) => void
  onPreviewImage: (src: string) => void
  onCreateFromText: () => void
  onGenerateFromPrompt: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}

export function CanvasFirstNodePanel({
  mode,
  hasNodes,
  initialInput,
  initialGenerating,
  initialImages,
  initialAttachments,
  onInitialInputChange,
  onInitialInputPaste,
  onInitialImageUpload,
  onInitialAttachmentUpload,
  onRemoveInitialImage,
  onRemoveInitialAttachment,
  onPreviewImage,
  onCreateFromText,
  onGenerateFromPrompt,
  t
}: CanvasFirstNodePanelProps) {
  if (hasNodes || mode !== 'learn') return null

  return (
    <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center p-4">
      <div className="pointer-events-auto w-full max-w-[560px] bg-background/95 border border-border rounded-xl shadow-lg p-4 backdrop-blur">
        <h3 className="text-base font-semibold text-foreground">{t('canvas.firstNode.title')}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t('canvas.firstNode.description')}</p>
        <textarea
          value={initialInput}
          onChange={(e) => onInitialInputChange(e.target.value)}
          onPaste={onInitialInputPaste}
          rows={6}
          className="mt-3 w-full p-3 text-sm rounded border border-border/70 bg-background resize-none outline-none focus:border-primary/50"
          placeholder={t('canvas.firstNode.placeholder')}
        />

        {initialImages.length > 0 && (
          <div className="mt-3 rounded-lg border border-border/70 bg-muted/25 p-2">
            <div className="mb-2 inline-flex items-center rounded-md border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
              {t('canvas.firstNode.imagesAdded', { count: initialImages.length })}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {initialImages.map((img) => (
                <div key={img.id} className="relative group/img shrink-0">
                  <button
                    type="button"
                    className="h-20 w-28 overflow-hidden rounded-md border border-border/70 bg-background shadow-sm transition-all hover:border-primary/45 hover:shadow"
                    onClick={() => onPreviewImage(`data:${img.mimeType};base64,${img.base64}`)}
                    title={img.name || t('node.imageAttachment')}
                  >
                    <img
                      src={`data:${img.mimeType};base64,${img.base64}`}
                      alt={img.name || t('node.imageAttachment')}
                      className="h-full w-full object-cover"
                    />
                  </button>
                  <button
                    onClick={() => onRemoveInitialImage(img.id)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                    title={t('node.removeImage')}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {initialAttachments.length > 0 && (
          <div className="mt-3 rounded-lg border border-border/70 bg-muted/25 p-2">
            <div className="mb-2 inline-flex items-center rounded-md border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
              {t('canvas.firstNode.attachmentsAdded', { count: initialAttachments.length })}
            </div>
            <div className="space-y-1">
              {initialAttachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-foreground">{attachment.name}</div>
                    <div className="text-[11px] text-muted-foreground">{formatFileSize(attachment.size)}</div>
                  </div>
                  <button
                    onClick={() => onRemoveInitialAttachment(attachment.id)}
                    className="w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    title={t('node.removeAttachment')}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded border border-border hover:bg-accent cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
              <ImagePlus className="w-4 h-4" />
              {t('canvas.firstNode.addImage')}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={onInitialImageUpload} />
            </label>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded border border-border hover:bg-accent cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
              <FilePlus2 className="w-4 h-4" />
              {t('canvas.firstNode.addAttachment')}
              <input type="file" multiple className="hidden" onChange={onInitialAttachmentUpload} />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCreateFromText}
              disabled={!initialInput.trim() || initialGenerating}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ClipboardPaste className="w-4 h-4" />
              {t('canvas.firstNode.createFromText')}
            </button>
            <button
              onClick={onGenerateFromPrompt}
              disabled={!initialInput.trim() || initialGenerating}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              {initialGenerating ? t('common.generating') : t('canvas.firstNode.generateFromPrompt')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
