import { useState, useEffect, useRef, useCallback } from 'react'
import type { SourceReference } from '../types'
import type { SelectionMenuState } from '../types/nodeCard'
import type { ExpandMode } from '../stores/settingsStore'
import { fingerprintBase64 } from '../utils/textMeta'
import { getSelectionOffsets, getContainerPlainText } from '../utils/sourceHighlight'
import { tFromSettings } from './useI18n'

export function useNodeCardSelection() {
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenuState | null>(null)
  const [showPromptInput, setShowPromptInput] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [showContextPanel, setShowContextPanel] = useState(false)
  const [selectedContextNodeIds, setSelectedContextNodeIds] = useState<string[] | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleTextSelection = useCallback((isReadOnly: boolean, isEditing: boolean) => {
    if (isReadOnly || isEditing || !contentRef.current) return

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!contentRef.current.contains(range.commonAncestorContainer)) return

    const rawSelectedText = selection.toString()
    if (!rawSelectedText.trim()) return

    const leadingWhitespace = (rawSelectedText.match(/^\s*/) || [''])[0].length
    const trailingWhitespace = (rawSelectedText.match(/\s*$/) || [''])[0].length
    const { start, end } = getSelectionOffsets(contentRef.current, range)
    const normalizedStart = start + leadingWhitespace
    const normalizedEnd = Math.max(normalizedStart, end - trailingWhitespace)
    const plainText = getContainerPlainText(contentRef.current)
    const selectedText = plainText.slice(normalizedStart, normalizedEnd)
    if (!selectedText) return

    const rect = range.getBoundingClientRect()
    if (!rect) return

    const sourceRef: SourceReference = {
      upstreamFingerprintBase64: fingerprintBase64(plainText),
      rangeStart: normalizedStart,
      rangeEnd: normalizedEnd
    }

    setSelectionMenu({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
      text: selectedText,
      sourceRef
    })
    setSelectedContextNodeIds(null)
  }, [])

  // Close selection menu on click outside
  useEffect(() => {
    if (!selectionMenu || showContextPanel) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element
      if (!target.closest('.selection-menu')) {
        setSelectionMenu(null)
        setShowPromptInput(false)
        setCustomPrompt('')
        window.getSelection()?.removeAllRanges()
      }
    }

    document.addEventListener('mousedown', handleClickOutside, true)
    return () => document.removeEventListener('mousedown', handleClickOutside, true)
  }, [selectionMenu, showContextPanel])

  const handleDirectExpand = useCallback(async (onExpand: (text: string, selectedNodeIds?: string[], sourceRef?: SourceReference, expandMode?: ExpandMode) => void) => {
    if (!selectionMenu) return
    const { text, sourceRef } = selectionMenu
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
    await onExpand(text, selectedContextNodeIds || undefined, sourceRef, 'direct')
    setSelectedContextNodeIds(null)
  }, [selectionMenu, selectedContextNodeIds])

  const handleCustomPrompt = useCallback(() => {
    if (!selectionMenu) return
    setCustomPrompt(selectionMenu.text)
    setShowPromptInput(true)
  }, [selectionMenu])

  const handleContextExpand = useCallback((allNodes: any[] | undefined, showToast: (msg: string, type: 'error' | 'success') => void) => {
    if (!selectionMenu) return
    if (!allNodes || allNodes.length === 0) {
      showToast(tFromSettings('toast.contextUnavailable'), 'error')
      return
    }
    setShowContextPanel(true)
  }, [selectionMenu])

  const handleContextConfirm = useCallback((nodeIds: string[]) => {
    setSelectedContextNodeIds(nodeIds)
    setShowContextPanel(false)
  }, [])

  const closeContextPanel = useCallback(() => {
    setShowContextPanel(false)
  }, [])

  const handleSubmitCustomPrompt = useCallback(async (onExpand: (text: string, selectedNodeIds?: string[], sourceRef?: SourceReference, expandMode?: ExpandMode) => void) => {
    if (!customPrompt.trim()) return
    const sourceRef = selectionMenu?.sourceRef
    setSelectionMenu(null)
    setShowPromptInput(false)
    window.getSelection()?.removeAllRanges()
    await onExpand(customPrompt, selectedContextNodeIds || undefined, sourceRef, 'targeted')
    setCustomPrompt('')
    setSelectedContextNodeIds(null)
  }, [customPrompt, selectionMenu, selectedContextNodeIds])

  const clearSelection = useCallback(() => {
    setSelectionMenu(null)
    setShowPromptInput(false)
    setCustomPrompt('')
    setShowContextPanel(false)
    setSelectedContextNodeIds(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  const clearReadOnlyState = useCallback(() => {
    setSelectionMenu(null)
    setShowPromptInput(false)
    setShowContextPanel(false)
    setSelectedContextNodeIds(null)
  }, [])

  return {
    contentRef,
    selectionMenu,
    showPromptInput,
    customPrompt,
    setCustomPrompt,
    showContextPanel,
    selectedContextNodeIds,
    setShowContextPanel,
    setSelectionMenu,
    handleTextSelection,
    handleDirectExpand,
    handleCustomPrompt,
    handleContextExpand,
    handleContextConfirm,
    handleSubmitCustomPrompt,
    closeContextPanel,
    clearSelection,
    clearReadOnlyState,
  }
}
