import { createFileRoute, Link } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import { CreditCard, Layers, Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CategoryIcon } from '@/components/planning/CategoryIcon'
import { RecurrenceFormDialog } from '@/components/recurrences/RecurrenceFormDialog'
import { EmptyState, ListSkeleton, PageHeader } from '@/components/shared/layout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useAccounts } from '@/hooks/useAccounts'
import { todayIso, useCards } from '@/hooks/useCards'
import { usePermission } from '@/hooks/useHousehold'
import { useInstallmentViews, type PlanView } from '@/hooks/useInstallmentViews'
import { useCategories } from '@/hooks/usePlanning'
import { useRecurrenceMutations, useRecurrences } from '@/hooks/useRecurrences'
import { formatMonth } from '@/lib/dates'
import { describeFrequency, monthlyEquivalent, nextOccurrence } from '@/lib/finance/recurrence'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Recurrence } from '@/types/database'

export const Route = createFileRoute('/_authenticated/recurrences')({ component: RecurrencesPage })

type GroupKey = 'fixed' | 'installments' | 'income'

// Gastos recorrentes (inclusive os de valor variável e as assinaturas no cartão) ficam em "fixos";
// "parcelamentos" vem das compras parceladas no cartão, não da tabela de recorrências.
const groupOf = (r: Recurrence): GroupKey => (r.kind === 'income' ? 'income' : 'fixed')

const GROUPS: { key: GroupKey; tab: string; title: string; hint: string }[] = [
  { key: 'fixed', tab: 'Fixos', title: 'Gastos fixos', hint: 'Contas que se repetem: aluguel, escola, luz, assinaturas.' },
  { key: 'installments', tab: 'Parcelamentos', title: 'Parcelamentos', hint: 'Compras parceladas no cartão que ainda têm parcelas.' },
  { key: 'income', tab: 'Ganhos', title: 'Ganhos', hint: 'Salários e outras entradas que se repetem.' },
]

