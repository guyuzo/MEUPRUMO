// Reconhece parcelas pelo texto da descrição ("Parcela 3/12", "PARC 03 DE 12", "Loja 4/12", "(2/10)",
// "LOJA 02/10 SAO PAULO", "01 de 02", "2ª parcela de 5").
// Usado para compras importadas de fatura, que chegam como lançamentos soltos (sem installment_plan_id).

export interface InstallmentInfo {
  /** Número desta parcela (1-based). */
  current: number
  total: number
  /** Descrição sem o trecho da parcela (para agrupar as parcelas da mesma compra). */
  base: string
}

const MAX_INSTALLMENTS = 72

// Palavra que indica parcela: "parc", "parc.", "parcela", "parcelado", "parcelamento", "prest", "prestação", "pcl".
const KEYWORD = String.raw`(?:parc(?:ela|elado|elamento)?|presta(?:c|ç)(?:a|ã)o|prest|pcl)`

// Ordem importa: do padrão mais explícito para o mais ambíguo.
const PATTERNS: { re: RegExp; check?: (text: string, match: RegExpMatchArray) => boolean }[] = [
  // "Parcela 3/12", "Parc. 03 de 12", "PARC 3-12", "PARCELADO 1/3", "Prestação 2/10"
  { re: new RegExp(String.raw`[-–(]?\s*\b${KEYWORD}\b\.?:?\s*(\d{1,2})\s*(?:\/|de|of|-)\s*(\d{1,2})\b\s*\)?`, 'i') },
  // "2ª parcela de 5", "1a parc 3"
  { re: new RegExp(String.raw`[-–]?\s*\b(\d{1,2})\s*[ªaº°]?\s*${KEYWORD}\b\.?\s*(?:\/|de|of)?\s*(\d{1,2})\b`, 'i') },
  // "(3/12)" ou "[3/12]" em qualquer lugar
  { re: /[([]\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*[)\]]/ },
  // "Loja 4/12" ou "Loja - 04/12" no FIM da descrição
  { re: /[-–]?\s*\b(\d{1,2})\s*\/\s*(\d{1,2})\s*$/ },
  // "Loja 01 de 02" / "Loja - 1 de 2": número "de" número
  { re: /[-–]?\s*\b(\d{1,2})\s+de\s+(\d{1,2})\b(?!\s*[/.-]?\d)/i },
  // "MAGALU 02/10 SAO PAULO": N/M solto no meio. Não vale se parecer data ("05/09/2026", "em 05/09").
  {
    re: /[-–]?\s*(?<![\d/.])\b(\d{1,2})\/(\d{1,2})\b(?![/.]?\d)/,
    check: (text, match) => !/\b(em|dia|data|ate|até|desde|venc\w*)\s*[-:]?\s*$/i.test(text.slice(0, match.index)),
  },
]

function matchInstallment(text: string) {
  for (const { re, check } of PATTERNS) {
    const match = text.match(re)
    if (!match || (check && !check(text, match))) continue
    const current = Number(match[1])
    const total = Number(match[2])
    if (!(current >= 1 && total >= 2 && current <= total && total <= MAX_INSTALLMENTS)) continue
    return { match, current, total }
  }
  return null
}

export function parseInstallment(description: string): InstallmentInfo | null {
  const text = description.trim()
  const found = matchInstallment(text)
  if (!found) return null
  const { match, current, total } = found
  const base = (text.slice(0, match.index) + ' ' + text.slice(match.index! + match[0].length))
    .replace(/\s*[-–]\s*$/, '')
    .replace(/^\s*[-–]\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { current, total, base: base || text }
}

/**
 * A mesma descrição com outro número de parcela, no formato que o banco usa
 * ("LOJA PARC 03/10" → "LOJA PARC 04/10"; mantém o zero à esquerda).
 */
export function withInstallmentNumber(description: string, n: number): string {
  const text = description.trim()
  const found = matchInstallment(text)
  if (!found) return text
  const { match } = found
  // Em todos os padrões o primeiro número do trecho é o da parcela atual.
  const piece = match[0].replace(/\d{1,2}/, (digits) => String(n).padStart(digits.length, '0'))
  return text.slice(0, match.index) + piece + text.slice(match.index! + match[0].length)
}

/**
 * Parcelas que ainda vão vir depois desta: número, descrição e quantos meses à frente (1 = próxima fatura).
 * Ex.: "LOJA 03/05" → 04/05 (+1) e 05/05 (+2).
 */
export function upcomingInstallments(description: string): { number: number; description: string; monthsAhead: number }[] {
  const info = parseInstallment(description)
  if (!info) return []
  return Array.from({ length: info.total - info.current }, (_, i) => {
    const number = info.current + i + 1
    return { number, description: withInstallmentNumber(description, number), monthsAhead: i + 1 }
  })
}

/** Mês (yyyy-MM-01) em que cai a última parcela, a partir do mês desta parcela. */
export function lastInstallmentMonth(monthOfThis: string, info: Pick<InstallmentInfo, 'current' | 'total'>): string {
  const [y, m] = monthOfThis.slice(0, 7).split('-').map(Number)
  const index = y * 12 + (m - 1) + (info.total - info.current)
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`
}
