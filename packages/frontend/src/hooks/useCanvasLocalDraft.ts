import { useEffect, useMemo, useRef } from 'react'
import { useGraphStore } from '../stores/graphStore'
import { useToastStore } from '../stores/toastStore'
import type { NodeImage, NodeAttachment, Region } from '../types'
import { buildNodeSnapshots } from '../utils/graphSnapshot'
import { useI18n } from './useI18n'
import type {
  LocalDraftPayload,
  LocalDraftDocPayload,
  LocalDraftWorkspacePayload
} from './useCanvasFileIO'

const LOCAL_DRAFT_WORKSPACE_KEY = 'oml-local-workspace-draft-v2'
const LOCAL_DRAFT_WORKSPACE_VERSION = 2
const LEGACY_LOCAL_DRAFT_KEY = 'oml-local-draft-v1'
const LEGACY_LOCAL_DRAFT_VERSION = 1
const AUTO_SAVE_DELAY_MS = 600

interface WorkspaceDraftEnvelope {
  version: number
  savedAt: string
  payload: LocalDraftWorkspacePayload
}

interface LegacyDraftEnvelope {
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
  onRestoreDraft: (draft: LocalDraftWorkspacePayload | LocalDraftPayload) => void
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function parseWorkspaceDraft(raw: string | null): WorkspaceDraftEnvelope | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as WorkspaceDraftEnvelope
    const payload = parsed?.payload
    if (!parsed || parsed.version !== LOCAL_DRAFT_WORKSPACE_VERSION || !payload) return null
    if (!Array.isArray(payload.openedDocIds) || !payload.docsById) return null
    return parsed
  } catch {
    return null
  }
}

function parseLegacyDraft(raw: string | null): LegacyDraftEnvelope | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as LegacyDraftEnvelope
    const payload = parsed?.payload
    if (!parsed || parsed.version !== LEGACY_LOCAL_DRAFT_VERSION || !payload) return null
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

function hasDraftContent(payload: LocalDraftDocPayload) {
  return payload.nodes.length > 0
    || payload.edges.length > 0
    || payload.regions.length > 0
    || Boolean(payload.initialInput?.trim())
    || (payload.initialImages?.length || 0) > 0
    || (payload.initialAttachments?.length || 0) > 0
}

function hasWorkspaceContent(payload: LocalDraftWorkspacePayload) {
  return payload.openedDocIds.some((docId) => {
    const doc = payload.docsById[docId]
    if (!doc) return false
    return hasDraftContent(doc)
  })
}

