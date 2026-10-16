import { describe, expect, it } from 'vitest'
import { displayCents, maskToCents } from './MoneyInput'

describe('maskToCents', () => {
  it.each([
    ['1', 1],
    ['10', 10],
    ['1050', 1050],
    ['1.000,00', 100000],
    ['abc', null],
    ['', null],
    ['R$ 12,3x4', 1234],
  ])('%s → %s', (text, expected) => {
    expect(maskToCents(text)).toBe(expected)
  })

  it('ignora "-" quando negativo não é permitido', () => {
    expect(maskToCents('-10,00')).toBe(1000)
  })

  it('com negativo: um "-" deixa negativo, dois voltam a positivo', () => {
    expect(maskToCents('10,00-', true)).toBe(-1000)
    expect(maskToCents('-10,00-', true)).toBe(1000)
    expect(maskToCents('-10,005', true)).toBe(-10005)
  })

  it('limita a 13 dígitos', () => {
    expect(maskToCents('99999999999999999')).toBe(9999999999999)
  })
})

describe('displayCents', () => {
  it('formata com sinal', () => {
    expect(displayCents(123456)).toBe('1.234,56')
    expect(displayCents(-1000)).toBe('-10,00')
    expect(displayCents(null)).toBe('')
  })
})
