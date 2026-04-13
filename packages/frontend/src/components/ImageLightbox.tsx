import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ZoomIn, ZoomOut, RotateCcw, X } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { Z_INDEX } from '../utils/zIndex'

interface ImageLightboxProps {
  src: string
  onClose: () => void
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 5
const ZOOM_STEP = 0.25

export function ImageLightbox({ src, onClose }: ImageLightboxProps) {
  const { t } = useI18n()
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragging = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta)))
  }, [])

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))
  }, [])

  const handleReset = useCallback(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragging.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y }
  }, [offset])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    setOffset({
      x: dragging.current.ox + (e.clientX - dragging.current.startX),
      y: dragging.current.oy + (e.clientY - dragging.current.startY)
    })
  }, [])

  const handlePointerUp = useCallback(() => {
    dragging.current = null
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '=' || e.key === '+') handleZoomIn()
      if (e.key === '-') handleZoomOut()
      if (e.key === '0') handleReset()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, handleZoomIn, handleZoomOut, handleReset])

  return createPortal(
    <div
      className="fixed inset-0 bg-black/85 flex flex-col"
      style={{ zIndex: Z_INDEX.canvasLightbox }}
      onClick={onClose}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-center gap-2 py-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleZoomOut}
          className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title={t('lightbox.zoomOut')}
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-white/80 text-xs font-mono min-w-[48px] text-center select-none">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={handleZoomIn}
          className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title={t('lightbox.zoomIn')}
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleReset}
          className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title={t('lightbox.reset')}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-white/20 mx-1" />
        <button
          onClick={onClose}
          className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title={t('lightbox.close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Image area */}
      <div
        className="flex-1 min-h-0 overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={t('lightbox.previewAlt')}
          className="select-none"
          draggable={false}
          style={{
            maxWidth: '90vw',
            maxHeight: '85vh',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: dragging.current ? 'none' : 'transform 0.15s ease-out'
          }}
        />
      </div>
    </div>,
    document.body
  )
}