export function useCanvasLocalDraft(options: CanvasLocalDraftOptions) {
  const activeDocId = useGraphStore((state) => state.activeDocId)
  const openedDocIds = useGraphStore((state) => state.openedDocIds)
  const docsById = useGraphStore((state) => state.docsById)
  const { showToast } = useToastStore()
  const { t } = useI18n()
  const restoreHandledRef = useRef(false)
  const writeFailedRef = useRef(false)

  const payload = useMemo<LocalDraftWorkspacePayload>(() => {
    const payloadDocs = openedDocIds.reduce<Record<string, LocalDraftDocPayload>>((acc, docId) => {
      const doc = docsById[docId]
      if (!doc) return acc
      acc[docId] = {
        id: doc.id,
        fileName: doc.fileName,
        filePath: doc.currentFilePath,
        isDirty: doc.isDirty,
        nodes: doc.nodes,
        edges: doc.edges,
        regions: doc.regions,
        initialInput: doc.ui.initialInput,
        initialImages: doc.ui.initialImages,
        initialAttachments: doc.ui.initialAttachments,
        initialGenerating: doc.ui.initialGenerating,
        updatedAt: doc.updatedAt
      }
      return acc
    }, {})

    if (activeDocId && payloadDocs[activeDocId]) {
      payloadDocs[activeDocId] = {
        ...payloadDocs[activeDocId],
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
      }
    }

    return {
      activeDocId,
      openedDocIds: openedDocIds.filter((docId) => payloadDocs[docId]),
      docsById: payloadDocs
    }
  }, [
    activeDocId,
    docsById,
    openedDocIds,
    options.edges,
    options.initialAttachments,
    options.initialGenerating,
    options.initialImages,
    options.initialInput,
    options.nodes,
    options.regions
  ])

  const shouldKeepDraft = payload.openedDocIds.some((docId) => {
    const doc = payload.docsById[docId]
    if (!doc) return false
    return doc.isDirty
      || Boolean(doc.initialInput?.trim())
      || (doc.initialImages?.length || 0) > 0
      || (doc.initialAttachments?.length || 0) > 0
  })

  const payloadRef = useRef(payload)
  const shouldKeepDraftRef = useRef(shouldKeepDraft)

  useEffect(() => {
    payloadRef.current = payload
    shouldKeepDraftRef.current = shouldKeepDraft
  }, [payload, shouldKeepDraft])

  const writeDraft = useMemo(() => {
    return (targetPayload: LocalDraftWorkspacePayload) => {
      if (!canUseLocalStorage()) return
      if (!hasWorkspaceContent(targetPayload)) {
        window.localStorage.removeItem(LOCAL_DRAFT_WORKSPACE_KEY)
        return
      }
      const envelope: WorkspaceDraftEnvelope = {
        version: LOCAL_DRAFT_WORKSPACE_VERSION,
        savedAt: new Date().toISOString(),
        payload: targetPayload
      }
      try {
        window.localStorage.setItem(LOCAL_DRAFT_WORKSPACE_KEY, JSON.stringify(envelope))
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

    const hasRuntimeContent = options.nodes.length > 0
      || options.edges.length > 0
      || options.regions.length > 0
      || options.initialInput.trim().length > 0
      || options.initialImages.length > 0
      || options.initialAttachments.length > 0

    if (hasRuntimeContent) {
      restoreHandledRef.current = true
      return
    }

    restoreHandledRef.current = true

    const workspaceDraft = parseWorkspaceDraft(window.localStorage.getItem(LOCAL_DRAFT_WORKSPACE_KEY))
    if (workspaceDraft && hasWorkspaceContent(workspaceDraft.payload)) {
      const shouldRestore = window.confirm(
        t('confirm.restoreLocalDraft', { time: formatSavedAt(workspaceDraft.savedAt) })
      )
      if (!shouldRestore) {
        window.localStorage.removeItem(LOCAL_DRAFT_WORKSPACE_KEY)
        return
      }
      options.onRestoreDraft(workspaceDraft.payload)
      showToast(t('toast.localDraftRestored'), 'success')
      window.localStorage.removeItem(LEGACY_LOCAL_DRAFT_KEY)
      return
    }

    const legacyDraft = parseLegacyDraft(window.localStorage.getItem(LEGACY_LOCAL_DRAFT_KEY))
    if (!legacyDraft || !hasDraftContent({
      id: 'legacy',
      fileName: legacyDraft.payload.fileName,
      filePath: legacyDraft.payload.filePath,
      isDirty: true,
      nodes: legacyDraft.payload.nodes,
      edges: legacyDraft.payload.edges,
      regions: legacyDraft.payload.regions,
      initialInput: legacyDraft.payload.initialInput,
      initialImages: legacyDraft.payload.initialImages,
      initialAttachments: legacyDraft.payload.initialAttachments,
      initialGenerating: legacyDraft.payload.initialGenerating
    })) {
      return
    }

    const shouldRestoreLegacy = window.confirm(
      t('confirm.restoreLocalDraft', { time: formatSavedAt(legacyDraft.savedAt) })
    )
    if (!shouldRestoreLegacy) {
      window.localStorage.removeItem(LEGACY_LOCAL_DRAFT_KEY)
      return
    }

    options.onRestoreDraft(legacyDraft.payload)
    showToast(t('toast.localDraftRestored'), 'success')
    window.localStorage.removeItem(LEGACY_LOCAL_DRAFT_KEY)
  }, [options, showToast, t])

  useEffect(() => {
    if (!canUseLocalStorage() || !restoreHandledRef.current) return
    if (!shouldKeepDraft || !hasWorkspaceContent(payload)) {
      window.localStorage.removeItem(LOCAL_DRAFT_WORKSPACE_KEY)
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
