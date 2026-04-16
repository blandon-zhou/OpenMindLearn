import { useCallback, useMemo, useRef, useState } from 'react'
import { FolderOpen, Save, Settings, Eye, GraduationCap, MessageSquareText, X, Plus, FileText } from 'lucide-react'
import { SettingsDialog } from './SettingsDialog'
import { ProfileSwitcher } from './ProfileSwitcher'
import type { CanvasMode } from '../types/canvas'
import { useI18n } from '../hooks/useI18n'

interface ToolbarDocumentItem {
  id: string
  fileName: string
  isDirty: boolean
}

interface ToolbarProps {
  documents: ToolbarDocumentItem[]
  activeDocId: string | null
  onDocSwitch: (docId: string) => void
  onDocClose: (docId: string) => void
  onDocNew: () => void
  onDocRename: (docId: string, nextName: string) => void
  onSave: () => void
  onLoad: () => void
  mode: CanvasMode
  surfaceMode: 'canvas' | 'chat'
  onModeChange: (mode: CanvasMode) => void
  onSurfaceModeChange: (mode: 'canvas' | 'chat') => void
}

export function Toolbar({
  documents,
  activeDocId,
  onDocSwitch,
  onDocClose,
  onDocNew,
  onDocRename,
  onSave,
  onLoad,
  mode,
  surfaceMode,
  onModeChange,
  onSurfaceModeChange
}: ToolbarProps) {
  const { t } = useI18n()
  const [showSettings, setShowSettings] = useState(false)
  const [editingDocId, setEditingDocId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const tabScrollRef = useRef<HTMLDivElement>(null)

  const activeDoc = useMemo(() => {
    if (!activeDocId) return null
    return documents.find((doc) => doc.id === activeDocId) || null
  }, [activeDocId, documents])

  const startRename = (docId: string, fileName: string) => {
    setEditingDocId(docId)
    setEditingName(fileName)
  }

  const finishRename = () => {
    if (!editingDocId) return
    const fallbackName = documents.find((doc) => doc.id === editingDocId)?.fileName || ''
    const nextName = editingName.trim()
    if (nextName) {
      onDocRename(editingDocId, nextName)
    } else if (fallbackName) {
      setEditingName(fallbackName)
    }
    setEditingDocId(null)
  }

  const cancelRename = () => {
    setEditingDocId(null)
    setEditingName('')
  }

  const handleTabWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const container = tabScrollRef.current
    if (!container) return
    if (container.scrollWidth <= container.clientWidth) return

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY

    if (delta === 0) return
    event.preventDefault()
    container.scrollLeft += delta
  }, [])

  return (
    <div className="h-14 border-b border-border bg-background text-foreground px-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <div
          ref={tabScrollRef}
          onWheel={handleTabWheel}
          className="tabs-scroll flex-1 min-w-0 overflow-x-auto"
        >
          <div className="flex items-center gap-1 w-max min-w-full">
          {documents.map((doc) => {
            const isActive = doc.id === activeDocId
            const isEditing = editingDocId === doc.id
            return (
              <div
                key={doc.id}
                className={`group inline-flex items-center gap-1.5 px-2 py-1 rounded border text-sm max-w-[220px] shrink-0 ${
                  isActive
                    ? 'border-primary/50 bg-accent text-foreground'
                    : 'border-border/70 bg-muted/40 text-muted-foreground hover:text-foreground'
                }`}
              >
                {isEditing ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onBlur={finishRename}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') finishRename()
                      if (event.key === 'Escape') cancelRename()
                    }}
                    autoFocus
                    className="px-1 py-0.5 text-xs bg-background border border-border rounded min-w-[80px] max-w-[150px]"
                  />
                ) : (
                  <button
                    onClick={() => onDocSwitch(doc.id)}
                    onDoubleClick={() => startRename(doc.id, doc.fileName)}
                    className="truncate text-left"
                    title={doc.fileName}
                  >
                    {doc.fileName}
                  </button>
                )}
                {doc.isDirty && <span className="text-[10px] text-muted-foreground">●</span>}
                <button
                  onClick={() => onDocClose(doc.id)}
                  className="opacity-70 hover:opacity-100 rounded p-0.5"
                  title={t('toolbar.tab.close')}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}
          </div>
        </div>
        <button
          onClick={onDocNew}
          className="inline-flex items-center justify-center h-7 w-7 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent shrink-0"
          title={t('toolbar.tab.new')}
        >
          <Plus className="w-4 h-4" />
        </button>
        {activeDoc?.isDirty && (
          <span className="text-muted-foreground text-xs whitespace-nowrap">• {t('toolbar.unsaved')}</span>
        )}
      </div>

      <div className="flex items-center p-1 rounded-lg border border-border bg-muted/40 gap-1 justify-self-center">
        <button
          onClick={() => {
            onModeChange('learn')
            onSurfaceModeChange('canvas')
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
            surfaceMode === 'canvas' && mode === 'learn'
              ? 'bg-background shadow-sm text-foreground border border-border'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
          title={t('toolbar.mode.learn.title')}
        >
          <GraduationCap className="w-4 h-4" />
          {t('toolbar.mode.learn')}
        </button>
        <button
          onClick={() => onSurfaceModeChange('chat')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
            surfaceMode === 'chat'
              ? 'bg-background shadow-sm text-foreground border border-border'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
          title={t('toolbar.surface.chat.title')}
        >
          <MessageSquareText className="w-4 h-4" />
          {t('toolbar.surface.chat')}
        </button>
        <button
          onClick={() => {
            onModeChange('view')
            onSurfaceModeChange('canvas')
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
            surfaceMode === 'canvas' && mode === 'view'
              ? 'bg-background shadow-sm text-foreground border border-border'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
          title={t('toolbar.mode.view.title')}
        >
          <Eye className="w-4 h-4" />
          {t('toolbar.mode.view')}
        </button>
      </div>

      <div className="flex items-center gap-2 shrink-0 justify-self-end">
        <ProfileSwitcher />
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent rounded text-sm"
          title={t('toolbar.settings.title')}
        >
          <Settings className="w-4 h-4" />
          {t('toolbar.settings')}
        </button>
        <button
          onClick={onLoad}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent rounded text-sm"
          title={t('toolbar.open.title')}
        >
          <FolderOpen className="w-4 h-4" />
          {t('toolbar.open')}
        </button>
        <button
          onClick={onSave}
          className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded text-sm"
          title={t('toolbar.save.title')}
        >
          <Save className="w-4 h-4" />
          {t('toolbar.save')}
        </button>
      </div>

      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}
