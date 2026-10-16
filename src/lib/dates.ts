import { addMonths, format, parseISO, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/** Mês de referência no formato do banco: 'yyyy-MM-01'. */
export type MonthKey = string

export function toMonthKey(date: Date): MonthKey {
  return format(startOfMonth(date), 'yyyy-MM-01')
}

export function currentMonthKey(): MonthKey {
  return toMonthKey(new Date())
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  return toMonthKey(addMonths(parseISO(month), delta))
}

/** "outubro de 2026" */
export function formatMonth(month: MonthKey): string {
  return format(parseISO(month), "MMMM 'de' yyyy", { locale: ptBR })
}

/** "Outubro de 2026" — maiúscula só na primeira letra (CSS capitalize faria "Outubro De 2026"). */
export function formatMonthTitle(month: MonthKey): string {
  const text = formatMonth(month)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value)
}
