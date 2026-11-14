import { describe, expect, it } from 'vitest'
import { lastInstallmentMonth, parseInstallment } from './installments'

describe('parseInstallment', () => {
  it.each([
    ['Htm*Mariana Rodrigues - Parcela 3/12', 3, 12, 'Htm*Mariana Rodrigues'],
    ['MAGAZINE LUIZA PARC 02/10', 2, 10, 'MAGAZINE LUIZA'],
    ['Loja X Parc. 03 de 12', 3, 12, 'Loja X'],
    ['Notebook Dell (1/10)', 1, 10, 'Notebook Dell'],
    ['AMAZON MARKETPLACE 4/12', 4, 12, 'AMAZON MARKETPLACE'],
    ['Geladeira - 12/12', 12, 12, 'Geladeira'],
    ['Prestação 2/24 Carro', 2, 24, 'Carro'],
  ])('%s → %i/%i', (text, current, total, base) => {
    expect(parseInstallment(text)).toEqual({ current, total, base })
  })

  it.each([
    'Uber *Trip',
    'Ebn*Tiktok Sh',
    'Compra 17/09 no mercado', // data no meio, não no fim
    'Loja 13/12', // parcela maior que o total
    'Loja 0/12',
    'Assinatura 1/1', // "1 de 1" não é parcelamento
    'Mercado 5/99', // total fora do limite
  ])('%s → não é parcela', (text) => {
    expect(parseInstallment(text)).toBeNull()
  })
})

describe('lastInstallmentMonth', () => {
  it('soma as parcelas que faltam, virando o ano', () => {
    expect(lastInstallmentMonth('2026-10-01', { current: 3, total: 12 })).toBe('2027-07-01')
    expect(lastInstallmentMonth('2026-10-01', { current: 12, total: 12 })).toBe('2026-10-01')
  })
})
