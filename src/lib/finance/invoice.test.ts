import { describe, expect, it } from 'vitest'
import { invoiceDates, invoiceDatesForReference, invoiceOffset, invoiceStatus, referenceFromOffset, splitInstallments } from './invoice'

describe('invoiceDates', () => {
  it('fechamento 3, vencimento 10: antes do fechamento cai na fatura do mês', () => {
    expect(invoiceDates('2026-10-02', 3, 10)).toEqual({
      referenceMonth: '2026-10-01',
      closingOn: '2026-10-03',
      dueOn: '2026-10-10',
    })
  })

  it('no dia do fechamento já vai para a próxima', () => {
    expect(invoiceDates('2026-10-03', 3, 10).referenceMonth).toBe('2026-11-01')
  })

  it('vencimento menor que fechamento vence no mês seguinte', () => {
    expect(invoiceDates('2026-10-20', 25, 5)).toEqual({
      referenceMonth: '2026-11-01',
      closingOn: '2026-10-25',
      dueOn: '2026-11-05',
    })
  })

  it('atravessa a virada do ano', () => {
    expect(invoiceDates('2026-12-28', 25, 5)).toEqual({
      referenceMonth: '2027-02-01',
      closingOn: '2027-01-25',
      dueOn: '2027-02-05',
    })
  })

  it('dia 31 vira o último dia em meses curtos', () => {
    expect(invoiceDates('2027-02-10', 31, 10)).toEqual({
      referenceMonth: '2027-03-01',
      closingOn: '2027-02-28',
      dueOn: '2027-03-10',
    })
  })
})

describe('invoiceDatesForReference', () => {
  it('é o inverso de invoiceDates', () => {
    for (const [purchase, closing, due] of [
      ['2026-10-02', 3, 10],
      ['2026-10-20', 25, 5],
      ['2026-12-28', 25, 5],
      ['2027-02-10', 31, 10],
    ] as const) {
      const forward = invoiceDates(purchase, closing, due)
      expect(invoiceDatesForReference(forward.referenceMonth, closing, due)).toEqual(forward)
    }
  })
})

describe('invoiceOffset / referenceFromOffset', () => {
  it('mede a distância da compra até a fatura e volta', () => {
    expect(invoiceOffset('2026-10-20', '2026-11-01')).toBe(1)
    expect(invoiceOffset('2026-12-28', '2027-02-01')).toBe(2)
    expect(referenceFromOffset('2026-12-28', 2)).toBe('2027-02-01')
    expect(referenceFromOffset('2026-10-02', 0)).toBe('2026-10-01')
  })
})

describe('invoiceStatus', () => {
  const inv = { total: 1000, paid: 0, closing_on: '2026-10-03', due_on: '2026-10-10' }
  it.each([
    ['2026-10-01', 'open'],
    ['2026-10-05', 'closed'],
    ['2026-10-11', 'overdue'],
  ] as const)('%s → %s', (today, status) => {
    expect(invoiceStatus(inv, today)).toBe(status)
  })
  it('paga quando pago >= total', () => {
    expect(invoiceStatus({ ...inv, paid: 1000 }, '2026-10-20')).toBe('paid')
  })
})

describe('splitInstallments', () => {
  it('sobra de centavos na primeira parcela', () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333])
  })
  it('soma sempre o total', () => {
    const parts = splitInstallments(123457, 7)
    expect(parts.reduce((a, b) => a + b, 0)).toBe(123457)
  })
})
