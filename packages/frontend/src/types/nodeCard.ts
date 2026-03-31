import type { Node, SourceReference, NodeImage, NodeAttachment } from './index'
import type { SourceHighlight } from './canvas'
import type { ExpandMode } from '../stores/settingsStore'

export interface SelectionMenuState {
  x: number
  y: number
  text: string
  sourceRef: SourceReference
}

export interface NodeCardData {
  content: string
  thinking?: string
  isGenerating?: boolean
  isEditing?: boolean
  mode?: 'learn' | 'view'
  nodeId: string
  tags?: string[]
  note?: string
  searchMatched?: boolean
  searchActive?: boolean
  sourceLinkedActive?: boolean
  onGenerate: (content: string) => void
  onSaveContent: (content: string) => void
  onExpand: (text: string, selectedNodeIds?: string[], sourceRef?: SourceReference, expandMode?: ExpandMode) => void
  allNodes?: Node[]
  expansionColor?: string
  sourceHighlights?: SourceHighlight[]
  onSourceHighlightClick?: (targetNodeIds: string[], sourceNodeId: string) => void
  images?: NodeImage[]
  onImagesChange?: (images: NodeImage[]) => void
  attachments?: NodeAttachment[]
  onAttachmentsChange?: (attachments: NodeAttachment[]) => void
}

export interface NodeCardProps {
  data: NodeCardData
  selected?: boolean
}
