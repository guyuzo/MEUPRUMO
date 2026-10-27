import { Check, Minus } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Caixinha do app: o <input> nativo fica invisível por cima (teclado, leitor de tela e clique
 * continuam nativos) e o desenho é um quadrado arredondado. `indeterminate` mostra um traço.
 */
export function Checkbox({
  checked,
  indeterminate,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { checked: boolean; indeterminate?: boolean }) {
  const on = checked || indeterminate
  return (
    <span className={cn('relative inline-flex size-[18px] shrink-0', className)}>
      <input
        type="checkbox"
        checked={checked}
        aria-checked={indeterminate ? 'mixed' : checked}
        className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...props}
      />
      <span
        aria-hidden
        className={cn(
          'flex size-full items-center justify-center rounded-[5px] border transition-[background-color,border-color,box-shadow] duration-150',
          'peer-hover:border-primary/70 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-card',
          'peer-disabled:opacity-50',
          on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 bg-transparent',
        )}
      >
        {indeterminate ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <Check className={cn('size-3 transition-[opacity,transform] duration-150', checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0')} strokeWidth={3} />
        )}
      </span>
    </span>
  )
}
