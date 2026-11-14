// Reconhece parcelas pelo texto da descrição ("Parcela 3/12", "PARC 03 DE 12", "Loja 4/12", "(2/10)").
// Usado para compras importadas de fatura, que chegam como lançamentos soltos (sem installment_plan_id).

export interface InstallmentInfo {
  /** Número desta parcela (1-based). */
  current: number
  total: number
  /** Descrição sem o trecho da parcela (para agrupar as parcelas da mesma compra). */
  base: string
}

const MAX_INSTALLMENTS = 72

// Ordem importa: do padrão mais explícito para o mais ambíguo.
const PATTERNS: RegExp[] = [
  // "Parcela 3/12", "Parc. 03 de 12", "PARC 3 DE 12", "Prestação 2/10"
  /[-–(]?\s*\b(?:parc(?:ela)?|presta(?:c|ç)(?:a|ã)o|prest)\b\.?\s*(\d{1,2})\s*(?:\/|de|of)\s*(\d{1,2})\s*\)?/i,
  // "(3/12)" em qualquer lugar
  /\(\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\)/,
  // "Loja 4/12" ou "Loja - 04/12" no FIM da descrição (no meio pode ser data)
  /[-–]?\s*\b(\d{1,2})\s*\/\s*(\d{1,2})\s*$/,
]

export function parseInstallment(description: string): InstallmentInfo | null {
  const text = description.trim()
  for (const pattern of PATTERNS) {
    const match = text.match(pattern)
    if (!match) continue
    const current = Number(match[1])
    const total = Number(match[2])
    if (!(current >= 1 && total >= 2 && current <= total && total <= MAX_INSTALLMENTS)) continue
    const base = (text.slice(0, match.index) + text.slice(match.index! + match[0].length))
      .replace(/\s*[-–]\s*$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    return { current, total, base: base || text }
  }
  return null
}

/** Mês (yyyy-MM-01) em que cai a última parcela, a partir do mês desta parcela. */
export function lastInstallmentMonth(monthOfThis: string, info: Pick<InstallmentInfo, 'current' | 'total'>): string {
  const [y, m] = monthOfThis.slice(0, 7).split('-').map(Number)
  const index = y * 12 + (m - 1) + (info.total - info.current)
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`
}
