import type { NodeAttachment } from '../types'
import { base64ToBlob } from './base64'

export const MAX_NODE_ATTACHMENT_BYTES = 50 * 1024 * 1024

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function readFileAsNodeAttachment(file: File): Promise<NodeAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(',')[1]
      const mimeType = file.type || 'application/octet-stream'
      resolve({
        id: generateAttachmentId(),
        base64,
        mimeType,
        name: file.name || 'attachment',
        size: file.size
      })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function readFilesAsNodeAttachments(
  files: File[],
  maxBytes = MAX_NODE_ATTACHMENT_BYTES
): Promise<{ attachments: NodeAttachment[]; tooLargeFiles: string[] }> {
  const tooLargeFiles: string[] = []
  const validFiles: File[] = []

  files.forEach((file) => {
    if (file.size > maxBytes) {
      tooLargeFiles.push(file.name || 'unknown')
      return
    }
    validFiles.push(file)
  })

  const attachments = await Promise.all(validFiles.map((file) => readFileAsNodeAttachment(file)))
  return { attachments, tooLargeFiles }
}

export function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function downloadNodeAttachment(attachment: NodeAttachment) {
  const fileName = (attachment.name || '').trim() || `${attachment.id || 'attachment'}.bin`
  const blob = base64ToBlob(attachment.base64, attachment.mimeType || 'application/octet-stream')
  const blobUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = fileName
  link.click()
  URL.revokeObjectURL(blobUrl)
}
