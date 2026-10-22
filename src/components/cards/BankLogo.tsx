import { CreditCard } from 'lucide-react'
import { bankInitials, bankLogoImgClass, findBank } from '@/lib/banks'
import { cn } from '@/lib/utils'

const SIZES = { sm: 'size-5 text-[9px]', md: 'size-7 text-[10px]', lg: 'size-10 text-xs' } as const

/** Logo do banco do cartão; sem logo conhecido, iniciais na cor do banco (ou ícone na cor do cartão). */
export function BankLogo({
  bank,
  color,
  size = 'lg',
  className,
}: {
  bank: string | null | undefined
  /** Cor do cartão, usada quando o banco não é reconhecido. */
  color?: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const known = findBank(bank)
  const base = cn('flex shrink-0 items-center justify-center overflow-hidden rounded-full', SIZES[size], className)

  if (known?.logo) {
    return (
      <span
        className={cn(base, !known.appIcon && 'border border-border')}
        style={{ backgroundColor: known.appIcon ? known.color : '#fff' }}
        aria-hidden
      >
        <img src={known.logo} alt="" className={bankLogoImgClass(known)} loading="lazy" />
      </span>
    )
  }
  if (bank?.trim()) {
    return (
      <span className={cn(base, 'font-semibold text-white')} style={{ backgroundColor: known?.color ?? color }} aria-hidden>
        {bankInitials(known?.name ?? bank)}
      </span>
    )
  }
  return (
    <span className={cn(base, 'text-white')} style={{ backgroundColor: color }} aria-hidden>
      <CreditCard className={size === 'lg' ? 'size-5' : 'size-3.5'} />
    </span>
  )
}
