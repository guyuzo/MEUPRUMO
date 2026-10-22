import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeftRight, CheckCircle2, Circle, Tag } from 'lucide-react'
import { CategoryIcon } from '@/components/planning/CategoryIcon'
import { Card } from '@/components/ui/card'
import { useAccounts } from '@/hooks/useAccounts'
import { useCards } from '@/hooks/useCards'
import { useMembers } from '@/hooks/useFamily'
import { usePermission } from '@/hooks/useHousehold'
import { useCategories } from '@/hooks/usePlanning'
import { useTransactionMutations } from '@/hooks/useTransactions'
import { PAYMENT_METHOD_LABEL, TX_KIND_LABEL } from '@/lib/finance/labels'
import type { Totals } from '@/lib/finance/totals'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types/database'

export function TotalsBar({ totals }: { totals: Totals }) {
  return (
    // No celular vira um cartão com três linhas (valores grandes não cabem em 3 colunas).
    <Card className="grid gap-2 p-4 sm:grid-cols-3 sm:gap-4">
      {(
        [
          ['Entradas', totals.inflow, 'text-income'],
          ['Saídas', totals.outflow, 'text-expense'],
          ['Resultado', totals.net, totals.net < 0 ? 'text-expense' : 'text-income'],
        ] as const
      ).map(([label, value, color]) => (
        <div key={label} className="flex items-baseline justify-between gap-2 sm:block">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn('font-semibold tabular-nums sm:mt-1', color)}>{formatCents(value)}</p>
        </div>
      ))}
    </Card>
  )
}

/** Lista agrupada por dia. `accountId` define o sinal das transferências na visão de uma conta. */
export function TransactionList({
  transactions,
  loading,
  accountId,
  onSelect,
}: {
  transactions: Transaction[]
  loading?: boolean
  accountId?: string
  onSelect: (tx: Transaction) => void
}) {
  const accounts = useAccounts({ includeArchived: true }).data ?? []
  const cards = useCards({ includeArchived: true }).data ?? []
  const members = useMembers().data ?? []
  const categories = useCategories().data ?? []
  const canEdit = usePermission('transactions', 'edit')
  const { togglePaid } = useTransactionMutations()

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (transactions.length === 0) {
    return <Card className="py-12 text-center text-sm text-muted-foreground">Nenhuma transação neste período.</Card>
  }

  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  const cardName = new Map(cards.map((c) => [c.id, c.name]))
  const memberName = new Map(members.map((m) => [m.id, m.full_name.split(' ')[0]]))
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const subName = new Map(categories.flatMap((c) => c.subcategories.map((s) => [s.id, s.name] as const)))

  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const list = groups.get(tx.occurred_on) ?? []
    list.push(tx)
    groups.set(tx.occurred_on, list)
  }

  return (
    <div className="space-y-4">
      {[...groups].map(([day, rows]) => (
        <section key={day}>
          <h3 className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {format(parseISO(day), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </h3>
          <Card className="divide-y divide-border p-0">
            {rows.map((tx) => {
              const category = tx.category_id ? categoryById.get(tx.category_id) : undefined
              const isTransfer = tx.direction === 'transfer'
              const sign =
                tx.direction === 'inflow' || (isTransfer && accountId && tx.destination_account_id === accountId)
                  ? 1
                  : tx.direction === 'outflow' || (isTransfer && accountId)
                    ? -1
                    : 0
              const subtitle = isTransfer
                ? `${accountName.get(tx.bank_account_id ?? '') ?? '?'} → ${accountName.get(tx.destination_account_id ?? '') ?? '?'}`
                : [
                    category ? category.name : TX_KIND_LABEL[tx.kind],
                    tx.subcategory_id && subName.get(tx.subcategory_id),
                    tx.bank_account_id && accountName.get(tx.bank_account_id),
                    tx.card_id && `💳 ${cardName.get(tx.card_id) ?? 'Cartão'}`,
                    !tx.card_id && tx.payment_method && PAYMENT_METHOD_LABEL[tx.payment_method],
                    tx.household_member_id && memberName.get(tx.household_member_id),
                  ]
                    .filter(Boolean)
                    .join(' · ')

              return (
                <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onSelect(tx)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {isTransfer || !category ? (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        {isTransfer ? <ArrowLeftRight className="size-4" strokeWidth={1.75} /> : <Tag className="size-4" strokeWidth={1.75} />}
                      </span>
                    ) : (
                      <CategoryIcon icon={category.emoji} color={category.color} />
                    )}
                    <span className="min-w-0 flex-1">
                      {/* Celular: até 2 linhas (a coluna é estreita); desktop: 1 linha. */}
                      <span className="line-clamp-2 break-words text-sm font-medium sm:line-clamp-1">{tx.description}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {subtitle}
                        {tx.status === 'pending' && tx.due_on && ` · vence ${format(parseISO(tx.due_on), 'dd/MM')}`}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-sm font-semibold tabular-nums',
                        sign > 0 && 'text-income',
                        sign < 0 && 'text-expense',
                        tx.status === 'pending' && 'opacity-60',
                      )}
                    >
                      {sign < 0 ? '−' : sign > 0 ? '+' : ''}
                      {formatCents(tx.amount)}
                    </span>
                  </button>
                  {tx.card_id && tx.kind !== 'invoice_payment' ? (
                    // Compras no cartão não têm status próprio; quem se paga é a fatura.
                    <span className="size-7 shrink-0" />
                  ) : (
                  <button
                    type="button"
                    disabled={!canEdit || togglePaid.isPending}
                    onClick={() => togglePaid.mutate(tx)}
                    aria-label={tx.status === 'paid' ? 'Marcar como pendente' : 'Marcar como pago'}
                    title={tx.status === 'paid' ? 'Pago' : 'Pendente'}
                    className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground disabled:pointer-events-none"
                  >
                    {tx.status === 'paid' ? <CheckCircle2 className="size-5 text-income" /> : <Circle className="size-5" />}
                  </button>
                  )}
                </div>
              )
            })}
          </Card>
        </section>
      ))}
    </div>
  )
}
