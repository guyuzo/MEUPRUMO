import { describe, expect, it } from 'vitest'
import { formatMonth, isMonthKey, shiftMonth, toMonthKey } from './dates'

describe('dates', () => {
  it('normaliza para o primeiro dia do mês', () => {
    expect(toMonthKey(new Date(2026, 9, 15))).toBe('2026-10-01')
  })

  it('desloca meses atravessando o ano', () => {
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01')
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01')
  })

  it('formata em português', () => {
    expect(formatMonth('2026-10-01')).toBe('outubro de 2026')
  })

  it('valida chave de mês', () => {
    expect(isMonthKey('2026-10-01')).toBe(true)
    expect(isMonthKey('2026-10-15')).toBe(false)
    expect(isMonthKey('2026-13-01')).toBe(false)
  })
})
