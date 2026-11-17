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
    // Formatos novos
    ['Tenis Nike 1/2', 1, 2, 'Tenis Nike'],
    ['MAGALU 02/10 SAO PAULO BR', 2, 10, 'MAGALU SAO PAULO BR'],
    ['LOJAS RENNER 01 DE 03', 1, 3, 'LOJAS RENNER'],
    ['Loja - 1 de 2', 1, 2, 'Loja'],
    ['PARCELADO 1/3 CASAS BAHIA', 1, 3, 'CASAS BAHIA'],
    ['Mercado Livre PARCELA: 4/6', 4, 6, 'Mercado Livre'],
    ['Decolar 2ª parcela de 5', 2, 5, 'Decolar'],
    ['Shopee [3/4]', 3, 4, 'Shopee'],
    ['PARC 1-2 FARMACIA', 1, 2, 'FARMACIA'],
  ])('%s → %i/%i', (text, current, total, base) => {
    expect(parseInstallment(text)).toEqual({ current, total, base })
  })

  it.each([
    'Uber *Trip',
    'Ebn*Tiktok Sh',
    'Compra 17/09 no mercado', // data no meio (17 > 9)
    'Compra em 05/09 no mercado', // data precedida de "em"
    'Pedido 05/09/2026 loja', // data completa
    'Lojas 25 de Março', // "de" seguido de palavra
    'Loja 13/12', // parcela maior que o total
    'Loja 0/12',
    'Assinatura 1/1', // "1 de 1" não é parcelamento
    'Mercado 5/99', // total fora do limite
    'Valor 1.5/2', // número decimal
  ])('%s → não é parcela', (text) => {
    expect(parseInstallment(text)).toBeNull()
  })

  it('a mesma compra em meses diferentes tem a mesma base (agrupa)', () => {
    expect(parseInstallment('MAGALU 02/10 SAO PAULO')?.base).toBe(parseInstallment('MAGALU 03/10 SAO PAULO')?.base)
  })
})

describe('lastInstallmentMonth', () => {
  it('soma as parcelas que faltam, virando o ano', () => {
    expect(lastInstallmentMonth('2026-10-01', { current: 3, total: 12 })).toBe('2027-07-01')
    expect(lastInstallmentMonth('2026-10-01', { current: 12, total: 12 })).toBe('2026-10-01')
  })
})
