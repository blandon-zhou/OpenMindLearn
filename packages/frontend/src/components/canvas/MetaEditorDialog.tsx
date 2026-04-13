import { X } from 'lucide-react'
import type { MetaEditorState } from '../../types/canvas'
import { Z_INDEX } from '../../utils/zIndex'

interface MetaEditorDialogProps {
  metaEditor: MetaEditorState | null
  onClose: () => void
  onChange: (next: MetaEditorState) => void
  onSave: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}

export function MetaEditorDialog({ metaEditor, onClose, onChange, onSave, t }: MetaEditorDialogProps) {
  if (!metaEditor) return null

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4"
      style={{ zIndex: Z_INDEX.canvasModal }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-[520px] bg-background text-foreground rounded-xl border border-border shadow-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t('canvas.metaEditor.title')}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">{t('canvas.metaEditor.tags')}</label>
          <input
            value={metaEditor.tagsText}
            onChange={(e) => onChange({ ...metaEditor, tagsText: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded border border-border"
            placeholder={t('canvas.metaEditor.tagsPlaceholder')}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">{t('canvas.metaEditor.note')}</label>
          <textarea
            value={metaEditor.note}
            onChange={(e) => onChange({ ...metaEditor, note: e.target.value })}
            rows={5}
            className="w-full px-3 py-2 text-sm rounded border border-border resize-none"
            placeholder={t('canvas.metaEditor.notePlaceholder')}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded border border-border hover:bg-accent">
            {t('common.cancel')}
          </button>
          <button onClick={onSave} className="px-3 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90">
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
