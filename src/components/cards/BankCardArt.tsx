import type { LucideIcon } from 'lucide-react'
import { bankInitials, bankLogoImgClass, findBank } from '@/lib/banks'
import { cn } from '@/lib/utils'

/** Texto escuro sobre cores claras (ex.: Will Bank, Nomad); branco nas demais. */
function isLight(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return false
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45
}

/**
 * Cartão fictício (proporção de cartão de crédito) na cor do banco, com a logo dele.
 * Usado em Cartões e em Contas; `chip` liga o chip dourado (só faz sentido em cartão).
 */
export function BankCardArt({
  bank,
  color,
  title,
  subtitle,
  number,
  chip = false,
  fallbackIcon: FallbackIcon,
  className,
}: {
  bank: string | null | undefined
  /** Cor salva no cartão/conta; vale quando o banco não é reconhecido. */
  color: string
  title: string
  subtitle?: string | null
  /** Linha de baixo, ex.: "•••• 6729". */
  number?: string | null
  chip?: boolean
  fallbackIcon?: LucideIcon
  className?: string
}) {
  const known = findBank(bank)
  const bg = known?.color ?? color
  const light = isLight(bg)

  return (
    <div
      className={cn(
        'relative isolate flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-xl p-4 sm:p-5',
        light ? 'text-neutral-900' : 'text-white',
        className,
      )}
      style={{ backgroundColor: bg }}
    >
      {/* Ondas decorativas, só para lembrar um cartão de verdade */}
      <span aria-hidden className={cn('absolute -right-16 -top-20 -z-10 size-56 rounded-full', light ? 'bg-black/5' : 'bg-white/10')} />
      <span aria-hidden className={cn('absolute -bottom-24 -right-4 -z-10 size-56 rounded-full', light ? 'bg-black/5' : 'bg-white/[0.06]')} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-tight">{title}</p>
          {subtitle && <p className="truncate text-xs opacity-80">{subtitle}</p>}
        </div>
        {known?.logo ? (
          <span
            className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg"
            style={{ backgroundColor: known.appIcon ? known.color : '#fff' }}
            aria-hidden
          >
            <img src={known.logo} alt="" className={bankLogoImgClass(known)} loading="lazy" />
          </span>
        ) : bank?.trim() ? (
          <span
            className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold', light ? 'bg-black/10' : 'bg-white/20')}
            aria-hidden
          >
            {bankInitials(known?.name ?? bank)}
          </span>
        ) : FallbackIcon ? (
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', light ? 'bg-black/10' : 'bg-white/20')} aria-hidden>
            <FallbackIcon className="size-5" />
          </span>
        ) : null}
      </div>

      {chip && (
        <span aria-hidden className="grid h-7 w-10 grid-cols-3 gap-px overflow-hidden rounded-md bg-[#c9a96e] p-1 opacity-90">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="rounded-[2px] bg-[#b08f55]" />
          ))}
        </span>
      )}

      <div className="flex items-end justify-between gap-3">
        <p className="font-mono text-sm tracking-widest tabular-nums opacity-90">{number ?? '•••• ••••'}</p>
        {bank?.trim() && <p className="truncate text-xs font-semibold uppercase tracking-wide opacity-80">{known?.name ?? bank}</p>}
      </div>
    </div>
  )
}
