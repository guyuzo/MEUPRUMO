import { describe, expect, it } from 'vitest'
import { findSimilar, type ExistingTx, type FileLine } from './similar'

const line = (id: string, date: string, description: string, amount: number): FileLine => ({ id, date, description, amount, comparable: true })
const tx = (id: string, date: string, description: string, amount: number, inPlan = false): ExistingTx => ({ id, date, description, amount, inPlan })

describe('findSimilar', () => {
  it('acha gasto lançado à mão com o mesmo valor e data próxima, mesmo com outro nome', () => {
    const result = findSimilar([line('a', '2026-10-10', 'SUPERMERCADO XYZ LTDA', 5000)], [tx('m1', '2026-10-09', 'Mercado', 5000)], new Set())
    expect(result.get('a')).toEqual({ source: 'existing', tx: tx('m1', '2026-10-09', 'Mercado', 5000) })
  })

  it('ignora valor diferente ou data longe demais', () => {
    const existing = [tx('m1', '2026-10-10', 'Mercado', 5001), tx('m2', '2026-10-20', 'Mercado', 5000)]
    expect(findSimilar([line('a', '2026-10-10', 'MERCADO', 5000)], existing, new Set()).size).toBe(0)
  })

  it('cada gasto existente vale para uma linha só (a de data mais próxima)', () => {
    const result = findSimilar(
      [line('a', '2026-10-08', 'UBER', 2000), line('b', '2026-10-10', 'UBER *TRIP', 2000)],
      [tx('m1', '2026-10-10', 'Uber', 2000)],
      new Set(),
    )
    expect(result.get('a')).toMatchObject({ source: 'existing', tx: { id: 'm1' } })
    expect(result.has('b')).toBe(false)
  })

  it('parcelas diferentes da mesma compra não são duplicadas', () => {
    const result = findSimilar([line('a', '2026-10-10', 'LOJA 04/10', 1000)], [tx('p3', '2026-10-10', 'LOJA 03/10', 1000)], new Set())
    expect(result.size).toBe(0)
  })

  it('linha repetida no próprio arquivo aponta para a primeira', () => {
    const result = findSimilar([line('a', '2026-10-10', 'IFOOD', 3000), line('b', '2026-10-10', 'IFOOD', 3000)], [], new Set())
    expect(result.get('b')).toEqual({ source: 'file', lineId: 'a' })
    expect(result.has('a')).toBe(false)
  })

  it('parcela prevista desta fatura: qualquer data e centavos de diferença (renomeada pela pessoa)', () => {
    const projected = { ...tx('pr', '2026-11-17', 'Tablet - Parcela 3/10', 6490), projected: true }
    const result = findSimilar([line('a', '2026-12-17', 'TIKTOK SHOP TABLET', 6491)], [projected], new Set())
    expect(result.get('a')).toMatchObject({ source: 'existing', tx: { id: 'pr' } })
  })

  it('pula linhas já reconhecidas como lançadas', () => {
    const result = findSimilar([line('a', '2026-10-10', 'MERCADO', 5000)], [tx('m1', '2026-10-10', 'Mercado', 5000)], new Set(['a']))
    expect(result.size).toBe(0)
  })
})
