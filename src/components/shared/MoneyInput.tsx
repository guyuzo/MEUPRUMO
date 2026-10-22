import { useRef, useState, type InputHTMLAttributes } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const plain = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MAX_DIGITS = 13 // até R$ 99.999.999.999,99

/** Texto exibido para um valor em centavos ("1.234,56", "-10,00"). */
export function displayCents(cents: number | null): string {
  if (cents == null) return ''
  return (cents < 0 ? '-' : '') + plain.format(Math.abs(cents) / 100)
}

/**
 * Máscara de moeda: só os dígitos contam e preenchem da direita
 * ("1" → 0,01; "1050" → 10,50). Sem dígitos → null.
 * Com allowNegative, um "-" no texto deixa negativo; dois "-" (digitou "-" num valor
 * já negativo) voltam para positivo.
 */
export function maskToCents(text: string, allowNegative = false): number | null {
  const digits = text.replace(/\D/g, '').slice(0, MAX_DIGITS)
  if (!digits) return null
  const minus = (text.match(/-/g) ?? []).length
  return allowNegative && minus === 1 ? -Number(digits) : Number(digits)
}

const ALLOWED_KEYS = new Set(['Backspace', 'Delete', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'Home', 'End'])

/**
 * Campo de valor em reais que só aceita números (como em apps de banco). Entrega centavos.
 * `onCommit` dispara ao sair do campo, se o valor mudou.
 */
export function MoneyInput({
  value,
  onChange,
  onCommit,
  allowNegative = false,
  bare = false,
  className,
  placeholder = '0,00',
  onKeyDown,
  onFocus,
  onBlur,
  ...props
}: {
  value: number | null
  onChange?: (cents: number | null) => void
  onCommit?: (cents: number | null) => void
  allowNegative?: boolean
  /** Sem borda e alinhado à direita, para usar dentro de FormRow. */
  bare?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const atFocus = useRef<number | null>(value)
  // Enquanto focado, o campo guarda o que está sendo digitado. Assim funciona tanto
  // controlado (onChange) quanto só com onCommit (salva ao sair, ex.: orçamento).
  const [draft, setDraft] = useState<{ value: number | null } | null>(null)
  const shown = draft ? draft.value : value

  const input = (
    <Input
      {...props}
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={displayCents(shown)}
      onKeyDown={(e) => {
        const allowed =
          e.ctrlKey || e.metaKey || ALLOWED_KEYS.has(e.key) || /^\d$/.test(e.key) || (allowNegative && e.key === '-')
        if (!allowed) e.preventDefault()
        if (e.key === 'Enter') e.currentTarget.blur()
        onKeyDown?.(e)
      }}
      onFocus={(e) => {
        atFocus.current = value
        setDraft({ value })
        // Seleciona tudo: digitar substitui o valor (em vez de juntar dígitos ao antigo).
        // rAF para a seleção sobreviver ao mouseup do clique.
        const el = e.currentTarget
        requestAnimationFrame(() => {
          if (document.activeElement === el) el.select()
        })
        onFocus?.(e)
      }}
      onChange={(e) => {
        const next = maskToCents(e.target.value, allowNegative)
        setDraft({ value: next })
        onChange?.(next)
      }}
      onBlur={(e) => {
        const final = draft ? draft.value : value
        setDraft(null)
        if (final !== atFocus.current) onCommit?.(final)
        onBlur?.(e)
      }}
      className={cn(
        'tabular-nums',
        bare ? 'h-auto min-h-10 border-0 bg-transparent p-0 text-right shadow-none focus-visible:ring-0' : 'pl-9 text-right',
        className,
      )}
    />
  )

  if (bare) return input
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      {input}
    </div>
  )
}
