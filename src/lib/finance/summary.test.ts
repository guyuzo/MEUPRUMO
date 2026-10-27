import { describe, expect, it } from 'vitest'
import type { TxDirection, TxKind, TxStatus } from '@/types/database'
import { cashFlow, monthRange } from './cashflow'
import { directionOf } from './labels'
import { dailyCumulative, percentChange, spendingByCategory, spendingBySubcategory, summarizeMonth } from './summary'

function tx(
  kind: TxKind,
  amount: number,
  occurred_on = '2026-10-10',
  extra: Partial<{ status: TxStatus; category_id: string; due_on: string; bank_account_id: string | null; direction: TxDirection }> = {},
) {
  return {
    kind,
    amount,
    occurred_on,
    status: extra.status ?? ('paid' as TxStatus),
    category_id: extra.category_id ?? null,
    due_on: extra.due_on ?? null,
    paid_on: (extra.status ?? 'paid') === 'paid' ? occurred_on : null,
    direction: extra.direction ?? directionOf(kind),
    bank_account_id:
      'bank_account_id' in extra ? (extra.bank_account_id ?? null) : kind.startsWith('card_') ? null : 'acc',
  }
}

describe('summarizeMonth', () => {
  it('separa fixos, variáveis e cartão; ignora pagamento de fatura e transferência', () => {
    const s = summarizeMonth([
      tx('income', 500000),
      tx('expense_fixed', 150000),
      tx('expense_variable', 30000, '2026-10-10', { status: 'pending' }),
      tx('card_purchase', 20000),
      tx('card_refund', 5000),
      tx('invoice_payment', 15000),
      tx('transfer', 99999),
    ])
    expect(s).toMatchObject({
      income: 500000,
      fixed: 150000,
      variable: 30000,
      card: 15000,
      expenses: 195000,
      net: 305000,
      pendingExpenses: 30000,
    })
  })
})

describe('percentChange', () => {
  it('calcula variação e evita divisão por zero', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 0)).toBeNull()
  })
})

describe('spendingByCategory', () => {
  it('soma despesas e cartão, abate estorno, ignora ganhos', () => {
    const m = spendingByCategory([
      tx('expense_variable', 100, undefined, { category_id: 'food' }),
      tx('card_purchase', 50, undefined, { category_id: 'food' }),
      tx('card_refund', 20, undefined, { category_id: 'food' }),
      tx('income', 1000, undefined, { category_id: 'salary' }),
    ])
    expect(m.get('food')).toBe(130)
    expect(m.has('salary')).toBe(false)
  })
})

describe('spendingBySubcategory', () => {
  it('soma por subcategoria, abate estorno e ignora sem subcategoria', () => {
    const rows = [
      { ...tx('expense_variable', 100), subcategory_id: 'mercado' },
      { ...tx('card_purchase', 50), subcategory_id: 'mercado' },
      { ...tx('card_refund', 20), subcategory_id: 'mercado' },
      { ...tx('expense_fixed', 999), subcategory_id: null },
      { ...tx('income', 500), subcategory_id: 'salario' },
    ]
    const m = spendingBySubcategory(rows)
    expect(m.get('mercado')).toBe(130)
    expect(m.size).toBe(1)
  })
})

describe('dailyCumulative', () => {
  it('acumula por dia e cobre o mês inteiro', () => {
    const points = dailyCumulative([tx('income', 100, '2026-10-05'), tx('expense_variable', 30, '2026-10-07')], '2026-10-01')
    expect(points).toHaveLength(31)
    expect(points[3]).toEqual({ day: 4, income: 0, expenses: 0, dayIncome: 0, dayExpenses: 0 })
    expect(points[4]).toEqual({ day: 5, income: 100, expenses: 0, dayIncome: 100, dayExpenses: 0 })
    expect(points[6]).toEqual({ day: 7, income: 100, expenses: 30, dayIncome: 0, dayExpenses: 30 })
    expect(points[30]).toEqual({ day: 31, income: 100, expenses: 30, dayIncome: 0, dayExpenses: 0 })
  })

  it('compra de mês anterior que conta neste mês (fatura) entra no dia 1', () => {
    const points = dailyCumulative([tx('card_purchase', 50, '2026-09-20')], '2026-10-01')
    expect(points[0]).toMatchObject({ day: 1, dayExpenses: 50, expenses: 50 })
  })
})

describe('cashFlow', () => {
  const months = monthRange('2026-09-01', 3) // set, out, nov

  it('usa vencimento da fatura, não a data da compra', () => {
    const rows = cashFlow({
      months,
      transactions: [tx('card_purchase', 20000, '2026-10-02')],
      invoices: [{ total: 20000, paid: 0, due_on: '2026-11-10' }],
      currentBalance: 100000,
      today: '2026-10-15',
    })
    expect(rows.map((r) => r.outflow)).toEqual([0, 0, 20000])
    expect(rows[2].projectedBalance).toBe(80000)
  })

  it('pendentes projetam o saldo; meses passados não têm projeção', () => {
    const rows = cashFlow({
      months,
      transactions: [
        tx('income', 300000, '2026-09-05'),
        tx('expense_fixed', 150000, '2026-11-10', { status: 'pending', due_on: '2026-11-10' }),
        tx('income', 50000, '2026-10-20', { status: 'pending' }),
      ],
      invoices: [],
      currentBalance: 100000,
      today: '2026-10-15',
    })
    expect(rows[0]).toMatchObject({ inflow: 300000, projectedBalance: null })
    expect(rows[1].projectedBalance).toBe(150000)
    expect(rows[2].projectedBalance).toBe(0)
  })

  it('pendente vencido conta como hoje e fatura parcialmente paga projeta só o restante', () => {
    const rows = cashFlow({
      months,
      transactions: [tx('expense_variable', 10000, '2026-09-20', { status: 'pending', due_on: '2026-09-25' })],
      invoices: [{ total: 30000, paid: 10000, due_on: '2026-10-10' }],
      currentBalance: 100000,
      today: '2026-10-15',
    })
    expect(rows[0].outflow).toBe(0)
    expect(rows[1].outflow).toBe(30000)
    expect(rows[1].projectedBalance).toBe(70000)
  })

  it('transferências não afetam o caixa total', () => {
    const rows = cashFlow({
      months,
      transactions: [tx('transfer', 5000, '2026-10-01')],
      invoices: [],
      currentBalance: 0,
      today: '2026-10-15',
    })
    expect(rows[1]).toMatchObject({ inflow: 0, outflow: 0 })
  })
})
