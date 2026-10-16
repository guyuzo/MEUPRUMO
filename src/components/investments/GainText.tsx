import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

/** "+R$ 150,00 (+1,5%)" — ganho/perda sobre o líquido aportado. */
export function GainText({ gain, invested, className }: { gain: number; invested: number; className?: string }) {
  const pct = invested > 0 ? (gain / invested) * 100 : null
  return (
    <span className={cn('tabular-nums', gain > 0 && 'text-income', gain < 0 && 'text-expense', className)}>
      {gain > 0 ? '+' : gain < 0 ? '−' : ''}
      {formatCents(Math.abs(gain))}
      {pct != null && ` (${gain >= 0 ? '+' : '−'}${Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`}
    </span>
  )
}
