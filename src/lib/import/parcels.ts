import { parseInstallment } from '@/lib/finance/installments'
import { normalizeDescription } from '@/lib/import/statement'

// Reconhecer a mesma parcela entre faturas. Não usa a data: há bancos que repetem a data da compra
// em todas as parcelas e outros que datam cada parcela no fechamento da fatura anterior
// ("Loja - Parcela 6/7" em 17/09 e "7/7" em 17/10). Usa nome base + "n/total" + valor próximo
// (a 1ª parcela pode ter centavos a mais).

export interface KnownParcel {
  id: string
  /** Parcela prevista (external_id "proj:…"), criada a partir de uma fatura anterior. */
  projected: boolean
  amount: number
  /** Fatura em que está (yyyy-MM-01). */
  invoiceMonth: string | null
}

export function parcelKey(description: string) {
  const parcel = parseInstallment(description)
  return parcel ? `${normalizeDescription(description)}|${parcel.current}/${parcel.total}` : null
}

/** Diferença aceitável entre parcelas da mesma compra: centavos do arredondamento. */
export const amountsClose = (a: number, b: number) => Math.abs(a - b) <= Math.max(5, Math.round(Math.abs(b) * 0.01))

export type ParcelIndex = Map<string, KnownParcel[]>

export function buildParcelIndex(rows: (KnownParcel & { description: string })[]): ParcelIndex {
  const index: ParcelIndex = new Map()
  for (const { description, ...parcel } of rows) {
    const key = parcelKey(description)
    if (!key) continue
    index.set(key, [...(index.get(key) ?? []), parcel])
  }
  return index
}

/** A parcela já lançada que corresponde a esta descrição e valor (opcionalmente só de uma fatura). */
export function findParcel(index: ParcelIndex, description: string, amount: number, invoiceMonth?: string): KnownParcel | undefined {
  const key = parcelKey(description)
  if (!key) return undefined
  return index.get(key)?.find((p) => amountsClose(p.amount, amount) && (!invoiceMonth || p.invoiceMonth === invoiceMonth))
}
