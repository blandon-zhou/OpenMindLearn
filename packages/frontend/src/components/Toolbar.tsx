import { useState } from 'react'
import { useGraphStore } from '../stores/graphStore'
import { FileText, Save, FolderOpen, FilePlus, Settings, Eye, GraduationCap, MessageSquareText } from 'lucide-react'
import { SettingsDialog } from './SettingsDialog'
import type { CanvasMode } from '../types/canvas'
import { useI18n } from '../hooks/useI18n'

interface ToolbarProps {
  onSave: () => void
  onLoad: () => void
  onNew: () => void
  mode: CanvasMode
  surfaceMode: 'canvas' | 'chat'
  onModeChange: (mode: CanvasMode) => void
  onSurfaceModeChange: (mode: 'canvas' | 'chat') => void
}

export function Toolbar({
  onSave,
  onLoad,
  onNew,
  mode,
  surfaceMode,
  onModeChange,
  onSurfaceModeChange
}: ToolbarProps) {
  const { fileName, isDirty, setFileName } = useGraphStore()
  const { t } = useI18n()
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(fileName)
  const [showSettings, setShowSettings] = useState(false)

  const handleFileNameClick = () => {
    setIsEditing(true)
    setEditValue(fileName)
  }

  const handleFileNameBlur = () => {
    setIsEditing(false)
    if (editValue.trim()) {
      setFileName(editValue.trim())
    } else {
      setEditValue(fileName)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFileNameBlur()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setEditValue(fileName)
    }
  }

  return (
    <div className="h-14 border-b border-border bg-background text-foreground relative flex items-center justify-between px-4">
      {/* 左侧：文件名和状态 */}
      <div className="flex items-center gap-2">
        <FileText className="w-5 h-5 text-muted-foreground" />
        {isEditing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleFileNameBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            className="px-2 py-1 border border-border bg-background rounded focus:outline-none focus:ring-2 focus:ring-primary"
          />
        ) : (
          <button
            onClick={handleFileNameClick}
            className="px-2 py-1 hover:bg-accent rounded font-medium"
          >
            {fileName}
          </button>
        )}
        {isDirty && (
          <span className="text-muted-foreground text-sm">• {t('toolbar.unsaved')}</span>
        )}
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 flex items-center p-1 rounded-lg border border-border bg-muted/40 gap-1">
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

      {/* 右侧：操作按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent rounded text-sm"
          title={t('toolbar.settings.title')}
        >
          <Settings className="w-4 h-4" />
          {t('toolbar.settings')}
        </button>
        <button
          onClick={onNew}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent rounded text-sm"
          title={t('toolbar.new.title')}
        >
          <FilePlus className="w-4 h-4" />
          {t('toolbar.new')}
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
