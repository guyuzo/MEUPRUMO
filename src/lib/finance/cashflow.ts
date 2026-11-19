import { shiftMonth, type MonthKey } from '@/lib/dates'
import type { InvoiceSummary, Transaction } from '@/types/database'

type Tx = Pick<
  Transaction,
  'kind' | 'direction' | 'amount' | 'status' | 'occurred_on' | 'due_on' | 'paid_on' | 'bank_account_id'
>

/**
 * Fluxo de caixa (regime de caixa): o que entra e sai, mês a mês.
 * - Compras no cartão não saem do caixa; sai o pagamento da fatura. Para faturas ainda não
 *   quitadas, o restante entra no mês do vencimento.
 * - Transferências entre contas não alteram o caixa total.
 * - Pago entra no mês do pagamento; pendente, no mês do vencimento — inclusive vencido e não pago,
 *   que continua no mês em que venceu (e aparece em "overdue").
 * - Saldo previsto: o que ainda não foi pago só mexe no saldo a partir de hoje (vencido = mês atual).
 * - Gasto/ganho pago sem conta (dinheiro, por exemplo) entra em ganhos/saídas, mas não no saldo das contas.
 */
export interface CashFlowMonth {
  month: MonthKey
  inflow: number
  outflow: number
  net: number
  /** Saldo previsto ao fim do mês; null para meses já encerrados. */
  projectedBalance: number | null
  /** Quanto do mês venceu e não foi pago/recebido (saídas positivas, entradas negativas somadas à parte). */
  overdueOutflow: number
  overdueInflow: number
}

function cashDate(t: Tx): string {
  return t.status === 'paid' ? (t.paid_on ?? t.occurred_on) : (t.due_on ?? t.occurred_on)
}

const ON_CARD: Tx['kind'][] = ['card_purchase', 'card_refund']

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
  const flows = new Map(months.map((m) => [m, { inflow: 0, outflow: 0, overdueInflow: 0, overdueOutflow: 0 }]))
  // Variação futura (ainda não refletida no saldo atual) acumulada por mês.
  const pendingDelta = new Map<MonthKey, number>()

  const add = (date: string, signed: number, isPending: boolean) => {
    const month = monthOf(date)
    const bucket = flows.get(month)
    const overdue = isPending && date < today
    if (bucket) {
      if (signed >= 0) {
        bucket.inflow += signed
        if (overdue) bucket.overdueInflow += signed
      } else {
        bucket.outflow += -signed
        if (overdue) bucket.overdueOutflow += -signed
      }
    }
    // Ainda não saiu/entrou da conta: no saldo, conta a partir do mês atual.
    if (isPending) {
      const balanceMonth = month < currentMonth ? currentMonth : month
      pendingDelta.set(balanceMonth, (pendingDelta.get(balanceMonth) ?? 0) + signed)
    }
  }

  for (const t of transactions) {
    // Compra no cartão sai do caixa pela fatura; transferência não muda o total.
    if (t.direction === 'transfer' || ON_CARD.includes(t.kind)) continue
    const signed = t.direction === 'inflow' ? t.amount : -t.amount
    // Pago sem conta (dinheiro) aparece em ganhos/saídas, mas não mexe no saldo das contas.
    if (!t.bank_account_id && t.status === 'paid') {
      const bucket = flows.get(monthOf(cashDate(t)))
      if (bucket) {
        if (signed >= 0) bucket.inflow += signed
        else bucket.outflow += -signed
      }
      continue
    }
    add(cashDate(t), signed, t.status === 'pending')
  }

  for (const inv of invoices) {
    const remaining = inv.total - inv.paid
    if (remaining <= 0) continue
    add(inv.due_on, -remaining, true)
  }

  let running = currentBalance
  // Pendências que caem antes do primeiro mês exibido (não deveria haver, mas por segurança).
  for (const [m, delta] of pendingDelta) if (m < months[0]) running += delta

  return months.map((month) => {
    const { inflow, outflow, overdueInflow, overdueOutflow } = flows.get(month)!
    const past = month < currentMonth
    if (!past) running += pendingDelta.get(month) ?? 0
    return { month, inflow, outflow, net: inflow - outflow, projectedBalance: past ? null : running, overdueInflow, overdueOutflow }
  })
}

export function monthRange(start: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(start, i))
}
