export interface NodeImage {
  id: string
  base64: string
  mimeType: string
  name?: string
}

export interface NodeAttachment {
  id: string
  base64: string
  mimeType: string
  name: string
  size: number
}

export interface SourceReference {
  upstreamFingerprintBase64: string
  rangeStart: number
  rangeEnd: number
}

export interface NodeVersion {
  content: string
  timestamp: string
}

export interface Region {
  id: string
  name: string
  color: string
  description?: string
  x: number
  y: number
  width: number
  height: number
  createdAt?: string
}

export interface Node {
  id: string
  content: string
  thinking?: string
  question?: string
  position?: { x: number; y: number }
  width?: number
  height?: number
  parentIds: string[]
  createdAt?: string
  updatedAt?: string
  tags?: string[]
  note?: string
  versions?: NodeVersion[]
  expansionColor?: string
  sourceRef?: SourceReference
  images?: NodeImage[]
  attachments?: NodeAttachment[]
}
