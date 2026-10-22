// Leitura de extratos de fatura de cartão (OFX e CSV), feita no navegador.
// Convenção de saída: amount em centavos, POSITIVO = compra, NEGATIVO = crédito (pagamento/estorno).

export interface StatementLine {
  /** yyyy-MM-dd */
  date: string
  description: string
  amount: number
  /** Identificador estável da linha (FITID do OFX ou hash da linha do CSV) — evita duplicar ao reimportar. */
  externalId: string
}

export interface ParsedStatement {
  format: 'ofx' | 'csv'
  lines: StatementLine[]
  warnings: string[]
}

export type LineKind = 'purchase' | 'refund' | 'payment'

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

/** Hash djb2 em hex — determinístico, só para identificar linhas (não é segurança). */
function hash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Data em vários formatos: 2026-09-05, 05/09/2026, 05/09/26, 05-09-2026, 20260905, 05/09.
 * Sem ano, usa o ano da fatura (e o anterior se o mês passar do mês da fatura, ex.: compra
 * de dezembro numa fatura de janeiro).
 */
export function parseDate(raw: string, referenceMonth?: string): string | null {
  const text = raw.trim()
  let y: number, m: number, d: number
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  else if ((match = text.match(/^(\d{4})(\d{2})(\d{2})/))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  else if ((match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
    ;[d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
    if (y < 100) y += 2000
  } else if ((match = text.match(/^(\d{1,2})[/.-](\d{1,2})$/)) && referenceMonth) {
    ;[d, m] = [Number(match[1]), Number(match[2])]
    const refYear = Number(referenceMonth.slice(0, 4))
    const refMonth = Number(referenceMonth.slice(5, 7))
    y = m > refMonth ? refYear - 1 : refYear
  } else return null
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCMonth() !== m - 1) return null // 31/02 etc.
  return `${y}-${pad(m)}-${pad(d)}`
}

/**
 * Valor em centavos a partir de texto: "1.234,56", "-12,30", "R$ 15,00", "15.5", "1,234.56", "(12,30)".
 * O último separador seguido de 1–2 dígitos é o decimal.
 */
export function parseAmount(raw: string): number | null {
  let text = raw.trim().replace(/\s|R\$/gi, '')
  if (!text) return null
  let negative = false
  if (/^\(.*\)$/.test(text)) {
    negative = true
    text = text.slice(1, -1)
  }
  if (text.startsWith('-')) {
    negative = !negative
    text = text.slice(1)
  } else if (text.startsWith('+')) text = text.slice(1)
  if (text.endsWith('-')) {
    negative = !negative
    text = text.slice(0, -1)
  }
  if (!/^[\d.,]+$/.test(text)) return null
  const lastSep = Math.max(text.lastIndexOf(','), text.lastIndexOf('.'))
  let cents: number
  if (lastSep >= 0 && text.length - lastSep - 1 <= 2 && text.length - lastSep - 1 > 0) {
    const integer = text.slice(0, lastSep).replace(/[.,]/g, '')
    const decimals = text.slice(lastSep + 1).padEnd(2, '0')
    cents = Number(integer || '0') * 100 + Number(decimals)
  } else {
    cents = Number(text.replace(/[.,]/g, '')) * 100
  }
  if (!Number.isFinite(cents)) return null
  return negative ? -cents : cents
}

/** Normaliza descrição para comparar (sem acento, minúscula, sem número de parcela). */
export function normalizeDescription(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\bparc(ela)?\.?\s*\d+\s*(de|\/)\s*\d+\b/g, ' ')
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const PAYMENT = /\b(pagamento|pagto|pgto|pag\.?\s*fatura|payment)\b/i

/** Compra, estorno/crédito ou pagamento da fatura (este não deve virar lançamento). */
export function classifyLine(line: StatementLine): LineKind {
  if (line.amount > 0) return 'purchase'
  return PAYMENT.test(normalizeDescription(line.description)) ? 'payment' : 'refund'
}

// ---------------------------------------------------------------------------
// OFX
// ---------------------------------------------------------------------------

function ofxTag(block: string, tag: string): string | null {
  // OFX 1.x (SGML) não fecha tags; OFX 2.x (XML) fecha. Pega até o próximo "<".
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))
  return match ? match[1].trim() : null
}

