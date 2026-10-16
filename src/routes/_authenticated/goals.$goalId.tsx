import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import { Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { GoalFormDialog } from '@/components/goals/GoalFormDialog'
import { BackLink, PageHeader, ProgressBar } from '@/components/shared/layout'
import { MovementDialog } from '@/components/shared/MovementDialog'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { monthlyToReach, useGoalEntries, useGoalMutations, useGoals } from '@/hooks/useGoals'
import { usePermission } from '@/hooks/useHousehold'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/goals/$goalId')({ component: GoalDetailPage })

function GoalDetailPage() {
  const { goalId } = Route.useParams()
  const navigate = useNavigate()
  const canEdit = usePermission('goals', 'edit')
  const goals = useGoals()
  const goal = goals.data?.find((g) => g.id === goalId)
  const entries = useGoalEntries(goalId)
  const { removeGoal, addEntry, removeEntry } = useGoalMutations()
  const [editOpen, setEditOpen] = useState(false)
  const [movement, setMovement] = useState<'in' | 'out' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [now] = useState(() => new Date())

  if (goals.isSuccess && !goal) {
    return (
      <div className="space-y-4">
        <BackLink to="/goals" label="Metas" />
        <Card className="py-12 text-center text-sm text-muted-foreground">Meta não encontrada.</Card>
      </div>
    )
  }
  if (!goal) return null

  const perMonth = monthlyToReach(goal, now)
  const missing = Math.max(0, goal.target_amount - goal.saved)

  return (
    <div className="space-y-5">
      <BackLink to="/goals" label="Metas" />
      <PageHeader
        title={`${goal.emoji} ${goal.name}`}
        subtitle={goal.target_date ? `Prazo: ${format(parseISO(goal.target_date), 'dd/MM/yyyy')}` : 'Sem prazo'}
        actions={
          canEdit && (
            <>
              <Button onClick={() => setMovement('in')}>
                <Plus /> Guardar
              </Button>
              <Button variant="outline" onClick={() => setMovement('out')} disabled={goal.saved <= 0}>
                <Minus /> Retirar
              </Button>
              <Button variant="outline" size="icon" aria-label="Editar" onClick={() => setEditOpen(true)}>
                <Pencil />
              </Button>
              <Button variant="outline" size="icon" aria-label="Excluir" onClick={() => setConfirmDelete(true)}>
                <Trash2 />
              </Button>
            </>
          )
        }
      />

      <Card className="space-y-4">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <CardTitle>Guardado</CardTitle>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{formatCents(goal.saved)}</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-muted-foreground">Objetivo</p>
            <p className="font-medium tabular-nums">{formatCents(goal.target_amount)}</p>
          </div>
        </div>
        <ProgressBar value={goal.progress} color={goal.color} label="Progresso da meta" />
        <p className="text-sm text-muted-foreground">
          {missing === 0
            ? 'Meta atingida! 🎉'
            : `Faltam ${formatCents(missing)} (${Math.round(goal.progress)}% concluído)${perMonth != null ? ` · guarde ${formatCents(perMonth)}/mês` : ''}`}
        </p>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Histórico</h2>
        <Card className="divide-y divide-border p-0">
          {(entries.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nada guardado ainda.</p>
          ) : (
            entries.data!.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{e.amount > 0 ? 'Guardado' : 'Retirado'}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[format(parseISO(e.occurred_on), 'dd/MM/yyyy'), e.note].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className={cn('text-sm font-semibold tabular-nums', e.amount > 0 ? 'text-income' : 'text-expense')}>
                  {e.amount > 0 ? '+' : '−'}
                  {formatCents(Math.abs(e.amount))}
                </span>
                {canEdit && (
                  <Button variant="ghost" size="icon" aria-label="Excluir lançamento" onClick={() => removeEntry.mutate(e.id)}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))
          )}
        </Card>
      </section>

      <GoalFormDialog open={editOpen} goal={goal} onClose={() => setEditOpen(false)} />
      {movement && (
        <MovementDialog
          title={movement === 'in' ? 'Guardar na meta' : 'Retirar da meta'}
          description={goal.name}
          submitLabel={movement === 'in' ? 'Guardar' : 'Retirar'}
          defaultAmount={movement === 'in' ? perMonth : null}
          maxAmount={movement === 'out' ? goal.saved : undefined}
          needsAccount={false}
          onClose={() => setMovement(null)}
          onSubmit={(m) =>
            addEntry.mutateAsync({
              goal_id: goal.id,
              amount: movement === 'in' ? m.amount : -m.amount,
              occurred_on: m.date,
              note: m.note || null,
            })
          }
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        pending={removeGoal.isPending}
        onConfirm={() => removeGoal.mutate(goal.id, { onSuccess: () => navigate({ to: '/goals' }), onSettled: () => setConfirmDelete(false) })}
        title={`Excluir "${goal.name}"?`}
        description="O histórico da meta também será excluído. Suas contas não são afetadas."
      />
    </div>
  )
}
