import { shiftMonth, type MonthKey } from '@/lib/dates'
import type { InvoiceSummary, Transaction } from '@/types/database'

type Tx = Pick<
  Transaction,
  'kind' | 'direction' | 'amount' | 'status' | 'occurred_on' | 'due_on' | 'paid_on' | 'bank_account_id'
>

/**
 * Fluxo de caixa (regime de caixa): o que entra e sai das contas.
 * - Compras no cartão não saem do caixa; sai o pagamento da fatura. Para faturas ainda não
 *   quitadas, o restante é projetado na data de vencimento.
 * - Transferências entre contas não alteram o caixa total.
 * - Pendentes entram na data de vencimento; vencidos e não pagos são tratados como "hoje".
 */
export interface CashFlowMonth {
  month: MonthKey
  inflow: number
  outflow: number
  net: number
  /** Saldo previsto ao fim do mês; null para meses já encerrados. */
  projectedBalance: number | null
}

function cashDate(t: Tx, today: string): string {
  if (t.status === 'paid') return t.paid_on ?? t.occurred_on
  const due = t.due_on ?? t.occurred_on
  return due < today ? today : due
}

const monthOf = (date: string): MonthKey => `${date.slice(0, 7)}-01`

export function cashFlow(params: {
  months: MonthKey[]
  transactions: Tx[]
  invoices: Pick<InvoiceSummary, 'total' | 'paid' | 'due_on'>[]
  currentBalance: number
  today: string
}): CashFlowMonth[] {
  const { months, transactions, invoices, currentBalance, today } = params
  const currentMonth = monthOf(today)
  const flows = new Map(months.map((m) => [m, { inflow: 0, outflow: 0 }]))
  // Variação futura (ainda não refletida no saldo atual) acumulada por mês.
  const pendingDelta = new Map<MonthKey, number>()

  const add = (date: string, signed: number, isPending: boolean) => {
    const month = monthOf(date)
    const bucket = flows.get(month)
    if (bucket) {
      if (signed >= 0) bucket.inflow += signed
      else bucket.outflow += -signed
    }
    if (isPending) pendingDelta.set(month, (pendingDelta.get(month) ?? 0) + signed)
  }

  for (const t of transactions) {
    // Só o que movimenta conta bancária afeta o caixa.
    if (!t.bank_account_id || t.direction === 'transfer') continue
    const signed = t.direction === 'inflow' ? t.amount : -t.amount
    add(cashDate(t, today), signed, t.status === 'pending')
  }

  for (const inv of invoices) {
    const remaining = inv.total - inv.paid
    if (remaining <= 0) continue
    add(inv.due_on < today ? today : inv.due_on, -remaining, true)
  }

  let running = currentBalance
  // Pendências que caem antes do primeiro mês exibido (não deveria haver, mas por segurança).
  for (const [m, delta] of pendingDelta) if (m < months[0]) running += delta

  return months.map((month) => {
    const { inflow, outflow } = flows.get(month)!
    const past = month < currentMonth
    if (!past) running += pendingDelta.get(month) ?? 0
    return { month, inflow, outflow, net: inflow - outflow, projectedBalance: past ? null : running }
  })
}

export function monthRange(start: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(start, i))
}