export function parseOfx(text: string): ParsedStatement {
  const warnings: string[] = []
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? []
  const lines: StatementLine[] = []
  blocks.forEach((block, index) => {
    const date = parseDate(ofxTag(block, 'DTPOSTED') ?? '')
    const value = parseAmount(ofxTag(block, 'TRNAMT') ?? '')
    const description = ofxTag(block, 'MEMO') || ofxTag(block, 'NAME') || ''
    if (!date || value == null || !description) {
      warnings.push(`Linha ${index + 1} do OFX ignorada (dados incompletos).`)
      return
    }
    const fitid = ofxTag(block, 'FITID')
    // No OFX de cartão, débito (compra) vem negativo: inverte para a convenção (compra positiva).
    lines.push({
      date,
      description,
      amount: -value,
      externalId: fitid ? `ofx:${fitid}` : `ofx:${hash(`${date}|${description}|${value}|${index}`)}`,
    })
  })
  if (blocks.length === 0) warnings.push('Nenhum lançamento encontrado no OFX.')
  return { format: 'ofx', lines, warnings }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Divide uma linha CSV respeitando aspas. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i++
      } else quoted = !quoted
    } else if (ch === delimiter && !quoted) {
      out.push(current)
      current = ''
    } else current += ch
  }
  out.push(current)
  return out.map((c) => c.trim())
}

const HEADER = {
  date: /^(data|date|dt|data (da )?compra|data lancamento)$/,
  description: /^(descricao|description|title|titulo|estabelecimento|lancamento|historico|detalhes?|nome)$/,
  amount: /^(valor|amount|value|valor \(r\$\)|valor r\$|valor em r\$|quantia)$/,
}

export function parseCsv(text: string, referenceMonth?: string): ParsedStatement {
  const warnings: string[] = []
  const rows = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim())
  if (rows.length === 0) return { format: 'csv', lines: [], warnings: ['Arquivo vazio.'] }

  const delimiter = [';', ',', '\t'].reduce((best, d) => (rows[0].split(d).length > rows[0].split(best).length ? d : best), ',')
  const head = splitCsvLine(rows[0], delimiter).map((h) =>
    h
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/"/g, '')
      .trim(),
  )
  let cols = {
    date: head.findIndex((h) => HEADER.date.test(h)),
    description: head.findIndex((h) => HEADER.description.test(h)),
    amount: head.findIndex((h) => HEADER.amount.test(h)),
  }
  let body = rows.slice(1)
  // Sem cabeçalho reconhecível: tenta data;descrição;valor pelas posições.
  if (cols.date < 0 || cols.description < 0 || cols.amount < 0) {
    const first = splitCsvLine(rows[0], delimiter)
    if (first.length >= 3 && parseDate(first[0], referenceMonth)) {
      cols = { date: 0, description: 1, amount: first.length - 1 }
      body = rows
      warnings.push('Cabeçalho não reconhecido: usando colunas data, descrição e valor (última).')
    } else {
      return { format: 'csv', lines: [], warnings: ['Não encontrei as colunas de data, descrição e valor.'] }
    }
  }

  const lines: StatementLine[] = []
  const seen = new Map<string, number>()
  body.forEach((row, index) => {
    const cells = splitCsvLine(row, delimiter)
    const date = parseDate(cells[cols.date] ?? '', referenceMonth)
    const value = parseAmount(cells[cols.amount] ?? '')
    const description = (cells[cols.description] ?? '').replace(/\s+/g, ' ').trim()
    if (!date || value == null || value === 0 || !description) {
      if (cells.some((c) => c)) warnings.push(`Linha ${index + 2} ignorada (data, valor ou descrição inválidos).`)
      return
    }
    // Linhas idênticas no mesmo arquivo (ex.: 2 cafés iguais) recebem ocorrência diferente.
    const base = `${date}|${description}|${value}`
    const occurrence = (seen.get(base) ?? 0) + 1
    seen.set(base, occurrence)
    lines.push({ date, description, amount: value, externalId: `csv:${hash(`${base}|${occurrence}`)}` })
  })

  // Bancos que exportam compras como negativas: se a maioria é negativa, inverte.
  const negatives = lines.filter((l) => l.amount < 0).length
  if (negatives > lines.length / 2) {
    for (const l of lines) l.amount = -l.amount
    warnings.push('Valores negativos interpretados como compras (padrão do arquivo).')
  }
  return { format: 'csv', lines, warnings }
}

export function parseStatement(fileName: string, text: string, referenceMonth?: string): ParsedStatement {
  const isOfx = /\.(ofx|qfx)$/i.test(fileName) || /<OFX>|OFXHEADER/i.test(text.slice(0, 2000))
  return isOfx ? parseOfx(text) : parseCsv(text, referenceMonth)
}

/** Lê o arquivo tentando UTF-8 e, se tiver bytes inválidos, Windows-1252 (comum em OFX de banco). */
export async function readStatementFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}
