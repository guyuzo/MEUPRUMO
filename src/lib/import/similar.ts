import { differenceInCalendarDays, parseISO } from 'date-fns'
import { parseInstallment } from '@/lib/finance/installments'
import { amountsClose } from '@/lib/import/parcels'
import { normalizeDescription } from '@/lib/import/statement'

// Possíveis duplicados na importação de fatura: mesmo valor de um gasto que já está no cartão
// (lançado à mão, com outro nome) ou que aparece repetido no próprio arquivo. Não decide sozinho:
// a tela pergunta à pessoa se é o mesmo gasto.

/** Dias de folga entre a data lançada à mão e a data que o banco mostra. */
export const SIMILAR_WINDOW_DAYS = 3

export interface FileLine {
  id: string
  date: string
  description: string
  /** Em centavos; negativo = estorno/crédito. */
  amount: number
  /** Só compras e estornos são comparados. */
  comparable: boolean
}

export interface ExistingTx {
  id: string
  date: string
  description: string
  /** Em centavos; negativo = estorno. */
  amount: number
  /** Parcela de um parcelamento criado no app: não dá para trocar uma parcela solta. */
  inPlan: boolean
  /** Parcela prevista para esta fatura: vale qualquer data e centavos de diferença. */
  projected?: boolean
}

export type Similar =
  | { source: 'existing'; tx: ExistingTx }
  | { source: 'file'; lineId: string }

/** Parcelas diferentes da mesma compra (3/10 x 4/10) têm o mesmo valor, mas não são duplicadas. */
function differentParcel(a: string, b: string) {
  const pa = parseInstallment(a)
  const pb = parseInstallment(b)
  return Boolean(pa && pb && (pa.current !== pb.current || pa.total !== pb.total))
}

/**
 * Para cada linha (que ainda não foi reconhecida como já lançada), procura um gasto do cartão com o
 * mesmo valor em até SIMILAR_WINDOW_DAYS dias, ou uma linha igual (data, valor e nome) antes no arquivo.
 * Cada gasto existente só serve de par para uma linha (a de data mais próxima).
 */
export function findSimilar(lines: FileLine[], existing: ExistingTx[], skip: Set<string>): Map<string, Similar> {
  const result = new Map<string, Similar>()
  const used = new Set<string>()
  const seenInFile = new Map<string, string>()

  for (const line of lines) {
    if (!line.comparable || skip.has(line.id)) continue

    // Repetida no próprio arquivo.
    const fileKey = `${line.date}|${line.amount}|${normalizeDescription(line.description)}|${parseInstallment(line.description)?.current ?? ''}`
    const first = seenInFile.get(fileKey)
    if (first) {
      result.set(line.id, { source: 'file', lineId: first })
      continue
    }
    seenInFile.set(fileKey, line.id)

    // Mesmo valor já lançado no cartão.
    let best: { tx: ExistingTx; gap: number } | null = null
    for (const tx of existing) {
      if (used.has(tx.id) || differentParcel(tx.description, line.description)) continue
      if (tx.projected ? !amountsClose(tx.amount, line.amount) : tx.amount !== line.amount) continue
      const gap = Math.abs(differenceInCalendarDays(parseISO(tx.date), parseISO(line.date)))
      // Prevista: a data foi estimada, então só serve para desempatar.
      if ((tx.projected || gap <= SIMILAR_WINDOW_DAYS) && (!best || gap < best.gap)) best = { tx, gap }
    }
    if (best) {
      used.add(best.tx.id)
      result.set(line.id, { source: 'existing', tx: best.tx })
    }
  }
  return result
}