function RecurrencesPage() {
  const canEdit = usePermission('transactions', 'edit')
  const recurrences = useRecurrences()
  const accounts = useAccounts({ includeArchived: true }).data ?? []
  const cards = useCards({ includeArchived: true }).data ?? []
  const categories = useCategories().data ?? []
  const { setActive, remove } = useRecurrenceMutations()
  const [form, setForm] = useState<{ open: boolean; recurrence?: Recurrence }>({ open: false })
  const [toDelete, setToDelete] = useState<Recurrence | null>(null)
  const today = todayIso()

  const [filter, setFilter] = useState<GroupKey | 'all'>('all')

  const all = recurrences.data ?? []
  const active = all.filter((r) => r.active)
  const monthly = (key: GroupKey) => active.filter((r) => groupOf(r) === key).reduce((s, r) => s + monthlyEquivalent(r), 0)
  const installments = useInstallmentViews()
  const monthlyIncome = monthly('income')
  const monthlyFixed = monthly('fixed')
  const monthlyInstallments = installments.monthly
  const leftover = monthlyIncome - monthlyFixed - monthlyInstallments
  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  const cardName = new Map(cards.map((c) => [c.id, c.name]))
  const category = new Map(categories.map((c) => [c.id, c]))
  const groups = GROUPS.filter((g) => filter === 'all' || g.key === filter)
    .map((g) =>
      g.key === 'installments'
        ? { ...g, count: installments.active.length, total: monthlyInstallments }
        : { ...g, count: all.filter((r) => groupOf(r) === g.key).length, total: monthly(g.key) },
    )
    .filter((g) => g.count > 0 || filter !== 'all')

  const installmentRow = (v: PlanView) => {
    const cat = v.plan.parts[0]?.category_id ? category.get(v.plan.parts[0].category_id) : undefined
    return (
      <Link key={v.plan.id} to="/installments" className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
        {cat ? (
          <CategoryIcon icon={cat.emoji} color={cat.color} />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Layers className="size-4" strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{v.plan.description}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[
              v.card?.name,
              `${v.charged}/${v.plan.installments} pagas`,
              v.endMonth && `termina em ${formatMonth(v.endMonth)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-expense">
          −{formatCents(v.installmentAmount)}
          <span className="block text-xs font-normal text-muted-foreground">faltam {v.remaining}x</span>
        </span>
      </Link>
    )
  }

  const row = (r: Recurrence) => {
    const next = r.active ? nextOccurrence(r, today) : null
    const cat = r.category_id ? category.get(r.category_id) : undefined
    const where = r.card_id ? cardName.get(r.card_id) : r.bank_account_id ? accountName.get(r.bank_account_id) : null
    return (
      <div key={r.id} className={cn('flex items-center gap-3 px-4 py-3', !r.active && 'opacity-60')}>
        {cat ? (
          <CategoryIcon icon={cat.emoji} color={cat.color} />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {r.card_id ? <CreditCard className="size-4" strokeWidth={1.75} /> : <Repeat className="size-4" strokeWidth={1.75} />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{r.description}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[
              describeFrequency(r.frequency, r.interval_count),
              r.kind === 'expense_variable' && 'valor varia',
              r.card_id ? `cartão ${where ?? ''}`.trim() : where,
              !r.active ? 'pausada' : next ? `próxima ${format(parseISO(next), 'dd/MM/yy')}` : 'encerrada',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <span className={cn('shrink-0 text-sm font-semibold tabular-nums', r.kind === 'income' ? 'text-income' : 'text-expense')}>
          {r.kind === 'income' ? '+' : '−'}
          {formatCents(r.amount)}
        </span>
        {canEdit && (
          <div className="flex shrink-0">
            <Button
              variant="ghost"
              size="icon"
              aria-label={r.active ? 'Pausar' : 'Retomar'}
              title={r.active ? 'Pausar' : 'Retomar'}
              onClick={() => setActive.mutate({ id: r.id, active: !r.active })}
            >
              {r.active ? <Pause /> : <Play />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setForm({ open: true, recurrence: r })}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setToDelete(r)}>
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recorrências"
        subtitle="Contas e ganhos que se repetem. Geramos os lançamentos pendentes até 6 meses à frente."
        actions={
          canEdit && (
            <Button onClick={() => setForm({ open: true })}>
              <Plus /> Nova recorrência
            </Button>
          )
        }
      />

      {active.length > 0 && (
        <Card className="grid gap-2 p-4 sm:grid-cols-4 sm:gap-4">
          {(
            [
              ['Ganhos por mês', monthlyIncome, 'text-income'],
              ['Gastos fixos por mês', monthlyFixed, 'text-expense'],
              ['Parcelas neste mês', monthlyInstallments, 'text-expense'],
              ['Sobra recorrente', leftover, leftover >= 0 ? 'text-income' : 'text-expense'],
            ] as const
          ).map(([label, value, color]) => (
            <div key={label} className="flex items-baseline justify-between gap-2 sm:block">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn('font-semibold tabular-nums sm:mt-1', color)}>{formatCents(value)}</p>
            </div>
          ))}
        </Card>
      )}

      {(all.length > 0 || installments.active.length > 0) && (
        <div className="inline-flex flex-wrap rounded-md border border-border bg-card p-1" role="tablist" aria-label="Tipo de recorrência">
          {([['all', 'Todas'], ...GROUPS.map((g) => [g.key, g.tab])] as [GroupKey | 'all', string][]).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                'min-h-9 rounded px-4 py-1.5 text-sm',
                filter === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {recurrences.isPending ? (
        <ListSkeleton className="h-16" />
      ) : all.length === 0 && installments.active.length === 0 ? (
        <EmptyState
          icon={Repeat}
          text="Cadastre aluguel, salário, assinaturas e outras contas fixas para vê-las no fluxo de caixa."
          action={
            canEdit && (
              <Button variant="outline" onClick={() => setForm({ open: true })}>
                <Plus /> Adicionar recorrência
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{g.title}</h2>
                  <p className="text-xs text-muted-foreground">{g.hint}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  <span className={cn('font-semibold tabular-nums', g.key === 'income' ? 'text-income' : 'text-expense')}>
                    {g.key === 'income' ? '+' : '−'}
                    {formatCents(g.total)}
                  </span>{' '}
                  {g.key === 'installments' ? 'neste mês' : 'por mês'} · {g.count} {g.count === 1 ? 'item' : 'itens'}
                </p>
              </div>
              {g.count > 0 ? (
                <Card className="divide-y divide-border p-0">
                  {g.key === 'installments'
                    ? installments.active.map(installmentRow)
                    : all.filter((r) => groupOf(r) === g.key).map(row)}
                </Card>
              ) : (
                <Card className="py-6 text-center text-sm text-muted-foreground">Nada aqui ainda.</Card>
              )}
            </section>
          ))}
        </div>
      )}

      <RecurrenceFormDialog open={form.open} recurrence={form.recurrence} onClose={() => setForm({ open: false })} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        pending={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id, { onSettled: () => setToDelete(null) })}
        title={`Excluir "${toDelete?.description}"?`}
        description="Os lançamentos pendentes de hoje em diante serão removidos. Os já pagos continuam no histórico."
      />
    </div>
  )
}
