import { describe, expect, it } from 'vitest'
import { centsToDecimal, toCsv } from './csv'

describe('toCsv', () => {
  it('usa ; e escapa aspas, ; e quebras de linha', () => {
    const csv = toCsv(['A', 'B'], [['x;y', 'diz "oi"'], ['linha\n2', null]])
    expect(csv).toBe('﻿A;B\r\n"x;y";"diz ""oi"""\r\n"linha\n2";')
  })
})

describe('centsToDecimal', () => {
  it.each([
    [123456, '1234,56'],
    [5, '0,05'],
    [-2550, '-25,50'],
    [0, '0,00'],
  ])('%i → %s', (cents, expected) => {
    expect(centsToDecimal(cents)).toBe(expected)
  })
})
