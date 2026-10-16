import { createFileRoute } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import { CreditCard, Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { RecurrenceFormDialog } from '@/components/recurrences/RecurrenceFormDialog'
import { EmptyState, ListSkeleton, PageHeader } from '@/components/shared/layout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useAccounts } from '@/hooks/useAccounts'
import { todayIso, useCards } from '@/hooks/useCards'
import { usePermission } from '@/hooks/useHousehold'
import { useCategories } from '@/hooks/usePlanning'
import { useRecurrenceMutations, useRecurrences } from '@/hooks/useRecurrences'
import { describeFrequency, monthlyEquivalent, nextOccurrence } from '@/lib/finance/recurrence'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Recurrence } from '@/types/database'

export const Route = createFileRoute('/_authenticated/recurrences')({ component: RecurrencesPage })

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

  const all = recurrences.data ?? []
  const active = all.filter((r) => r.active)
  const monthlyIncome = active.filter((r) => r.kind === 'income').reduce((s, r) => s + monthlyEquivalent(r), 0)
  const monthlyExpense = active.filter((r) => r.kind !== 'income').reduce((s, r) => s + monthlyEquivalent(r), 0)
  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  const cardName = new Map(cards.map((c) => [c.id, c.name]))
  const category = new Map(categories.map((c) => [c.id, c]))

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
        <Card className="grid gap-2 p-4 sm:grid-cols-3 sm:gap-4">
          {(
            [
              ['Ganhos por mês', monthlyIncome, 'text-income'],
              ['Gastos por mês', monthlyExpense, 'text-expense'],
              ['Sobra recorrente', monthlyIncome - monthlyExpense, monthlyIncome >= monthlyExpense ? 'text-income' : 'text-expense'],
            ] as const
          ).map(([label, value, color]) => (
            <div key={label} className="flex items-baseline justify-between gap-2 sm:block">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn('font-semibold tabular-nums sm:mt-1', color)}>{formatCents(value)}</p>
            </div>
          ))}
        </Card>
      )}

      {recurrences.isPending ? (
        <ListSkeleton className="h-16" />
      ) : all.length === 0 ? (
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
        <Card className="divide-y divide-border p-0">
          {all.map((r) => {
            const next = r.active ? nextOccurrence(r, today) : null
            const cat = r.category_id ? category.get(r.category_id) : undefined
            const where = r.card_id ? cardName.get(r.card_id) : r.bank_account_id ? accountName.get(r.bank_account_id) : null
            return (
              <div key={r.id} className={cn('flex items-center gap-3 px-4 py-3', !r.active && 'opacity-60')}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-base">
                  {cat?.emoji ?? (r.card_id ? <CreditCard className="size-4" /> : <Repeat className="size-4" />)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.description}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      describeFrequency(r.frequency, r.interval_count),
                      where,
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
          })}
        </Card>
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
