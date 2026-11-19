import { ChevronDown, ChevronUp, EyeOff, GripVertical, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  BLOCK_LABEL,
  moveBlock,
  SIZE_LABEL,
  SIZES,
  stepBlock,
  updateBlock,
  type BlockId,
  type BlockSize,
  type LayoutItem,
} from '@/lib/dashboardLayout'
import { cn } from '@/lib/utils'

// Celular: tudo na linha inteira. Tablet: 2 colunas. Computador: grade de 6 (1/3, 1/2, 2/3, inteira).
const SIZE_CLASS: Record<BlockSize, string> = {
  small: 'lg:col-span-2',
  medium: 'lg:col-span-3',
  large: 'sm:col-span-2 lg:col-span-4',
  full: 'sm:col-span-2 lg:col-span-6',
}

const SIZE_SHORT: Record<BlockSize, string> = { small: 'P', medium: 'M', large: 'G', full: 'Inteira' }

/**
 * Blocos da tela Início na ordem e tamanho do layout. Bloco sem conteúdo (null, ex.: sem permissão)
 * não aparece. Em edição: arrastar (computador) ou setas (celular) para reordenar, tamanho e ocultar.
 */
export function DashboardGrid({
  layout,
  blocks,
  editing,
  onChange,
}: {
  layout: LayoutItem[]
  blocks: Partial<Record<BlockId, ReactNode>>
  editing: boolean
  onChange: (layout: LayoutItem[]) => void
}) {
  const [dragging, setDragging] = useState<BlockId | null>(null)
  const [over, setOver] = useState<BlockId | null>(null)
  const available = layout.filter((b) => blocks[b.id] != null)
  const visible = available.filter((b) => !b.hidden)
  const hidden = available.filter((b) => b.hidden)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {visible.map((block, index) => (
          <div
            key={block.id}
            className={cn(
              'flex min-w-0 flex-col [&>*:last-child]:flex-1',
              SIZE_CLASS[block.size],
              editing && 'rounded-xl outline-2 outline-offset-4 outline-dashed outline-border',
              editing && over === block.id && dragging !== block.id && 'outline-primary',
              dragging === block.id && 'opacity-40',
            )}
            draggable={editing}
            onDragStart={(e) => {
              setDragging(block.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => {
              setDragging(null)
              setOver(null)
            }}
            onDragOver={(e) => {
              if (!dragging) return
              e.preventDefault()
              setOver(block.id)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragging) onChange(moveBlock(layout, dragging, block.id))
              setDragging(null)
              setOver(null)
            }}
          >
            {editing && (
              <BlockToolbar
                block={block}
                first={index === 0}
                last={index === visible.length - 1}
                onStep={(direction) => onChange(stepBlock(layout, block.id, direction))}
                onSize={(size) => onChange(updateBlock(layout, block.id, { size }))}
                onHide={() => onChange(updateBlock(layout, block.id, { hidden: true }))}
              />
            )}
            {/* Em edição o conteúdo fica só de vitrine: sem cliques, para não abrir nada sem querer. */}
            <div className={cn('flex min-w-0 flex-col [&>*]:flex-1', editing && 'pointer-events-none select-none')} aria-hidden={editing || undefined}>
              {blocks[block.id]}
            </div>
          </div>
        ))}
      </div>

      {editing && hidden.length > 0 && (
        <div className="rounded-xl border border-dashed border-border p-3">
          <p className="mb-2 text-xs text-muted-foreground">Blocos ocultos</p>
          <div className="flex flex-wrap gap-2">
            {hidden.map((block) => (
              <button
                key={block.id}
                type="button"
                onClick={() => onChange(updateBlock(layout, block.id, { hidden: false }))}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="size-4" /> {BLOCK_LABEL[block.id]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BlockToolbar({
  block,
  first,
  last,
  onStep,
  onSize,
  onHide,
}: {
  block: LayoutItem
  first: boolean
  last: boolean
  onStep: (direction: -1 | 1) => void
  onSize: (size: BlockSize) => void
  onHide: () => void
}) {
  const label = BLOCK_LABEL[block.id]
  const iconButton =
    'inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-8'
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1 rounded-lg bg-muted/70 p-1 text-sm">
      <span className="flex min-w-0 flex-1 cursor-grab items-center gap-1 pl-1 font-medium active:cursor-grabbing" title="Arraste para mudar de lugar">
        <GripVertical className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </span>
      <div className="flex items-center" role="radiogroup" aria-label={`Tamanho de ${label}`}>
        {SIZES.map((size) => (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={block.size === size}
            title={SIZE_LABEL[size]}
            onClick={() => onSize(size)}
            className={cn(
              // No celular todo bloco ocupa a linha: o tamanho só muda no computador/tablet.
              'hidden h-8 rounded-md px-2 text-xs font-medium sm:inline-flex sm:items-center',
              block.size === size ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-card hover:text-foreground',
            )}
          >
            {SIZE_SHORT[size]}
          </button>
        ))}
      </div>
      <button type="button" className={iconButton} disabled={first} onClick={() => onStep(-1)} aria-label={`Subir ${label}`}>
        <ChevronUp className="size-4" />
      </button>
      <button type="button" className={iconButton} disabled={last} onClick={() => onStep(1)} aria-label={`Descer ${label}`}>
        <ChevronDown className="size-4" />
      </button>
      <button type="button" className={iconButton} onClick={onHide} aria-label={`Ocultar ${label}`} title="Ocultar">
        <EyeOff className="size-4" />
      </button>
    </div>
  )
}
