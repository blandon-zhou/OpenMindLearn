import { create } from 'zustand'
import type { Node, Graph, Region, NodeImage, NodeAttachment } from '../types'

export interface GraphDocumentUIState {
  initialInput: string
  initialGenerating: boolean
  initialImages: NodeImage[]
  initialAttachments: NodeAttachment[]
}

export interface GraphDocumentState {
  id: string
  fileName: string
  currentFilePath: string | null
  isDirty: boolean
  nodes: Node[]
  edges: any[]
  regions: Region[]
  ui: GraphDocumentUIState
  updatedAt: string
}

interface WorkspaceSnapshot {
  activeDocId: string | null
  openedDocIds: string[]
  docsById: Record<string, GraphDocumentState>
}

interface GraphStore extends WorkspaceSnapshot {
  maxOpenedDocs: number
  getActiveDoc: () => GraphDocumentState
  getDocById: (docId: string) => GraphDocumentState | null
  createDocument: (input?: Partial<GraphDocumentState>) => string | null
  activateDocument: (docId: string) => void
  closeDocument: (docId: string) => string
  setFileName: (name: string, docId?: string) => void
  setCurrentFilePath: (filePath: string | null, docId?: string) => void
  setDirty: (dirty: boolean, docId?: string) => void
  setDocUI: (patch: Partial<GraphDocumentUIState>, docId?: string) => void
  loadGraph: (graph: Graph, filePath?: string | null, edges?: any[]) => void
  openGraphDocument: (graph: Graph, filePath?: string | null, edges?: any[]) => string | null
  updateDocSnapshot: (payload: {
    docId?: string
    nodes: Node[]
    edges: any[]
    regions: Region[]
    ui?: Partial<GraphDocumentUIState>
    isDirty?: boolean
    fileName?: string
    currentFilePath?: string | null
  }) => void
  clearGraph: (docId?: string) => void
  replaceWorkspace: (snapshot: WorkspaceSnapshot) => void
}

const DEFAULT_FILE_NAME = 'Untitled'
const MAX_OPENED_DOCS = 10

