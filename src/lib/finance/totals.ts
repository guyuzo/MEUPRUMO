import type { TxDirection, TxKind, TxStatus } from '@/types/database'

export interface Totals {
  inflow: number
  outflow: number
  /** inflow − outflow (transferências não afetam o resultado). */
  net: number
  pendingCount: number
}

type Row = {
  amount: number
  kind: TxKind
  direction: TxDirection
  status: TxStatus
  bank_account_id: string | null
  destination_account_id: string | null
}

/**
 * Totais de uma lista de transações.
 * - Visão geral: pagamento de fatura não conta (a compra no cartão já foi contada como gasto).
 * - Com `accountId` (extrato de uma conta): conta tudo que movimenta a conta, inclusive
 *   pagamento de fatura e transferências.
 */
export function computeTotals(rows: Row[], accountId?: string): Totals {
  let inflow = 0
  let outflow = 0
  let pendingCount = 0
  for (const row of rows) {
    if (row.status === 'pending') pendingCount++
    if (row.kind === 'invoice_payment' && !accountId) continue
    if (row.direction === 'inflow') inflow += row.amount
    else if (row.direction === 'outflow') outflow += row.amount
    else if (accountId) {
      if (row.destination_account_id === accountId) inflow += row.amount
      else if (row.bank_account_id === accountId) outflow += row.amount
    }
  }
  return { inflow, outflow, net: inflow - outflow, pendingCount }
}
