import { useEffect, useMemo, useRef } from 'react'
import { useGraphStore } from '../stores/graphStore'
import { useToastStore } from '../stores/toastStore'
import type { NodeImage, NodeAttachment, Region } from '../types'
import { buildNodeSnapshots } from '../utils/graphSnapshot'
import { useI18n } from './useI18n'
import type { LocalDraftPayload } from './useCanvasFileIO'

const LOCAL_DRAFT_KEY = 'oml-local-draft-v1'
const LOCAL_DRAFT_VERSION = 1
const AUTO_SAVE_DELAY_MS = 600

interface LocalDraftEnvelope {
  version: number
  savedAt: string
  payload: LocalDraftPayload
}

interface CanvasLocalDraftOptions {
  nodes: any[]
  edges: any[]
  regions: Region[]
  initialInput: string
  initialImages: NodeImage[]
  initialAttachments: NodeAttachment[]
  initialGenerating: boolean
  onRestoreDraft: (draft: LocalDraftPayload) => void
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function parseDraft(raw: string | null): LocalDraftEnvelope | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as LocalDraftEnvelope
    const payload = parsed?.payload
    if (!parsed || parsed.version !== LOCAL_DRAFT_VERSION || !payload) return null
    if (!Array.isArray(payload.nodes) || !Array.isArray(payload.edges) || !Array.isArray(payload.regions)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function formatSavedAt(iso: string) {
  const time = new Date(iso)
  if (Number.isNaN(time.getTime())) return iso
  return `${time.toLocaleDateString()} ${time.toLocaleTimeString()}`
}

function hasDraftContent(payload: LocalDraftPayload) {
  return payload.nodes.length > 0
    || payload.edges.length > 0
    || payload.regions.length > 0
    || Boolean(payload.initialInput?.trim())
    || (payload.initialImages?.length || 0) > 0
    || (payload.initialAttachments?.length || 0) > 0
}

export function useCanvasLocalDraft(options: CanvasLocalDraftOptions) {
  const { fileName, currentFilePath, isDirty } = useGraphStore()
  const { showToast } = useToastStore()
  const { t } = useI18n()
  const restoreHandledRef = useRef(false)
  const writeFailedRef = useRef(false)

  const payload = useMemo<LocalDraftPayload>(() => ({
    fileName,
    filePath: currentFilePath,
    nodes: buildNodeSnapshots(options.nodes, options.edges),
    edges: options.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      style: edge.style
    })),
    regions: options.regions,
    initialInput: options.initialInput,
    initialImages: options.initialImages,
    initialAttachments: options.initialAttachments,
    initialGenerating: options.initialGenerating
  }), [
    fileName,
    currentFilePath,
    options.nodes,
    options.edges,
    options.regions,
    options.initialInput,
    options.initialImages,
    options.initialAttachments,
    options.initialGenerating
  ])

  const shouldKeepDraft = isDirty
    || Boolean(payload.initialInput?.trim())
    || (payload.initialImages?.length || 0) > 0
    || (payload.initialAttachments?.length || 0) > 0
  const payloadRef = useRef(payload)
  const shouldKeepDraftRef = useRef(shouldKeepDraft)

  useEffect(() => {
    payloadRef.current = payload
    shouldKeepDraftRef.current = shouldKeepDraft
  }, [payload, shouldKeepDraft])

  const writeDraft = useMemo(() => {
    return (targetPayload: LocalDraftPayload) => {
      if (!canUseLocalStorage()) return
      if (!hasDraftContent(targetPayload)) {
        window.localStorage.removeItem(LOCAL_DRAFT_KEY)
        return
      }
      const envelope: LocalDraftEnvelope = {
        version: LOCAL_DRAFT_VERSION,
        savedAt: new Date().toISOString(),
        payload: targetPayload
      }
      try {
        window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(envelope))
      } catch (error) {
        if (writeFailedRef.current) return
        writeFailedRef.current = true
        console.error('Failed to save local draft:', error)
        showToast(t('toast.localDraftStoreFailed'), 'error')
      }
    }
  }, [showToast, t])

  useEffect(() => {
    if (restoreHandledRef.current) return
    if (!canUseLocalStorage()) {
      restoreHandledRef.current = true
      return
    }
    if (
      options.nodes.length > 0
      || options.edges.length > 0
      || options.regions.length > 0
      || options.initialInput.trim().length > 0
      || options.initialImages.length > 0
      || options.initialAttachments.length > 0
    ) {
      restoreHandledRef.current = true
      return
    }

    restoreHandledRef.current = true
    const draft = parseDraft(window.localStorage.getItem(LOCAL_DRAFT_KEY))
    if (!draft || !hasDraftContent(draft.payload)) return

    const shouldRestore = window.confirm(
      t('confirm.restoreLocalDraft', { time: formatSavedAt(draft.savedAt) })
    )
    if (!shouldRestore) {
      window.localStorage.removeItem(LOCAL_DRAFT_KEY)
      return
    }

    options.onRestoreDraft(draft.payload)
    showToast(t('toast.localDraftRestored'), 'success')
  }, [options, showToast, t])

  useEffect(() => {
    if (!canUseLocalStorage() || !restoreHandledRef.current) return
    if (!shouldKeepDraft || !hasDraftContent(payload)) {
      window.localStorage.removeItem(LOCAL_DRAFT_KEY)
      return
    }
    const timer = window.setTimeout(() => {
      writeDraft(payload)
    }, AUTO_SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [payload, shouldKeepDraft, writeDraft])

  useEffect(() => {
    if (!canUseLocalStorage()) return

    const flushDraft = () => {
      if (!shouldKeepDraftRef.current) return
      writeDraft(payloadRef.current)
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushDraft()
    }

    window.addEventListener('beforeunload', flushDraft)
    window.addEventListener('pagehide', flushDraft)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('beforeunload', flushDraft)
      window.removeEventListener('pagehide', flushDraft)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [writeDraft])
}
