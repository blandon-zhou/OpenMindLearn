import { X } from 'lucide-react'
import type { DiffLine, VersionDialogState } from '../../types/canvas'
import { cn } from '../../utils/cn'
import { Z_INDEX } from '../../utils/zIndex'

interface VersionDialogProps {
  versionDialog: VersionDialogState | null
  selectedVersionIndex: number
  selectedDiffLines: DiffLine[]
  onSelectVersion: (index: number) => void
  onRestore: () => void
  onClose: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}

export function VersionDialog({
  versionDialog,
  selectedVersionIndex,
  selectedDiffLines,
  onSelectVersion,
  onRestore,
  onClose,
  t
}: VersionDialogProps) {
  if (!versionDialog) return null

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4"
      style={{ zIndex: Z_INDEX.canvasModal }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-[980px] max-h-[80vh] overflow-hidden bg-background text-foreground rounded-xl border border-border shadow-xl flex">
        <div className="w-[280px] border-r border-border p-3 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">{t('canvas.version.title')}</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-accent">
              <X className="w-4 h-4" />
            </button>
          </div>
          {versionDialog.versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('canvas.version.none')}</p>
          ) : (
            <div className="space-y-1.5">
              {versionDialog.versions.map((version, index) => (
                <button
                  key={`${version.timestamp}-${index}`}
                  onClick={() => onSelectVersion(index)}
                  className={cn(
                    'w-full text-left px-2 py-1.5 rounded border text-xs',
                    selectedVersionIndex === index
                      ? 'bg-primary/10 border-primary/40 text-primary'
                      : 'border-border hover:bg-accent'
                  )}
                >
                  <div>{t('canvas.version.item', { index: index + 1 })}</div>
                  <div className="text-[11px] opacity-70 mt-0.5">{new Date(version.timestamp).toLocaleString()}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="text-sm text-muted-foreground">{t('canvas.version.diffTitle')}</div>
            <button
              onClick={onRestore}
              disabled={versionDialog.versions.length === 0}
              className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {t('canvas.version.restore')}
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 bg-muted/35">
            {versionDialog.versions.length === 0 ? (
              <div className="text-sm text-muted-foreground">{t('canvas.version.noDiff')}</div>
            ) : (
              <pre className="text-xs leading-relaxed">
                {selectedDiffLines.map((line, index) => (
                  <div
                    key={`${line.type}-${index}`}
                    className={cn(
                      'px-2 py-0.5 rounded',
                      line.type === 'added' && 'bg-green-100 text-green-800 dark:bg-green-950/45 dark:text-green-200',
                      line.type === 'removed' && 'bg-red-100 text-red-800 dark:bg-red-950/45 dark:text-red-200',
                      line.type === 'same' && 'text-foreground/80'
                    )}
                  >
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '} {line.text}
                  </div>
                ))}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
