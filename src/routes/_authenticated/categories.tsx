import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, ChevronDown, PiggyBank, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { CategoryFormDialog } from '@/components/planning/CategoryFormDialog'
import { PageHeader } from '@/components/shared/layout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { usePermission } from '@/hooks/useHousehold'
import { useCategories, useCategoryMutations, type CategoryWithSubs } from '@/hooks/usePlanning'
import { cn } from '@/lib/utils'
import type { CategoryKind, Subcategory } from '@/types/database'

export const Route = createFileRoute('/_authenticated/categories')({
  validateSearch: z.object({ tab: z.enum(['expense', 'income']).catch('expense').default('expense') }),
  component: CategoriesPage,
})

/** Organização das categorias e subcategorias (os valores ficam em Orçamento). */
function CategoriesPage() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  const canEdit = usePermission('planning', 'edit')
  const categories = useCategories()
  const [form, setForm] = useState<{ open: boolean; category?: CategoryWithSubs }>({ open: false })

  const list = (categories.data ?? []).filter((c) => c.kind === tab)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorias"
        subtitle="Organize categorias e subcategorias usadas nos lançamentos e no orçamento."
        actions={
          <>
            <Link to="/budget">
              <Button variant="outline">
                <PiggyBank /> Orçamento
              </Button>
            </Link>
            {canEdit && (
              <Button onClick={() => setForm({ open: true })}>
                <Plus /> Nova categoria
              </Button>
            )}
          </>
        }
      />

      <div className="inline-flex rounded-md border border-border bg-card p-1" role="tablist" aria-label="Tipo de categoria">
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
            onClick={() => navigate({ search: { tab: value as CategoryKind }, replace: true })}
            className={cn(
              'rounded px-4 py-1.5 text-sm',
              tab === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

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
          {list.map((category, index) => (
            <CategoryRow
              key={category.id}
              category={category}
              prev={list[index - 1]}
              next={list[index + 1]}
              canEdit={canEdit}
              onEdit={() => setForm({ open: true, category })}
            />
          ))}
        </div>
      )}

      <CategoryFormDialog
        open={form.open}
        onClose={() => setForm({ open: false })}
        kind={tab}
        category={form.category}
        nextSortOrder={list.length ? Math.max(...list.map((c) => c.sort_order)) + 1 : 0}
      />
    </div>
  )
}

function MoveButtons({ onUp, onDown, label }: { onUp?: () => void; onDown?: () => void; label: string }) {
  return (
    <div className="flex shrink-0">
      <Button variant="ghost" size="icon" disabled={!onUp} onClick={onUp} aria-label={`Subir ${label}`}>
        <ArrowUp />
      </Button>
      <Button variant="ghost" size="icon" disabled={!onDown} onClick={onDown} aria-label={`Descer ${label}`}>
        <ArrowDown />
      </Button>
    </div>
  )
}

function CategoryRow({
  category,
  prev,
  next,
  canEdit,
  onEdit,
}: {
  category: CategoryWithSubs
  prev?: CategoryWithSubs
  next?: CategoryWithSubs
  canEdit: boolean
  onEdit: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newSub, setNewSub] = useState('')
  const { deleteCategory, saveSubcategory, swapOrder } = useCategoryMutations()
  const subs = category.subcategories
  const swapWith = (other: CategoryWithSubs) => swapOrder.mutate({ table: 'categories', a: category, b: other })

  const addSub = async () => {
    const name = newSub.trim()
    if (!name) return
    await saveSubcategory.mutateAsync({
      category_id: category.id,
      name,
      sort_order: subs.length ? Math.max(...subs.map((s) => s.sort_order)) + 1 : 0,
    })
    setNewSub('')
  }

  return (
    <Card className="p-0">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-lg" style={{ backgroundColor: `${category.color}26` }}>
            {category.emoji}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{category.name}</span>
            <span className="text-xs text-muted-foreground">
              {subs.length} subcategoria{subs.length === 1 ? '' : 's'}
            </span>
          </span>
          <ChevronDown className={cn('ml-auto size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        </button>
        {canEdit && (
          <>
            <MoveButtons label={category.name} onUp={prev ? () => swapWith(prev) : undefined} onDown={next ? () => swapWith(next) : undefined} />
            <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Editar ${category.name}`}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label={`Excluir ${category.name}`}>
              <Trash2 />
            </Button>
          </>
        )}
      </div>

      {expanded && (
        <div className="space-y-1 border-t border-border px-3 py-2 sm:pl-16">
          {subs.map((sub, index) => (
            <SubcategoryRow key={sub.id} sub={sub} prev={subs[index - 1]} next={subs[index + 1]} canEdit={canEdit} />
          ))}
          {subs.length === 0 && !canEdit && <p className="py-2 text-sm text-muted-foreground">Sem subcategorias.</p>}
          {canEdit && (
            <form
              className="flex gap-2 py-1"
              onSubmit={(e) => {
                e.preventDefault()
                addSub()
              }}
            >
              <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Nova subcategoria" maxLength={60} className="h-9" />
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
        description="As subcategorias e os orçamentos dela também serão excluídos. Os lançamentos ficam sem categoria."
      />
    </Card>
  )
}

function SubcategoryRow({ sub, prev, next, canEdit }: { sub: Subcategory; prev?: Subcategory; next?: Subcategory; canEdit: boolean }) {
  const [name, setName] = useState(sub.name)
  const { saveSubcategory, deleteSubcategory, swapOrder } = useCategoryMutations()
  const swapWith = (other: Subcategory) => swapOrder.mutate({ table: 'subcategories', a: sub, b: other })

  const rename = () => {
    const trimmed = name.trim()
    if (!trimmed) return setName(sub.name)
    if (trimmed !== sub.name) saveSubcategory.mutate({ id: sub.id, category_id: sub.category_id, name: trimmed })
  }

  return (
    <div className="flex items-center gap-1">
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
      {canEdit && (
        <>
          <MoveButtons label={sub.name} onUp={prev ? () => swapWith(prev) : undefined} onDown={next ? () => swapWith(next) : undefined} />
          <Button variant="ghost" size="icon" onClick={() => deleteSubcategory.mutate(sub.id)} aria-label={`Excluir ${sub.name}`} className="shrink-0">
            <Trash2 />
          </Button>
        </>
      )}
    </div>
  )
}
