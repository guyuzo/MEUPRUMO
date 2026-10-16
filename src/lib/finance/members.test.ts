import { describe, expect, it } from 'vitest'
import { equalPercentages, spendingByMember } from './members'

describe('spendingByMember', () => {
  const rows = [
    { id: 't1', kind: 'expense_variable' as const, amount: 10000, household_member_id: 'ana' },
    { id: 't2', kind: 'card_purchase' as const, amount: 1000, household_member_id: null },
    { id: 't3', kind: 'income' as const, amount: 99999, household_member_id: 'ana' },
    { id: 't4', kind: 'expense_fixed' as const, amount: 5000, household_member_id: null },
  ]

  it('atribui inteiro a quem gastou e o resto à casa', () => {
    const m = spendingByMember(rows, [])
    expect(m.get('ana')).toBe(10000)
    expect(m.get(null)).toBe(6000)
  })

  it('reparte transação dividida e a soma bate', () => {
    const m = spendingByMember(rows, [
      { transaction_id: 't2', member_id: 'ana', percentage: 33.33 },
      { transaction_id: 't2', member_id: 'bia', percentage: 33.33 },
      { transaction_id: 't2', member_id: 'caio', percentage: 33.34 },
    ])
    expect(m.get('ana')).toBe(10000 + 333)
    expect(m.get('bia')).toBe(333)
    expect(m.get('caio')).toBe(334)
    expect(m.get(null)).toBe(5000)
  })
})

describe('equalPercentages', () => {
  it('soma exatamente 100', () => {
    for (const n of [1, 2, 3, 6, 7]) {
      const p = equalPercentages(n)
      expect(p).toHaveLength(n)
      expect(Math.round(p.reduce((a, b) => a + b, 0) * 100)).toBe(10000)
    }
    expect(equalPercentages(3)).toEqual([33.34, 33.33, 33.33])
  })
})
