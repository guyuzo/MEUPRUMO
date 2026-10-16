import { createFileRoute, Link } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import { Goal as GoalIcon, Plus } from 'lucide-react'
import { useState } from 'react'
import { GoalFormDialog } from '@/components/goals/GoalFormDialog'
import { EmptyState, ListSkeleton, PageHeader, ProgressBar } from '@/components/shared/layout'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { monthlyToReach, useGoals } from '@/hooks/useGoals'
import { usePermission } from '@/hooks/useHousehold'
import { formatCents } from '@/lib/money'

export const Route = createFileRoute('/_authenticated/goals/')({ component: GoalsPage })

function GoalsPage() {
  const canEdit = usePermission('goals', 'edit')
  const goals = useGoals()
  const [formOpen, setFormOpen] = useState(false)
  const [now] = useState(() => new Date())

  const all = (goals.data ?? []).filter((g) => !g.archived_at)
  const totalSaved = all.reduce((s, g) => s + g.saved, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metas"
        subtitle="Separe dinheiro para seus objetivos. O valor guardado continua nas suas contas."
        actions={
          canEdit && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus /> Nova meta
            </Button>
          )
        }
      />

      {all.length > 0 && (
        <Card>
          <CardTitle>Total guardado em metas</CardTitle>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCents(totalSaved)}</p>
        </Card>
      )}

      {goals.isPending ? (
        <ListSkeleton />
      ) : all.length === 0 ? (
        <EmptyState
          icon={GoalIcon}
          text="Crie metas como viagem, reserva de emergência ou um carro novo e acompanhe quanto já juntou."
          action={
            canEdit && (
              <Button variant="outline" onClick={() => setFormOpen(true)}>
                <Plus /> Criar meta
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {all.map((g) => {
            const perMonth = monthlyToReach(g, now)
            const reached = g.saved >= g.target_amount
            return (
              <Link key={g.id} to="/goals/$goalId" params={{ goalId: g.id }} className="block">
                <Card className="space-y-3 transition-colors hover:bg-muted/40">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full text-lg" style={{ backgroundColor: `${g.color}22` }}>
                      {g.emoji}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {reached ? 'Meta atingida! 🎉' : g.target_date ? `até ${format(parseISO(g.target_date), 'MM/yyyy')}` : 'sem prazo'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xl font-semibold tabular-nums">{formatCents(g.saved)}</p>
                    <p className="text-xs text-muted-foreground">de {formatCents(g.target_amount)}</p>
                  </div>
                  <ProgressBar value={g.progress} color={g.color} label={`Progresso de ${g.name}`} />
                  {perMonth != null && (
                    <p className="text-xs text-muted-foreground">Guarde {formatCents(perMonth)}/mês para chegar no prazo</p>
                  )}
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      <GoalFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}
