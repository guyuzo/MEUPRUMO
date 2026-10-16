import type { LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/**
 * Linha de formulário no estilo "cartão": ícone + rótulo à esquerda, controle à direita.
 * `stacked` coloca o controle embaixo (ex.: anotação).
 */
export function FormRow({
  icon: Icon,
  label,
  htmlFor,
  children,
  error,
  stacked,
  className,
}: {
  icon: LucideIcon
  label: string
  htmlFor?: string
  children: ReactNode
  error?: string
  stacked?: boolean
  className?: string
}) {
  return (
    <div>
      <div
        className={cn(
          'rounded-xl border border-border bg-card px-4 transition-colors focus-within:border-ring',
          stacked ? 'space-y-2 py-3' : 'flex min-h-14 items-center gap-3 py-2',
          error && 'border-destructive',
          className,
        )}
      >
        <label htmlFor={htmlFor} className="flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
          <Icon className="size-4" />
          {label}
        </label>
        <div className={cn(stacked ? '' : 'ml-auto flex min-w-0 flex-1 items-center justify-end gap-2')}>{children}</div>
      </div>
      {error && <p className="mt-1 px-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

export const rowInputClass =
  'w-full min-w-0 bg-transparent text-right text-sm text-foreground placeholder:text-muted-foreground focus:outline-none'

/** Select compacto para dentro de FormRow (texto à direita), com a lista do app. */
export function RowSelect(props: ComponentProps<typeof Select>) {
  return <Select variant="row" {...props} />
}

/** Interruptor (on/off) acessível. */
export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  id?: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
      )}
    >
      <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  )
}

/** Opção marcável em linha (como "Mês da compra / Mês seguinte"). */
export function CheckChip({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onClick} className="flex items-center gap-1.5 text-sm">
      <span
        className={cn(
          'flex size-4 items-center justify-center rounded border',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
        )}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path d="M2.5 6.5l2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {children}
    </button>
  )
}
