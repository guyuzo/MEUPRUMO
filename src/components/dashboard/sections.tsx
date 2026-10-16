import { Link } from '@tanstack/react-router'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CreditCard } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, CardTitle } from '@/components/ui/card'
import type { CategoryWithSubs } from '@/hooks/usePlanning'
import type { MonthSummary } from '@/lib/finance/summary'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Card as CreditCardT, InvoiceSummary, Transaction } from '@/types/database'

export function StatTile({
  label,
  value,
  hint,
  change,
  goodWhenUp = true,
  negative,
}: {
  label: string
  value: number
  hint?: ReactNode
  change?: number | null
  goodWhenUp?: boolean
  negative?: boolean
}) {
  return (
    <Card className="p-4 sm:p-5">
      <CardTitle>{label}</CardTitle>
      <p className={cn('mt-2 text-lg font-semibold tabular-nums sm:text-2xl', negative && 'text-expense')}>
        {formatCents(value)}
      </p>
      {change != null && Number.isFinite(change) ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          {change >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
          <span className={cn('font-medium', (change >= 0) === goodWhenUp ? 'text-income' : 'text-expense')}>
            {change >= 0 ? '+' : ''}
            {change.toFixed(0)}%
          </span>
          vs. mês anterior
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      )}
    </Card>
  )
}

/** Composição das saídas do mês. */
export function Breakdown({ summary }: { summary: MonthSummary }) {
  const rows = [
    ['Despesas fixas', summary.fixed],
    ['Despesas variáveis', summary.variable],
    ['Cartão de crédito', summary.card],
    ['Dívidas', summary.debt],
    ['Investimentos', summary.investment],
    ['Metas', summary.goal],
  ] as const
  const visible = rows.filter(([, v], i) => i < 3 || v > 0)
  const total = Math.max(summary.expenses, 1)

  return (
    <Card className="space-y-4">
      <CardTitle>Para onde foi o dinheiro</CardTitle>
      <ul className="space-y-3">
        {visible.map(([label, value]) => (
          <li key={label}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>{label}</span>
              <span className="tabular-nums">
                {formatCents(value)}
                <span className="ml-1.5 text-xs text-muted-foreground">{Math.round((Math.max(0, value) / total) * 100)}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[var(--color-series-2)]"
                style={{ width: `${Math.min(100, (Math.max(0, value) / total) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {(summary.pendingExpenses > 0 || summary.pendingIncome > 0) && (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          Ainda pendente no mês: {formatCents(summary.pendingExpenses)} a pagar · {formatCents(summary.pendingIncome)} a receber
        </p>
      )}
    </Card>
  )
}

/** Orçamento × realizado por categoria de despesa. */
export function BudgetProgress({
  categories,
  spending,
  budgets,
  month,
}: {
  categories: CategoryWithSubs[]
  spending: Map<string | null, number>
  budgets?: Map<string, number>
  month: string
}) {
  const rows = categories
    .filter((c) => c.kind === 'expense')
    .map((c) => ({ category: c, spent: Math.max(0, spending.get(c.id) ?? 0), budget: budgets?.get(c.id) ?? 0 }))
    .filter((r) => r.spent > 0 || r.budget > 0)
    .sort((a, b) => b.spent - a.spent)
  const uncategorized = Math.max(0, spending.get(null) ?? 0)

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <CardTitle>Gastos por categoria</CardTitle>
        <Link to="/categories" search={{ month, tab: 'expense' }} className="text-xs text-primary hover:underline">
          Orçamento
        </Link>
      </div>
      {rows.length === 0 && uncategorized === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum gasto neste mês.</p>
      ) : (
        <ul className="space-y-3">
          {rows.slice(0, 8).map(({ category, spent, budget }) => {
            const pct = budget > 0 ? (spent / budget) * 100 : 0
            const over = budget > 0 && spent > budget
            return (
              <li key={category.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">
                    {category.emoji} {category.name}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatCents(spent)}
                    {budget > 0 && <span className="text-xs text-muted-foreground"> / {formatCents(budget)}</span>}
                  </span>
                </div>
                {budget > 0 && (
                  <>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full', over ? 'bg-destructive' : 'bg-[var(--color-series-1)]')}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    {over && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="size-3" /> {formatCents(spent - budget)} acima do orçamento
                      </p>
                    )}
                  </>
                )}
              </li>
            )
          })}
          {uncategorized > 0 && (
            <li className="flex justify-between text-sm text-muted-foreground">
              <span>Sem categoria</span>
              <span className="tabular-nums">{formatCents(uncategorized)}</span>
            </li>
          )}
        </ul>
      )}
    </Card>
  )
}

interface Upcoming {
  key: string
  date: string
  label: string
  amount: number
  inflow: boolean
  card?: boolean
  link?: { cardId: string; ref: string }
}

/** Contas pendentes e faturas em aberto, por vencimento. */
export function UpcomingList({
  pending,
  invoices,
  cards,
  today,
  onSelect,
}: {
  pending: Transaction[]
  invoices: InvoiceSummary[]
  cards: CreditCardT[]
  today: string
  onSelect: (tx: Transaction) => void
}) {
  const cardName = new Map(cards.map((c) => [c.id, c.name]))
  const items: (Upcoming & { tx?: Transaction })[] = [
    ...pending
      .filter((t) => t.kind !== 'card_purchase')
      .map((t) => ({
        key: t.id,
        date: t.due_on ?? t.occurred_on,
        label: t.description,
        amount: t.amount,
        inflow: t.direction === 'inflow',
        tx: t,
      })),
    // Por cartão, só a próxima fatura em aberto (e as vencidas) — parcelamentos criariam várias futuras.
    ...invoices
      .filter((i) => i.total - i.paid > 0 && cardName.has(i.card_id))
      .filter(
        (i, _, open) =>
          i.due_on < today ||
          !open.some((o) => o.card_id === i.card_id && o.due_on >= today && o.due_on < i.due_on),
      )
      .map((i) => ({
        key: i.invoice_id,
        date: i.due_on,
        label: `Fatura ${cardName.get(i.card_id)}`,
        amount: i.total - i.paid,
        inflow: false,
        card: true,
        link: { cardId: i.card_id, ref: i.reference_month },
      })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 7)

  return (
    <Card className="space-y-3">
      <CardTitle>Próximos vencimentos</CardTitle>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nada pendente. 🎉</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const days = differenceInCalendarDays(parseISO(item.date), parseISO(today))
            const when = days < 0 ? `venceu há ${-days} dia${days === -1 ? '' : 's'}` : days === 0 ? 'vence hoje' : `em ${days} dia${days === 1 ? '' : 's'}`
            const content = (
              <>
                <span className="flex min-w-0 items-center gap-2">
                  {item.card && <CreditCard className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{item.label}</span>
                    <span className={cn('text-xs', days < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      {format(parseISO(item.date), 'dd/MM')} · {when}
                    </span>
                  </span>
                </span>
                <span className={cn('shrink-0 text-sm font-medium tabular-nums', item.inflow && 'text-income')}>
                  {item.inflow ? '+' : ''}
                  {formatCents(item.amount)}
                </span>
              </>
            )
            return (
              <li key={item.key}>
                {item.link ? (
                  <Link
                    to="/cards/$cardId"
                    params={{ cardId: item.link.cardId }}
                    search={{ ref: item.link.ref }}
                    className="flex items-center justify-between gap-3 py-2.5 hover:opacity-80"
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => item.tx && onSelect(item.tx)}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:opacity-80"
                  >
                    {content}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
