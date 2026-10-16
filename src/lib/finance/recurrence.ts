import { addDays, addMonths, addYears, format, parseISO } from 'date-fns'
import type { Recurrence, RecurrenceFrequency } from '@/types/database'

// Espelho de public.next_occurrence: sempre calculado a partir de start_on (n-ésima
// ocorrência), então dia 31 vira 28/30 nos meses curtos e volta a 31 nos longos.
export function occurrence(
  r: Pick<Recurrence, 'frequency' | 'interval_count' | 'start_on'>,
  n: number,
): string {
  const start = parseISO(r.start_on)
  const step = r.interval_count * n
  const date =
    r.frequency === 'weekly' ? addDays(start, 7 * step) : r.frequency === 'monthly' ? addMonths(start, step) : addYears(start, step)
  return format(date, 'yyyy-MM-dd')
}

/** Próxima ocorrência em ou depois de `from`; null se a recorrência já terminou. */
export function nextOccurrence(
  r: Pick<Recurrence, 'frequency' | 'interval_count' | 'start_on' | 'end_on'>,
  from: string,
): string | null {
  for (let n = 0; n < 5000; n++) {
    const date = occurrence(r, n)
    if (r.end_on && date > r.end_on) return null
    if (date >= from) return date
  }
  return null
}

const UNIT: Record<RecurrenceFrequency, [string, string]> = {
  weekly: ['semana', 'semanas'],
  monthly: ['mês', 'meses'],
  yearly: ['ano', 'anos'],
}

/** "Todo mês", "A cada 2 semanas". */
export function describeFrequency(frequency: RecurrenceFrequency, interval: number): string {
  if (interval === 1) return frequency === 'weekly' ? 'Toda semana' : frequency === 'monthly' ? 'Todo mês' : 'Todo ano'
  return `A cada ${interval} ${UNIT[frequency][1]}`
}

/** Valor equivalente por mês, para somar recorrências de frequências diferentes. */
export function monthlyEquivalent(r: Pick<Recurrence, 'amount' | 'frequency' | 'interval_count'>): number {
  const perYear = r.frequency === 'weekly' ? 52 / r.interval_count : r.frequency === 'monthly' ? 12 / r.interval_count : 1 / r.interval_count
  return Math.round((r.amount * perYear) / 12)
}
