import type { Transaction, TransactionSplit } from '@/types/database'

type Tx = Pick<Transaction, 'id' | 'kind' | 'amount' | 'household_member_id'>

/** Sinal do gasto: despesas e compras somam, estorno abate, o resto não é gasto. */
function spendSign(kind: Tx['kind']): number {
  if (kind === 'expense_fixed' || kind === 'expense_variable' || kind === 'card_purchase') return 1
  if (kind === 'card_refund') return -1
  return 0
}

/**
 * Gasto por pessoa. Transação dividida reparte pelos percentuais; sem divisão vai
 * inteira para quem está em household_member_id; sem ninguém, para a chave null ("Casa").
 * Centavos de arredondamento ficam com a última pessoa da divisão para a soma bater.
 */
export function spendingByMember(rows: Tx[], splits: Pick<TransactionSplit, 'transaction_id' | 'member_id' | 'percentage'>[]) {
  const byTx = new Map<string, typeof splits>()
  for (const s of splits) {
    const list = byTx.get(s.transaction_id) ?? []
    list.push(s)
    byTx.set(s.transaction_id, list)
  }

  const out = new Map<string | null, number>()
  const add = (member: string | null, value: number) => out.set(member, (out.get(member) ?? 0) + value)

  for (const t of rows) {
    const sign = spendSign(t.kind)
    if (!sign) continue
    const total = sign * t.amount
    const parts = byTx.get(t.id)
    if (!parts?.length) {
      add(t.household_member_id, total)
      continue
    }
    let assigned = 0
    parts.forEach((p, i) => {
      const share = i === parts.length - 1 ? total - assigned : Math.round((total * p.percentage) / 100)
      assigned += share
      add(p.member_id, share)
    })
  }
  return out
}

/** Percentuais iguais que somam exatamente 100 (sobra nos primeiros). */
export function equalPercentages(count: number): number[] {
  if (count <= 0) return []
  const base = Math.floor((100 / count) * 100) / 100
  const result = Array.from({ length: count }, () => base)
  let rest = Math.round((100 - base * count) * 100)
  for (let i = 0; rest > 0; i = (i + 1) % count, rest--) result[i] = Math.round((result[i] + 0.01) * 100) / 100
  return result
}
