import { createFileRoute } from '@tanstack/react-router'
import { ChevronDown, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { CategoryFormDialog } from '@/components/planning/CategoryFormDialog'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { MonthPicker } from '@/components/shared/pickers'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { usePermission } from '@/hooks/useHousehold'
import {
  useBudgetMutations,
  useBudgets,
  useCategories,
  useCategoryMutations,
  type CategoryWithSubs,
} from '@/hooks/usePlanning'
import { currentMonthKey, formatMonth, isMonthKey, shiftMonth, type MonthKey } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { CategoryKind, Subcategory } from '@/types/database'

const searchSchema = z.object({
  month: z.string().refine(isMonthKey).catch(currentMonthKey).default(currentMonthKey),
  tab: z.enum(['expense', 'income']).catch('expense').default('expense'),
})

export const Route = createFileRoute('/_authenticated/categories')({
  validateSearch: searchSchema,
  component: PlanningPage,
})

type Budgets = { byCategory: Map<string, number>; bySubcategory: Map<string, number> }

function PlanningPage() {
  const { month, tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  const canEdit = usePermission('planning', 'edit')
  const canViewBudgets = usePermission('planning', 'view')
  const showBudgets = tab === 'expense' && canViewBudgets

  const categories = useCategories()
  const budgets = useBudgets(month, showBudgets)
  const { copyFrom } = useBudgetMutations(month)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryWithSubs | undefined>()

  const list = (categories.data ?? []).filter((c) => c.kind === tab)
  const totalBudget = [...(budgets.data?.byCategory.values() ?? [])].reduce((sum, v) => sum + v, 0)

  const setSearch = (patch: Partial<{ month: MonthKey; tab: CategoryKind }>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Planejamento</h1>
        {canEdit && (
          <Button
            onClick={() => {
              setEditing(undefined)
              setFormOpen(true)
            }}
          >
            <Plus /> Nova categoria
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-border bg-card p-1" role="tablist">
          {(
            [
              ['expense', 'Despesas'],
              ['income', 'Receitas'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setSearch({ tab: value })}
              className={cn(
                'rounded px-4 py-1.5 text-sm',
                tab === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {showBudgets && <MonthPicker value={month} onChange={(m) => setSearch({ month: m })} />}
      </div>

      {showBudgets && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              Orçamento total de {formatMonth(month)}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCents(totalBudget)}</p>
          </div>
          {canEdit && (
            <Button variant="outline" size="sm" disabled={copyFrom.isPending} onClick={() => copyFrom.mutate(shiftMonth(month, -1))}>
              <Copy /> Copiar do mês anterior
            </Button>
          )}
        </Card>
      )}

      {categories.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">Nenhuma categoria ainda.</Card>
      ) : (
        <div className="space-y-2">
          {list.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              month={month}
              budgets={showBudgets ? budgets.data : undefined}
              canEdit={canEdit}
              onEdit={() => {
                setEditing(category)
                setFormOpen(true)
              }}
            />
          ))}
        </div>
      )}

      <CategoryFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        kind={tab}
        category={editing}
        nextSortOrder={list.length ? Math.max(...list.map((c) => c.sort_order)) + 1 : 0}
      />
    </div>
  )
}

function CategoryRow({
  category,
  month,
  budgets,
  canEdit,
  onEdit,
}: {
  category: CategoryWithSubs
  month: MonthKey
  budgets?: Budgets
  canEdit: boolean
  onEdit: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newSub, setNewSub] = useState('')
  const { deleteCategory, saveSubcategory } = useCategoryMutations()
  const { setBudget } = useBudgetMutations(month)

  const subTotal = category.subcategories.reduce((sum, s) => sum + (budgets?.bySubcategory.get(s.id) ?? 0), 0)

  const addSub = async () => {
    const name = newSub.trim()
    if (!name) return
    await saveSubcategory.mutateAsync({
      category_id: category.id,
      name,
      sort_order: category.subcategories.length,
    })
    setNewSub('')
  }

  return (
    <Card className="p-0">
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-lg"
            style={{ backgroundColor: `${category.color}22` }}
          >
            {category.emoji}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{category.name}</span>
            <span className="text-xs text-muted-foreground">
              {category.subcategories.length} subcategoria{category.subcategories.length === 1 ? '' : 's'}
              {subTotal > 0 && ` · subs somam ${formatCents(subTotal)}`}
            </span>
          </span>
          <ChevronDown className={cn('ml-auto size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        </button>
        {budgets && (
          <div className="w-36 shrink-0">
            <MoneyInput
              aria-label={`Orçamento de ${category.name}`}
              placeholder="0,00"
              value={budgets.byCategory.get(category.id) ?? null}
              disabled={!canEdit}
              onCommit={(amount) => setBudget.mutate({ target: 'category', id: category.id, amount })}
            />
          </div>
        )}
        {canEdit && (
          <div className="flex shrink-0">
            <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Editar ${category.name}`}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label={`Excluir ${category.name}`}>
              <Trash2 />
            </Button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="space-y-1 border-t border-border px-3 py-2 sm:pl-16">
          {category.subcategories.map((sub) => (
            <SubcategoryRow key={sub.id} sub={sub} month={month} budgets={budgets} canEdit={canEdit} />
          ))}
          {category.subcategories.length === 0 && !canEdit && (
            <p className="py-2 text-sm text-muted-foreground">Sem subcategorias.</p>
          )}
          {canEdit && (
            <form
              className="flex gap-2 py-1"
              onSubmit={(e) => {
                e.preventDefault()
                addSub()
              }}
            >
              <Input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                placeholder="Nova subcategoria"
                maxLength={60}
                className="h-9"
              />
              <Button type="submit" size="sm" variant="outline" disabled={!newSub.trim() || saveSubcategory.isPending}>
                <Plus /> Adicionar
              </Button>
            </form>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteCategory.mutate(category.id, { onSuccess: () => setConfirmDelete(false) })}
        pending={deleteCategory.isPending}
        title={`Excluir "${category.name}"?`}
        description="As subcategorias e os orçamentos dela também serão excluídos."
      />
    </Card>
  )
}

function SubcategoryRow({
  sub,
  month,
  budgets,
  canEdit,
}: {
  sub: Subcategory
  month: MonthKey
  budgets?: Budgets
  canEdit: boolean
}) {
  const [name, setName] = useState(sub.name)
  const { saveSubcategory, deleteSubcategory } = useCategoryMutations()
  const { setBudget } = useBudgetMutations(month)

  const rename = () => {
    const trimmed = name.trim()
    if (!trimmed) return setName(sub.name)
    if (trimmed !== sub.name) saveSubcategory.mutate({ id: sub.id, category_id: sub.category_id, name: trimmed })
  }

  return (
    <div className="flex items-center gap-2">
      {canEdit ? (
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          maxLength={60}
          aria-label="Nome da subcategoria"
          className="h-9 flex-1 border-transparent bg-transparent hover:border-input focus:border-input"
        />
      ) : (
        <span className="flex-1 py-2 text-sm">{sub.name}</span>
      )}
      {budgets && (
        <div className="w-36 shrink-0">
          <MoneyInput
            aria-label={`Orçamento de ${sub.name}`}
            placeholder="0,00"
            className="h-9"
            value={budgets.bySubcategory.get(sub.id) ?? null}
            disabled={!canEdit}
            onCommit={(amount) => setBudget.mutate({ target: 'subcategory', id: sub.id, amount })}
          />
        </div>
      )}
      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => deleteSubcategory.mutate(sub.id)}
          aria-label={`Excluir ${sub.name}`}
          className="shrink-0"
        >
          <Trash2 />
        </Button>
      )}
    </div>
  )
}
