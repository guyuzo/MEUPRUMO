import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertTriangle, ChevronDown, Copy, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { PageHeader, ProgressBar } from '@/components/shared/layout'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { MonthPicker } from '@/components/shared/pickers'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { usePermission } from '@/hooks/useHousehold'
import { useBudgetMutations, useBudgets, useCategories, type CategoryWithSubs } from '@/hooks/usePlanning'
import { useTransactions } from '@/hooks/useTransactions'
import { currentMonthKey, formatMonth, isMonthKey, shiftMonth, type MonthKey } from '@/lib/dates'
import { spendingByCategory, spendingBySubcategory } from '@/lib/finance/summary'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/budget')({
  validateSearch: z.object({
    month: z.string().refine(isMonthKey).catch(currentMonthKey).default(currentMonthKey),
  }),
  component: BudgetPage,
})

type Budgets = { byCategory: Map<string, number>; bySubcategory: Map<string, number> }

/** Orçamento (planejamento) do mês: quanto se pretende gastar por categoria × quanto já foi gasto. */
function BudgetPage() {
  const { month } = Route.useSearch()
  const navigate = Route.useNavigate()
  const canEdit = usePermission('planning', 'edit')
  const canSeeSpending = usePermission('transactions', 'view')

  const categories = useCategories()
  const budgets = useBudgets(month)
  const transactions = useTransactions({ month })
  const { copyFrom } = useBudgetMutations(month)

  const rows = canSeeSpending ? (transactions.data ?? []) : []
  const byCategory = spendingByCategory(rows)
  const bySubcategory = spendingBySubcategory(rows)
  const expense = (categories.data ?? []).filter((c) => c.kind === 'expense')
  const planned = [...(budgets.data?.byCategory.values() ?? [])].reduce((s, v) => s + v, 0)
  // Gasto só das categorias que têm orçamento, para comparar com o total orçado.
  const spentBudgeted = expense.reduce((s, c) => s + (budgets.data?.byCategory.has(c.id) ? Math.max(0, byCategory.get(c.id) ?? 0) : 0), 0)
  const available = planned - spentBudgeted

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orçamento"
        subtitle="Quanto você planeja gastar em cada categoria no mês."
        actions={
          <Link to="/categories">
            <Button variant="outline">
              <Settings2 /> Gerenciar categorias
            </Button>
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker value={month} onChange={(m) => navigate({ search: { month: m }, replace: true })} />
        {canEdit && (
          <Button variant="outline" size="sm" disabled={copyFrom.isPending} onClick={() => copyFrom.mutate(shiftMonth(month, -1))}>
            <Copy /> Copiar do mês anterior
          </Button>
        )}
      </div>

      <Card className="grid gap-4 sm:grid-cols-3">
        <div>
          <CardTitle>Orçado em {formatMonth(month)}</CardTitle>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCents(planned)}</p>
        </div>
        {canSeeSpending && (
          <>
            <div>
              <CardTitle>Gasto nas categorias orçadas</CardTitle>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCents(spentBudgeted)}</p>
            </div>
            <div>
              <CardTitle>{available >= 0 ? 'Ainda disponível' : 'Acima do orçado'}</CardTitle>
              <p className={cn('mt-1 text-2xl font-semibold tabular-nums', available < 0 ? 'text-expense' : 'text-income')}>
                {formatCents(Math.abs(available))}
              </p>
            </div>
            {planned > 0 && (
              <div className="sm:col-span-3">
                <ProgressBar value={(spentBudgeted / planned) * 100} label="Uso do orçamento do mês" color={available < 0 ? 'var(--color-destructive)' : undefined} />
              </div>
            )}
          </>
        )}
      </Card>

      {categories.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {expense.map((category) => (
            <BudgetRow
              key={category.id}
              category={category}
              month={month}
              budgets={budgets.data}
              spent={canSeeSpending ? Math.max(0, byCategory.get(category.id) ?? 0) : null}
              subSpent={bySubcategory}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SpendLine({ spent, budget }: { spent: number | null; budget: number }) {
  if (spent == null) return null
  const over = budget > 0 && spent > budget
  return (
    <span className={cn('text-xs', over ? 'text-destructive' : 'text-muted-foreground')}>
      {over && <AlertTriangle className="mr-1 inline size-3" />}
      Gasto {formatCents(spent)}
      {budget > 0 && (over ? ` · ${formatCents(spent - budget)} acima` : ` · resta ${formatCents(budget - spent)}`)}
    </span>
  )
}

function BudgetRow({
  category,
  month,
  budgets,
  spent,
  subSpent,
  canEdit,
}: {
  category: CategoryWithSubs
  month: MonthKey
  budgets?: Budgets
  spent: number | null
  subSpent: Map<string, number>
  canEdit: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const { setBudget } = useBudgetMutations(month)
  const budget = budgets?.byCategory.get(category.id) ?? 0
  const hasSubs = category.subcategories.length > 0

  return (
    <Card className="p-0">
      {/* Celular: o campo de valor desce para a linha de baixo (nome e gasto ficam inteiros). */}
      <div className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
        <button
          type="button"
          disabled={!hasSubs}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={hasSubs ? expanded : undefined}
          className="flex min-w-0 flex-1 basis-full items-center gap-3 text-left sm:basis-auto"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-lg" style={{ backgroundColor: `${category.color}26` }}>
            {category.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{category.name}</span>
            <SpendLine spent={spent} budget={budget} />
          </span>
          {hasSubs && <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />}
        </button>
        <div className="w-full shrink-0 pl-[3.25rem] sm:w-36 sm:pl-0">
          <MoneyInput
            aria-label={`Orçamento de ${category.name}`}
            value={budget || null}
            disabled={!canEdit}
            onCommit={(amount) => setBudget.mutate({ target: 'category', id: category.id, amount })}
          />
        </div>
      </div>
      {budget > 0 && spent != null && (
        <div className="px-3 pb-3">
          <ProgressBar
            value={(spent / budget) * 100}
            label={`Uso do orçamento de ${category.name}`}
            color={spent > budget ? 'var(--color-destructive)' : category.color}
          />
        </div>
      )}

      {expanded && (
        <div className="space-y-2 border-t border-border px-3 py-3 sm:pl-16">
          {category.subcategories.map((sub) => {
            const subBudget = budgets?.bySubcategory.get(sub.id) ?? 0
            return (
              <div key={sub.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{sub.name}</p>
                  <SpendLine spent={spent == null ? null : Math.max(0, subSpent.get(sub.id) ?? 0)} budget={subBudget} />
                </div>
                <div className="w-32 shrink-0 sm:w-36">
                  <MoneyInput
                    aria-label={`Orçamento de ${sub.name}`}
                    className="h-9"
                    value={subBudget || null}
                    disabled={!canEdit}
                    onCommit={(amount) => setBudget.mutate({ target: 'subcategory', id: sub.id, amount })}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
