import { describe, expect, it } from 'vitest'
import { buildParcelIndex, findParcel, parcelKey } from './parcels'

describe('parcelas entre faturas', () => {
  const index = buildParcelIndex([
    { id: 'p4', description: 'Htm*Mariana Rodrigues - Parcela 5/12', amount: 4106, projected: true, invoiceMonth: '2026-12-01' },
    { id: 'd2', description: 'Dorinhos - Loja - Parcela 3/3', amount: 10333, projected: true, invoiceMonth: '2026-12-01' },
    { id: 'x', description: 'IFOOD', amount: 100, projected: false, invoiceMonth: null },
  ])

  it('acha pela descrição base + n/total, sem depender da data', () => {
    expect(findParcel(index, 'Htm*Mariana Rodrigues - Parcela 5/12', 4106)?.id).toBe('p4')
    expect(findParcel(index, 'HTM*MARIANA RODRIGUES PARC 05/12', 4106)?.id).toBe('p4')
  })

  it('aceita centavos de diferença, mas não outra parcela nem outro valor', () => {
    expect(findParcel(index, 'Dorinhos - Loja - Parcela 3/3', 10334)?.id).toBe('d2')
    expect(findParcel(index, 'Dorinhos - Loja - Parcela 2/3', 10333)).toBeUndefined()
    expect(findParcel(index, 'Dorinhos - Loja - Parcela 3/3', 20000)).toBeUndefined()
  })

  it('pode exigir a fatura', () => {
    expect(findParcel(index, 'Htm*Mariana Rodrigues - Parcela 5/12', 4106, '2026-12-01')?.id).toBe('p4')
    expect(findParcel(index, 'Htm*Mariana Rodrigues - Parcela 5/12', 4106, '2027-01-01')).toBeUndefined()
  })

  it('sem parcela no texto não tem chave', () => {
    expect(parcelKey('IFOOD')).toBeNull()
  })
})