function createDocId() {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createDefaultUI(): GraphDocumentUIState {
  return {
    initialInput: '',
    initialGenerating: false,
    initialImages: [],
    initialAttachments: []
  }
}

function createDocumentState(input?: Partial<GraphDocumentState>): GraphDocumentState {
  return {
    id: input?.id || createDocId(),
    fileName: input?.fileName || DEFAULT_FILE_NAME,
    currentFilePath: input?.currentFilePath ?? null,
    isDirty: Boolean(input?.isDirty),
    nodes: input?.nodes || [],
    edges: input?.edges || [],
    regions: input?.regions || [],
    ui: {
      ...createDefaultUI(),
      ...(input?.ui || {})
    },
    updatedAt: input?.updatedAt || new Date().toISOString()
  }
}

function resolveTargetDocId(state: WorkspaceSnapshot, docId?: string) {
  if (docId && state.docsById[docId]) return docId
  if (state.activeDocId && state.docsById[state.activeDocId]) return state.activeDocId
  const fallback = state.openedDocIds[0]
  return fallback && state.docsById[fallback] ? fallback : null
}

function getUniqueUntitledName(state: WorkspaceSnapshot): string {
  const existing = new Set(Object.values(state.docsById).map((doc) => doc.fileName))
  if (!existing.has(DEFAULT_FILE_NAME)) return DEFAULT_FILE_NAME
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${DEFAULT_FILE_NAME} ${i}`
    if (!existing.has(candidate)) return candidate
  }
  return `${DEFAULT_FILE_NAME} ${Date.now()}`
}

const initialDoc = createDocumentState()

export const useGraphStore = create<GraphStore>((set, get) => ({
  activeDocId: initialDoc.id,
  openedDocIds: [initialDoc.id],
  docsById: {
    [initialDoc.id]: initialDoc
  },
  maxOpenedDocs: MAX_OPENED_DOCS,
  getActiveDoc: () => {
    const state = get()
    const activeDocId = resolveTargetDocId(state)
    if (activeDocId && state.docsById[activeDocId]) return state.docsById[activeDocId]
    const fallbackDoc = createDocumentState()
    return fallbackDoc
  },
  getDocById: (docId) => get().docsById[docId] || null,
  createDocument: (input) => {
    const state = get()
    if (state.openedDocIds.length >= state.maxOpenedDocs) return null
    const doc = createDocumentState({
      ...input,
      fileName: input?.fileName?.trim() || getUniqueUntitledName(state)
    })
    set({
      activeDocId: doc.id,
      openedDocIds: [...state.openedDocIds, doc.id],
      docsById: {
        ...state.docsById,
        [doc.id]: doc
      }
    })
    return doc.id
  },
  activateDocument: (docId) => set((state) => {
    if (!state.docsById[docId]) return state
    return {
      ...state,
      activeDocId: docId
    }
  }),
  closeDocument: (docId) => {
    const state = get()
    if (!state.docsById[docId]) {
      const fallbackDocId = resolveTargetDocId(state)
      if (fallbackDocId) return fallbackDocId
      const newDoc = createDocumentState()
      set({
        activeDocId: newDoc.id,
        openedDocIds: [newDoc.id],
        docsById: { [newDoc.id]: newDoc }
      })
      return newDoc.id
    }

    const nextOpenedDocIds = state.openedDocIds.filter((id) => id !== docId)
    const nextDocsById = { ...state.docsById }
    delete nextDocsById[docId]

    if (nextOpenedDocIds.length === 0) {
      const newDoc = createDocumentState()
      set({
        activeDocId: newDoc.id,
        openedDocIds: [newDoc.id],
        docsById: { [newDoc.id]: newDoc }
      })
      return newDoc.id
    }

    const nextActiveDocId = state.activeDocId === docId
      ? nextOpenedDocIds[Math.max(0, state.openedDocIds.indexOf(docId) - 1)] || nextOpenedDocIds[0]
      : state.activeDocId

    const resolvedActiveDocId = nextActiveDocId && nextDocsById[nextActiveDocId]
      ? nextActiveDocId
      : nextOpenedDocIds[0]

    set({
      activeDocId: resolvedActiveDocId,
      openedDocIds: nextOpenedDocIds,
      docsById: nextDocsById
    })
    return resolvedActiveDocId
  },
  setFileName: (name, docId) => set((state) => {
    const targetDocId = resolveTargetDocId(state, docId)
    if (!targetDocId) return state
    const currentDoc = state.docsById[targetDocId]
    if (!currentDoc) return state
    return {
      ...state,
      docsById: {
        ...state.docsById,
        [targetDocId]: {
          ...currentDoc,
          fileName: name,
          updatedAt: new Date().toISOString()
        }
      }
    }
  }),
  setCurrentFilePath: (filePath, docId) => set((state) => {
    const targetDocId = resolveTargetDocId(state, docId)
    if (!targetDocId) return state
    const currentDoc = state.docsById[targetDocId]
    if (!currentDoc) return state
    return {
      ...state,
      docsById: {
        ...state.docsById,
        [targetDocId]: {
          ...currentDoc,
          currentFilePath: filePath,
          updatedAt: new Date().toISOString()
        }
      }
    }
  }),
  setDirty: (dirty, docId) => set((state) => {
    const targetDocId = resolveTargetDocId(state, docId)
    if (!targetDocId) return state
    const currentDoc = state.docsById[targetDocId]
    if (!currentDoc || currentDoc.isDirty === dirty) return state
    return {
      ...state,
      docsById: {
        ...state.docsById,
        [targetDocId]: {
          ...currentDoc,
          isDirty: dirty,
          updatedAt: new Date().toISOString()
        }
      }
    }
  }),
  setDocUI: (patch, docId) => set((state) => {
    const targetDocId = resolveTargetDocId(state, docId)
    if (!targetDocId) return state
    const currentDoc = state.docsById[targetDocId]
    if (!currentDoc) return state
    return {
      ...state,
      docsById: {
        ...state.docsById,
        [targetDocId]: {
          ...currentDoc,
          ui: {
            ...currentDoc.ui,
            ...patch
          },
          updatedAt: new Date().toISOString()
        }
      }
    }
  }),
  loadGraph: (graph, filePath = null, edges = []) => set((state) => {
    const targetDocId = resolveTargetDocId(state)
    if (!targetDocId) return state
    const currentDoc = state.docsById[targetDocId]
    if (!currentDoc) return state
    return {
      ...state,
      docsById: {
        ...state.docsById,
        [targetDocId]: {
          ...currentDoc,
          nodes: graph.nodes,
          edges,
          regions: graph.regions || [],
          fileName: graph.name || currentDoc.fileName || DEFAULT_FILE_NAME,
          currentFilePath: filePath,
          isDirty: false,
          ui: createDefaultUI(),
          updatedAt: new Date().toISOString()
        }
      }
    }
  }),
  openGraphDocument: (graph, filePath = null, edges = []) => {
    const state = get()
    if (state.openedDocIds.length >= state.maxOpenedDocs) return null
    const doc = createDocumentState({
      fileName: graph.name?.trim() || DEFAULT_FILE_NAME,
      currentFilePath: filePath,
      isDirty: false,
      nodes: graph.nodes || [],
      edges,
      regions: graph.regions || []
    })
    set({
      activeDocId: doc.id,
      openedDocIds: [...state.openedDocIds, doc.id],
      docsById: {
        ...state.docsById,
        [doc.id]: doc
      }
    })
    return doc.id
  },
  updateDocSnapshot: (payload) => set((state) => {
    const targetDocId = resolveTargetDocId(state, payload.docId)
    if (!targetDocId) return state
    const currentDoc = state.docsById[targetDocId]
    if (!currentDoc) return state
    return {
      ...state,
      docsById: {
        ...state.docsById,
        [targetDocId]: {
          ...currentDoc,
          nodes: payload.nodes,
          edges: payload.edges,
          regions: payload.regions,
          ui: {
            ...currentDoc.ui,
            ...(payload.ui || {})
          },
          isDirty: payload.isDirty ?? currentDoc.isDirty,
          fileName: payload.fileName ?? currentDoc.fileName,
          currentFilePath: payload.currentFilePath ?? currentDoc.currentFilePath,
          updatedAt: new Date().toISOString()
        }
      }
    }
  }),
  clearGraph: (docId) => set((state) => {
    const targetDocId = resolveTargetDocId(state, docId)
    if (!targetDocId) return state
    const currentDoc = state.docsById[targetDocId]
    if (!currentDoc) return state
    return {
      ...state,
      docsById: {
        ...state.docsById,
        [targetDocId]: {
          ...currentDoc,
          nodes: [],
          edges: [],
          regions: [],
          fileName: getUniqueUntitledName(state),
          currentFilePath: null,
          isDirty: false,
          ui: createDefaultUI(),
          updatedAt: new Date().toISOString()
        }
      }
    }
  }),
  replaceWorkspace: (snapshot) => {
    const validOpenedIds = snapshot.openedDocIds.filter((docId) => snapshot.docsById[docId])
    if (validOpenedIds.length === 0) {
      const fallback = createDocumentState()
      set({
        activeDocId: fallback.id,
        openedDocIds: [fallback.id],
        docsById: { [fallback.id]: fallback }
      })
      return
    }
    const normalizedDocsById = validOpenedIds.reduce<Record<string, GraphDocumentState>>((acc, docId) => {
      const rawDoc = snapshot.docsById[docId]
      acc[docId] = createDocumentState({
        ...rawDoc,
        id: docId
      })
      return acc
    }, {})
    const activeDocId = snapshot.activeDocId && normalizedDocsById[snapshot.activeDocId]
      ? snapshot.activeDocId
      : validOpenedIds[0]
    set({
      activeDocId,
      openedDocIds: validOpenedIds,
      docsById: normalizedDocsById
    })
  }
}))
