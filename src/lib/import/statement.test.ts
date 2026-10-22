import { describe, expect, it } from 'vitest'
import { classifyLine, normalizeDescription, parseAmount, parseCsv, parseDate, parseOfx, parseStatement } from './statement'

describe('parseDate', () => {
  it.each([
    ['2026-09-05', '2026-09-05'],
    ['05/09/2026', '2026-09-05'],
    ['5/9/26', '2026-09-05'],
    ['05-09-2026', '2026-09-05'],
    ['20260905120000[-3:BRT]', '2026-09-05'],
    ['31/02/2026', null],
    ['abc', null],
  ])('%s → %s', (raw, expected) => {
    expect(parseDate(raw)).toBe(expected)
  })

  it('sem ano usa o da fatura (e o anterior na virada)', () => {
    expect(parseDate('05/09', '2026-10-01')).toBe('2026-09-05')
    expect(parseDate('20/12', '2027-01-01')).toBe('2026-12-20')
  })
})

describe('parseAmount', () => {
  it.each([
    ['1.234,56', 123456],
    ['-12,30', -1230],
    ['R$ 15,00', 1500],
    ['15.5', 1550],
    ['1,234.56', 123456],
    ['(12,30)', -1230],
    ['12,30-', -1230],
    ['1.000', 100000],
    ['abc', null],
  ])('%s → %s', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected)
  })
})

describe('normalizeDescription', () => {
  it('ignora acento, caixa e número de parcela', () => {
    expect(normalizeDescription('LOJA DO JOSÉ 02/10')).toBe('loja do jose')
    expect(normalizeDescription('Loja do Jose - Parcela 3 de 10')).toBe('loja do jose')
  })
})

describe('parseOfx', () => {
  const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260905<TRNAMT>-15.00<FITID>A1<MEMO>PADARIA
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260920<TRNAMT>-200.00<FITID>A2<MEMO>POSTO 1/3
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260925<TRNAMT>500.00<FITID>A3<MEMO>PAGAMENTO RECEBIDO
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260926<TRNAMT>10.00<FITID>A4<MEMO>ESTORNO LOJA
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`

  it('lê lançamentos, FITID e inverte o sinal (compra positiva)', () => {
    const { lines, format } = parseOfx(ofx)
    expect(format).toBe('ofx')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toEqual({ date: '2026-09-05', description: 'PADARIA', amount: 1500, externalId: 'ofx:A1' })
    expect(lines.map(classifyLine)).toEqual(['purchase', 'purchase', 'payment', 'refund'])
  })

  it('detecta OFX pelo conteúdo mesmo com outra extensão', () => {
    expect(parseStatement('extrato.txt', ofx).format).toBe('ofx')
  })
})

describe('parseCsv', () => {
  it('formato Nubank (vírgula, data ISO, ponto decimal, compra positiva)', () => {
    const { lines } = parseCsv('date,title,amount\n2026-09-05,Padaria,15.00\n2026-09-25,Pagamento recebido,-500.00\n')
    expect(lines.map((l) => [l.date, l.description, l.amount])).toEqual([
      ['2026-09-05', 'Padaria', 1500],
      ['2026-09-25', 'Pagamento recebido', -50000],
    ])
    expect(classifyLine(lines[1])).toBe('payment')
  })

  it('formato brasileiro (ponto e vírgula, dd/mm, compras negativas → inverte)', () => {
    const csv = 'Data;Lançamento;Valor\n05/09;PADARIA;-15,00\n20/09;"POSTO; CENTRO";-1.200,00\n25/09;PAGTO FATURA;500,00\n'
    const { lines, warnings } = parseCsv(csv, '2026-10-01')
    expect(lines.map((l) => [l.date, l.description, l.amount])).toEqual([
      ['2026-09-05', 'PADARIA', 1500],
      ['2026-09-20', 'POSTO; CENTRO', 120000],
      ['2026-09-25', 'PAGTO FATURA', -50000],
    ])
    expect(warnings.some((w) => w.includes('negativos'))).toBe(true)
  })

  it('linhas idênticas recebem identificadores diferentes e estáveis', () => {
    const csv = 'data,descricao,valor\n2026-09-05,Cafe,5,00\n2026-09-05,Cafe,5,00\n'
    const a = parseCsv(csv.replace(/5,00/g, '"5,00"')).lines
    const b = parseCsv(csv.replace(/5,00/g, '"5,00"')).lines
    expect(a).toHaveLength(2)
    expect(a[0].externalId).not.toBe(a[1].externalId)
    expect(a.map((l) => l.externalId)).toEqual(b.map((l) => l.externalId))
  })

  it('avisa quando não acha as colunas', () => {
    const { lines, warnings } = parseCsv('foo,bar\n1,2\n')
    expect(lines).toHaveLength(0)
    expect(warnings[0]).toMatch(/colunas/)
  })
})
