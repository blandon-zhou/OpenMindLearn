import { Download, Eye, History, MessageSquareText, Pencil, Plus, RefreshCw, Tags } from 'lucide-react'
import { MenuItem } from '../MenuItem'
import type { ContextMenuState } from '../../types/canvas'

interface CanvasContextMenuProps {
  contextMenu: ContextMenuState | null
  onCreateNode: (position: { x: number; y: number }) => void
  onOpenDetail: (nodeId: string) => void
  onEditNode: (nodeId: string) => void
  onRegenerateNode: (nodeId: string) => void
  onOpenMeta: (nodeId: string) => void
  onOpenVersions: (nodeId: string) => void
  onExportNode: (nodeId: string) => void
  onOpenInChat: (nodeId: string) => void
  onClose: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}

export function CanvasContextMenu({
  contextMenu,
  onCreateNode,
  onOpenDetail,
  onEditNode,
  onRegenerateNode,
  onOpenMeta,
  onOpenVersions,
  onExportNode,
  onOpenInChat,
  onClose,
  t
}: CanvasContextMenuProps) {
  if (!contextMenu) return null

  return (
    <div
      data-state="open"
      className="fixed z-[9999] min-w-[220px] rounded-lg border border-border bg-background text-foreground shadow-lg py-1"
      style={{ top: contextMenu.y, left: contextMenu.x }}
      onClick={(e) => e.stopPropagation()}
    >
      {contextMenu.type === 'pane' && contextMenu.flowPosition && (
        <MenuItem
          icon={<Plus className="w-4 h-4" />}
          label={t('canvas.menu.createNode')}
          onClick={() => {
            onCreateNode(contextMenu.flowPosition!)
            onClose()
          }}
        />
      )}

      {contextMenu.type === 'node' && contextMenu.nodeId && (
        <>
          <MenuItem
            icon={<Eye className="w-4 h-4" />}
            label={t('canvas.menu.viewDetail')}
            onClick={() => {
              onOpenDetail(contextMenu.nodeId!)
              onClose()
            }}
          />
          <MenuItem
            icon={<Pencil className="w-4 h-4" />}
            label={t('canvas.menu.edit')}
            onClick={() => {
              onEditNode(contextMenu.nodeId!)
              onClose()
            }}
          />
          <MenuItem
            icon={<Tags className="w-4 h-4" />}
            label={t('canvas.menu.tagsNotes')}
            onClick={() => {
              onOpenMeta(contextMenu.nodeId!)
              onClose()
            }}
          />
          <MenuItem
            icon={<History className="w-4 h-4" />}
            label={t('canvas.menu.versionHistory')}
            onClick={() => {
              onOpenVersions(contextMenu.nodeId!)
              onClose()
            }}
          />
          <MenuItem
            icon={<Download className="w-4 h-4" />}
            label={t('canvas.menu.exportMarkdown')}
            onClick={() => {
              onExportNode(contextMenu.nodeId!)
              onClose()
            }}
          />
          <MenuItem
            icon={<MessageSquareText className="w-4 h-4" />}
            label={t('canvas.menu.openBranchChat')}
            onClick={() => {
              onOpenInChat(contextMenu.nodeId!)
              onClose()
            }}
          />
          <div className="h-px bg-border mx-2 my-1" />
          <MenuItem
            icon={<RefreshCw className="w-4 h-4" />}
            label={t('canvas.menu.regenerate')}
            onClick={() => {
              onRegenerateNode(contextMenu.nodeId!)
              onClose()
            }}
          />
        </>
      )}
    </div>
  )
}
