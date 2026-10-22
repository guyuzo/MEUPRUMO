import { Minus, Plus, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import type { SquareCrop } from '@/lib/image'

const MAX_VIEW = 280 // lado da área de recorte, em px de tela (menor em celular estreito)
const MAX_ZOOM = 4

/**
 * Ajuste da foto antes de enviar: arrastar para posicionar e zoom (botões, barra ou roda do mouse
 * / pinça). O círculo mostra como a foto vai aparecer; devolve o recorte em pixels da imagem original.
 */
export function AvatarCropDialog({
  file,
  name,
  pending,
  onCancel,
  onConfirm,
}: {
  file: File
  name: string
  pending?: boolean
  onCancel: () => void
  onConfirm: (crop: SquareCrop) => void
}) {
  const [VIEW] = useState(() => Math.min(MAX_VIEW, window.innerWidth - 96))
  const [image, setImage] = useState<{ url: string; w: number; h: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null)
  const pinch = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null)

  // Lê o tamanho real já com a orientação da câmera (EXIF) aplicada, igual ao recorte final.
  useEffect(() => {
    let url = ''
    let cancelled = false
    createImageBitmap(file, { imageOrientation: 'from-image' })
      .then((bitmap) => {
        if (cancelled) return bitmap.close()
        url = URL.createObjectURL(file)
        setImage({ url, w: bitmap.width, h: bitmap.height })
        bitmap.close()
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [file])

  // Escala em que o lado menor da foto preenche o círculo (zoom 1).
  const base = image ? VIEW / Math.min(image.w, image.h) : 1
  const scale = base * zoom

  // A foto nunca pode deixar buraco dentro da área de recorte.
  const clamp = (o: { x: number; y: number }, z = zoom) => {
    if (!image) return o
    const s = base * z
    const maxX = Math.max(0, (image.w * s - VIEW) / 2)
    const maxY = Math.max(0, (image.h * s - VIEW) / 2)
    return { x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) }
  }

  const setZoomClamped = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, next))
    setZoom(z)
    setOffset((o) => clamp({ x: (o.x * z) / zoom, y: (o.y * z) / zoom }, z))
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()]
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom }
      drag.current = null
    } else {
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pinch.current.values()]
      setZoomClamped((pinchStart.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinchStart.current.dist)
      return
    }
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    setOffset(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }))
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pinch.current.delete(e.pointerId)
    if (pinch.current.size < 2) pinchStart.current = null
    if (drag.current?.id === e.pointerId) drag.current = null
  }

  const confirm = () => {
    if (!image) return
    // Canto superior esquerdo da foto dentro da área de recorte → recorte em pixels da original.
    const left = VIEW / 2 + offset.x - (image.w * scale) / 2
    const top = VIEW / 2 + offset.y - (image.h * scale) / 2
    const side = VIEW / scale
    onConfirm({
      x: Math.max(0, -left / scale),
      y: Math.max(0, -top / scale),
      side: Math.min(side, image.w, image.h),
    })
  }

  const reset = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }

  return (
    <Dialog open onClose={onCancel} title="Ajustar foto" description={`Arraste para posicionar e use o zoom. Foto de ${name}.`} className="max-w-sm">
      <div className="space-y-4">
        <div
          className="relative mx-auto cursor-grab touch-none select-none overflow-hidden rounded-xl bg-muted active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => setZoomClamped(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
          role="img"
          aria-label="Área de recorte da foto"
        >
          {image && (
            <img
              src={image.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: image.w * scale,
                height: image.h * scale,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          )}
          {/* Escurece fora do círculo: o que fica dentro é a foto final. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(0,0,0,0.55)] ring-2 ring-white/80" />
          {!image && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              {failed ? 'Não consegui abrir esta imagem.' : 'Carregando…'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Diminuir zoom" onClick={() => setZoomClamped(zoom / 1.2)} disabled={zoom <= 1}>
            <Minus />
          </Button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoomClamped(Number(e.target.value))}
            aria-label="Zoom"
            className="h-2 min-w-0 flex-1 accent-primary"
          />
          <Button variant="ghost" size="icon" aria-label="Aumentar zoom" onClick={() => setZoomClamped(zoom * 1.2)} disabled={zoom >= MAX_ZOOM}>
            <Plus />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Voltar ao centro" title="Voltar ao centro" onClick={reset}>
            <RotateCcw />
          </Button>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={!image || pending}>
            {pending ? 'Enviando…' : 'Usar foto'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
