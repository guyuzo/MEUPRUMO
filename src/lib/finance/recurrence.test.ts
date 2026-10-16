import { describe, expect, it } from 'vitest'
import { describeFrequency, monthlyEquivalent, nextOccurrence, occurrence } from './recurrence'

const monthly31 = { frequency: 'monthly' as const, interval_count: 1, start_on: '2026-01-31', end_on: null }

describe('occurrence', () => {
  it('dia 31 se ajusta e volta a 31 (igual ao SQL)', () => {
    expect([0, 1, 2, 3].map((n) => occurrence(monthly31, n))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })
  it('semanal com intervalo', () => {
    expect(occurrence({ frequency: 'weekly', interval_count: 2, start_on: '2026-10-01' }, 1)).toBe('2026-10-15')
  })
})

describe('nextOccurrence', () => {
  it('encontra a próxima a partir de uma data', () => {
    expect(nextOccurrence(monthly31, '2026-03-01')).toBe('2026-03-31')
    expect(nextOccurrence(monthly31, '2026-03-31')).toBe('2026-03-31')
  })
  it('respeita a data final', () => {
    expect(nextOccurrence({ ...monthly31, end_on: '2026-02-28' }, '2026-03-01')).toBeNull()
  })
})

describe('describeFrequency / monthlyEquivalent', () => {
  it('descreve em português', () => {
    expect(describeFrequency('monthly', 1)).toBe('Todo mês')
    expect(describeFrequency('weekly', 2)).toBe('A cada 2 semanas')
  })
  it('converte para valor mensal', () => {
    expect(monthlyEquivalent({ amount: 12000, frequency: 'yearly', interval_count: 1 })).toBe(1000)
    expect(monthlyEquivalent({ amount: 1000, frequency: 'weekly', interval_count: 1 })).toBe(4333)
  })
})
