import { describe, expect, it } from 'vitest'
import { formatCents, parseToCents } from './money'

describe('parseToCents', () => {
  it.each([
    ['1.234,56', 123456],
    ['R$ 10', 1000],
    ['10,5', 1050],
    ['-5,25', -525],
    ['0,01', 1],
    ['1.000', 100000],
  ])('%s → %i', (input, expected) => {
    expect(parseToCents(input)).toBe(expected)
  })

  it('rejeita texto vazio', () => {
    expect(parseToCents('abc')).toBeNull()
    expect(parseToCents('')).toBeNull()
  })
})

describe('formatCents', () => {
  it('formata em reais', () => {
    expect(formatCents(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56')
  })
})
