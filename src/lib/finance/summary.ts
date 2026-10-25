import { getDaysInMonth, parseISO } from 'date-fns'
import type { Transaction } from '@/types/database'

type Tx = Pick<Transaction, 'kind' | 'amount' | 'status' | 'occurred_on' | 'category_id'>

/**
 * Resumo do mês por competência (data da transação).
 * - Compras no cartão contam como gasto na data da compra; o pagamento da fatura não conta
 *   (seria gasto em dobro). Estornos abatem o gasto no cartão.
 * - Transferências não são ganho nem gasto.
 */
export interface MonthSummary {
  income: number
  /** Total de saídas = fixed + variable + card + debt + investment + goal */
  expenses: number
  fixed: number
  variable: number
  card: number
  debt: number
  investment: number
  goal: number
  net: number
  pendingExpenses: number
  pendingIncome: number
}

export function summarizeMonth(rows: Tx[]): MonthSummary {
  const s: MonthSummary = {
    income: 0,
    expenses: 0,
    fixed: 0,
    variable: 0,
    card: 0,
    debt: 0,
    investment: 0,
    goal: 0,
    net: 0,
    pendingExpenses: 0,
    pendingIncome: 0,
  }
  for (const t of rows) {
    switch (t.kind) {
      case 'income':
        s.income += t.amount
        if (t.status === 'pending') s.pendingIncome += t.amount
        continue
      case 'expense_fixed':
        s.fixed += t.amount
        break
      case 'expense_variable':
        s.variable += t.amount
        break
      case 'card_purchase':
        s.card += t.amount
        continue
      case 'card_refund':
        s.card -= t.amount
        continue
      case 'debt_payment':
        s.debt += t.amount
        break
      case 'investment_contribution':
        s.investment += t.amount
        break
      case 'goal_contribution':
        s.goal += t.amount
        break
      default:
        // transfer, invoice_payment, resgates: não são ganho nem gasto.
        continue
    }
    if (t.status === 'pending') s.pendingExpenses += t.amount
  }
  s.expenses = s.fixed + s.variable + s.card + s.debt + s.investment + s.goal
  s.net = s.income - s.expenses
  return s
}

/** Variação percentual; null quando a base é zero. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/** Gasto por categoria no mês (despesas + cartão − estornos). */
export function spendingByCategory(rows: Tx[]): Map<string | null, number> {
  const out = new Map<string | null, number>()
  for (const t of rows) {
    const sign =
      t.kind === 'expense_fixed' || t.kind === 'expense_variable' || t.kind === 'card_purchase'
        ? 1
        : t.kind === 'card_refund'
          ? -1
          : 0
    if (!sign) continue
    out.set(t.category_id, (out.get(t.category_id) ?? 0) + sign * t.amount)
  }
  return out
}

// type (não interface) para ser atribuível a Record<string, number> nos gráficos.
/** Gasto por subcategoria no mês (mesma regra de spendingByCategory). Sem subcategoria fica fora. */
export function spendingBySubcategory(rows: (Tx & Pick<Transaction, 'subcategory_id'>)[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of rows) {
    if (!t.subcategory_id) continue
    const sign =
      t.kind === 'expense_fixed' || t.kind === 'expense_variable' || t.kind === 'card_purchase' ? 1 : t.kind === 'card_refund' ? -1 : 0
    if (!sign) continue
    out.set(t.subcategory_id, (out.get(t.subcategory_id) ?? 0) + sign * t.amount)
  }
  return out
}

export type DailyPoint = {
  day: number
  income: number
  expenses: number
}

/** Acumulado diário de ganhos e gastos no mês, para o gráfico. */
export function dailyCumulative(rows: Tx[], month: string): DailyPoint[] {
  const days = getDaysInMonth(parseISO(month))
  const income = new Array<number>(days + 1).fill(0)
  const expenses = new Array<number>(days + 1).fill(0)
  for (const t of rows) {
    // Compra de mês anterior que cai na fatura deste mês entra no dia 1.
    const day = t.occurred_on.slice(0, 7) === month.slice(0, 7) ? Number(t.occurred_on.slice(8, 10)) : 1
    const one = summarizeMonth([t])
    income[day] += one.income
    expenses[day] += one.expenses
  }
  const points: DailyPoint[] = []
  let inc = 0
  let exp = 0
  for (let day = 1; day <= days; day++) {
    inc += income[day]
    exp += expenses[day]
    points.push({ day, income: inc, expenses: exp })
  }
  return points
}
