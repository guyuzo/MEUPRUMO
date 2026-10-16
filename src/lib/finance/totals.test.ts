import { describe, expect, it } from 'vitest'
import type { TxDirection, TxKind, TxStatus } from '@/types/database'
import { directionOf } from './labels'
import { computeTotals } from './totals'

const tx = (
  amount: number,
  direction: TxDirection,
  extra: Partial<{ status: TxStatus; from: string; to: string; kind: TxKind }> = {},
) => ({
  amount,
  direction,
  kind: extra.kind ?? (direction === 'inflow' ? 'income' : direction === 'transfer' ? 'transfer' : 'expense_variable'),
  status: extra.status ?? 'paid',
  bank_account_id: 'from' in extra ? (extra.from ?? null) : 'a',
  destination_account_id: extra.to ?? null,
})

describe('computeTotals', () => {
  it('soma entradas e saídas e ignora transferências no geral', () => {
    const totals = computeTotals([tx(1000, 'inflow'), tx(300, 'outflow'), tx(500, 'transfer', { from: 'a', to: 'b' })])
    expect(totals).toEqual({ inflow: 1000, outflow: 300, net: 700, pendingCount: 0 })
  })

  it('com conta, transferência conta como saída da origem e entrada no destino', () => {
    const rows = [tx(500, 'transfer', { from: 'a', to: 'b' })]
    expect(computeTotals(rows, 'a')).toMatchObject({ inflow: 0, outflow: 500 })
    expect(computeTotals(rows, 'b')).toMatchObject({ inflow: 500, outflow: 0 })
  })

  it('pagamento de fatura não duplica o gasto na visão geral, mas sai da conta', () => {
    const rows = [
      tx(800, 'outflow', { kind: 'card_purchase', from: undefined }),
      tx(800, 'outflow', { kind: 'invoice_payment', from: 'a' }),
    ]
    expect(computeTotals(rows).outflow).toBe(800)
    // No extrato da conta só o pagamento movimenta o saldo (a compra não tem conta).
    expect(computeTotals(rows.filter((r) => r.bank_account_id === 'a'), 'a').outflow).toBe(800)
  })

  it('conta pendentes', () => {
    expect(computeTotals([tx(10, 'outflow', { status: 'pending' }), tx(10, 'outflow')]).pendingCount).toBe(1)
  })
})

describe('directionOf', () => {
  it('espelha a coluna gerada do banco', () => {
    expect(directionOf('income')).toBe('inflow')
    expect(directionOf('card_refund')).toBe('inflow')
    expect(directionOf('expense_fixed')).toBe('outflow')
    expect(directionOf('invoice_payment')).toBe('outflow')
    expect(directionOf('transfer')).toBe('transfer')
  })
})
