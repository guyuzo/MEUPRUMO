import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatMonthTitle, shiftMonth, type MonthKey } from '@/lib/dates'
import { cn } from '@/lib/utils'

const EMOJIS = [
  '🏠', '🍽️', '🛒', '🚗', '⛽', '🚌', '💡', '💧', '📱', '🌐', '💊', '🏥', '📚', '🎓', '🎉', '🎬',
  '✈️', '🏖️', '🛍️', '👕', '📺', '🎮', '🐾', '👶', '🎁', '💇', '🏋️', '🧾', '🏦', '💳', '📦', '🔧',
  '💼', '💻', '📈', '💰', '🪙', '🤝', '❤️', '⭐',
]

export function EmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onChange(emoji)}
          aria-pressed={value === emoji}
          className={cn(
            'flex size-9 items-center justify-center rounded-md text-lg hover:bg-muted',
            value === emoji && 'bg-muted ring-2 ring-ring',
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

// Cores da marca primeiro (Verde Prumo, Verde Equilíbrio, Dourado), depois a paleta geral.
const COLORS = [
  '#0d4d3b', '#1f6b56', '#c9a96e',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#64748b',
]

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  // Cor fora da paleta (ex.: a cor do banco do cartão) aparece como primeira opção, marcada.
  const colors = value && !COLORS.includes(value) ? [value, ...COLORS] : COLORS
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          aria-label={color}
          aria-pressed={value === color}
          className={cn('size-9 rounded-full sm:size-7', value === color && 'ring-2 ring-ring ring-offset-2 ring-offset-card')}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  )
}

export function MonthPicker({ value, onChange }: { value: MonthKey; onChange: (month: MonthKey) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={() => onChange(shiftMonth(value, -1))} aria-label="Mês anterior">
        <ChevronLeft />
      </Button>
      <span className="min-w-36 text-center text-sm font-medium">{formatMonthTitle(value)}</span>
      <Button variant="ghost" size="icon" onClick={() => onChange(shiftMonth(value, 1))} aria-label="Próximo mês">
        <ChevronRight />
      </Button>
    </div>
  )
}
