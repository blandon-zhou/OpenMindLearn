import { useEffect, useMemo, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { CornerDownRight, Loader2, MessageCirclePlus, Send, Split, Square } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../../utils/cn'
import type { ConversationNodeSnapshot, ConversationTurn } from '../../hooks/useConversationView'

interface ChatShellProps {
  turns: ConversationTurn[]
  nodeById: Map<string, ConversationNodeSnapshot>
  activeNodeId: string | null
  latestNodeId: string | null
  branchParentNodeId: string | null
  draft: string
  isSubmitting: boolean
  disableSend: boolean
  onDraftChange: (value: string) => void
  onSubmit: () => void
  onStopGenerating: (nodeId: string) => void
  onCancelBranchParent: () => void
  onSelectBranchParent: (nodeId: string) => void
  onSwitchBranch: (nodeId: string) => void
  onOpenInCanvas: (nodeId: string) => void
  getNodePreviewLabel: (nodeId: string) => string
  t: (key: string, params?: Record<string, string | number>) => string
}

export function ChatShell({
  turns,
  nodeById,
  activeNodeId,
  latestNodeId,
  branchParentNodeId,
  draft,
  isSubmitting,
  disableSend,
  onDraftChange,
  onSubmit,
  onStopGenerating,
  onCancelBranchParent,
  onSelectBranchParent,
  onSwitchBranch,
  onOpenInCanvas,
  getNodePreviewLabel,
  t
}: ChatShellProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = listRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [turns.length, activeNodeId, latestNodeId])

  const branchParentLabel = useMemo(() => {
    if (!branchParentNodeId) return ''
    return getNodePreviewLabel(branchParentNodeId)
  }, [branchParentNodeId, getNodePreviewLabel])

  const activeGeneratingNodeId = useMemo(() => {
    if (activeNodeId && nodeById.get(activeNodeId)?.isGenerating) {
      return activeNodeId
    }
    return turns.find((turn) => turn.isGenerating)?.nodeId || null
  }, [activeNodeId, nodeById, turns])

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const nativeEvent = event.nativeEvent as KeyboardEvent
    if (nativeEvent.isComposing || nativeEvent.keyCode === 229) return
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (disableSend || !draft.trim()) return
    onSubmit()
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      <div className="border-b border-border px-4 py-3 bg-secondary/20">
        <div className="text-sm font-medium text-foreground">{t('chat.title')}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {activeNodeId
            ? t('chat.branch.active', { id: activeNodeId })
            : t('chat.branch.empty')}
        </div>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {turns.length === 0 && (
          <div className="mx-auto max-w-[720px] rounded-xl border border-border bg-muted/25 p-5 text-center">
            <h3 className="text-base font-semibold text-foreground">{t('chat.empty.title')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('chat.empty.description')}</p>
          </div>
        )}

        {turns.map((turn, index) => {
          const hasQuestion = turn.question.trim().length > 0
          const branchOptions = turn.childBranchIds
          const hasBranchSwitch = branchOptions.length > 1

          return (
            <div key={turn.nodeId} className="mx-auto w-full max-w-[840px] space-y-2">
              {hasQuestion ? (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl border border-border bg-secondary/35 px-4 py-3 text-sm text-foreground whitespace-pre-wrap">
                    {turn.question}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">{t('chat.seedMessage')}</div>
              )}

              <div className="rounded-2xl border border-border bg-background px-4 py-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    {t('chat.assistantLabel')} #{index + 1}
                  </div>
                  {turn.isGenerating && (
                    <div className="inline-flex items-center gap-2">
                      <div className="inline-flex items-center gap-1 text-xs text-primary">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {t('common.generating')}
                      </div>
                      <button
                        onClick={() => onStopGenerating(turn.nodeId)}
                        className="inline-flex items-center gap-1 rounded border border-destructive/45 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        {t('common.stopGenerating')}
                      </button>
                    </div>
                  )}
                </div>

                {turn.thinking.trim() && (
                  <details className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                    <summary className="cursor-pointer select-none text-xs text-muted-foreground">
                      {t('node.thinkingSummary')}
                    </summary>
                    <div className="mt-2 prose prose-xs prose-slate dark:prose-invert max-w-none text-muted-foreground">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {turn.thinking}
                      </ReactMarkdown>
                    </div>
                  </details>
                )}

                <div className="prose prose-sm prose-slate dark:prose-invert max-w-none prose-p:text-foreground/90 prose-li:text-foreground/90 prose-strong:text-foreground mt-3">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {turn.content || t('node.empty')}
                  </ReactMarkdown>
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs">
                  <button
                    onClick={() => onSelectBranchParent(turn.nodeId)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 transition-colors',
                      branchParentNodeId === turn.nodeId
                        ? 'border-primary/45 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                    )}
                  >
                    <MessageCirclePlus className="w-3.5 h-3.5" />
                    {t('chat.actions.continueFrom')}
                  </button>
                  <button
                    onClick={() => onOpenInCanvas(turn.nodeId)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <Split className="w-3.5 h-3.5" />
                    {t('chat.actions.openCanvas')}
                  </button>
                </div>

                {hasBranchSwitch && (
                  <div className="mt-3 rounded-md border border-border bg-muted/20 p-2">
                    <div className="mb-2 text-[11px] text-muted-foreground">{t('chat.branch.switch')}</div>
                    <div className="flex flex-wrap gap-2">
                      {branchOptions.map((branchId) => {
                        const branchNode = nodeById.get(branchId)
                        const isActive = turn.activeChildId === branchId
                        const label = getNodePreviewLabel(branchId)
                        return (
                          <button
                            key={branchId}
                            onClick={() => onSwitchBranch(branchId)}
                            className={cn(
                              'inline-flex max-w-[220px] items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors',
                              isActive
                                ? 'border-primary/45 bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                            )}
                            title={branchId}
                          >
                            <CornerDownRight className="w-3 h-3 shrink-0" />
                            <span className="truncate">{label}</span>
                            {branchNode?.isGenerating && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-border px-4 py-3 bg-background">
        <div className="mx-auto w-full max-w-[840px]">
          {branchParentNodeId && (
            <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-md border border-primary/35 bg-primary/10 px-2.5 py-1.5 text-xs text-primary">
              <span className="truncate">{t('chat.branch.from', { label: branchParentLabel })}</span>
              <button
                onClick={onCancelBranchParent}
                className="rounded border border-primary/30 px-1.5 py-0.5 hover:bg-primary/10"
              >
                {t('common.cancel')}
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              rows={3}
              placeholder={t('chat.input.placeholder')}
              className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary/45"
            />
            {activeGeneratingNodeId ? (
              <button
                onClick={() => onStopGenerating(activeGeneratingNodeId)}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-destructive/45 px-3 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <Square className="w-4 h-4 fill-current" />
                {t('common.stopGenerating')}
              </button>
            ) : (
              <button
                onClick={onSubmit}
                disabled={disableSend || !draft.trim()}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {t('chat.send')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
