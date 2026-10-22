import { addMonths, format, getDaysInMonth, isBefore, parseISO, startOfMonth } from 'date-fns'

// Espelho de public.invoice_dates (migration 20261015000004_cards.sql). Usado para
// pré-visualizar no formulário em qual fatura a compra vai cair.

export interface InvoiceDates {
  /** Mês do vencimento, 'yyyy-MM-01'. */
  referenceMonth: string
  closingOn: string
  dueOn: string
}

function clampDay(monthStart: Date, day: number): Date {
  const d = new Date(monthStart)
  d.setDate(Math.min(day, getDaysInMonth(monthStart)))
  return d
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

export function invoiceDates(purchase: string, closingDay: number, dueDay: number): InvoiceDates {
  const date = parseISO(purchase)
  const purchaseMonth = startOfMonth(date)
  const closingMonth = isBefore(date, clampDay(purchaseMonth, closingDay)) ? purchaseMonth : addMonths(purchaseMonth, 1)
  const dueMonth = dueDay > closingDay ? closingMonth : addMonths(closingMonth, 1)
  return {
    referenceMonth: iso(dueMonth),
    closingOn: iso(clampDay(closingMonth, closingDay)),
    dueOn: iso(clampDay(dueMonth, dueDay)),
  }
}

/** Datas de fechamento e vencimento de uma fatura pelo mês de referência (espelho de ensure_invoice_for_month). */
export function invoiceDatesForReference(referenceMonth: string, closingDay: number, dueDay: number): InvoiceDates {
  const ref = startOfMonth(parseISO(referenceMonth))
  const closingMonth = dueDay > closingDay ? ref : addMonths(ref, -1)
  return { referenceMonth: iso(ref), closingOn: iso(clampDay(closingMonth, closingDay)), dueOn: iso(clampDay(ref, dueDay)) }
}

/** Meses entre o mês da compra e o mês da fatura (0 = "mês da compra"). */
export function invoiceOffset(purchase: string, referenceMonth: string): number {
  const p = parseISO(purchase)
  const r = parseISO(referenceMonth)
  return (r.getFullYear() - p.getFullYear()) * 12 + (r.getMonth() - p.getMonth())
}

/** Mês de referência a partir do mês da compra + deslocamento. */
export function referenceFromOffset(purchase: string, offset: number): string {
  return iso(addMonths(startOfMonth(parseISO(purchase)), offset))
}

export type InvoiceStatus = 'open' | 'closed' | 'paid' | 'overdue' | 'empty'

export function invoiceStatus(
  inv: { total: number; paid: number; closing_on: string; due_on: string },
  today: string,
): InvoiceStatus {
  if (inv.total <= 0) return inv.paid > 0 ? 'paid' : 'empty'
  if (inv.paid >= inv.total) return 'paid'
  if (today < inv.closing_on) return 'open'
  if (today > inv.due_on) return 'overdue'
  return 'closed'
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  open: 'Aberta',
  closed: 'Fechada',
  paid: 'Paga',
  overdue: 'Vencida',
  empty: 'Sem lançamentos',
}

/** Divide o total em parcelas iguais; os centavos que sobram vão na primeira (igual ao SQL). */
export function splitInstallments(total: number, count: number): number[] {
  const base = Math.floor(total / count)
  return Array.from({ length: count }, (_, i) => base + (i === 0 ? total - base * count : 0))
}
