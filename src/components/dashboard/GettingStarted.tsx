import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CheckCircle2, Circle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAccounts } from '@/hooks/useAccounts'
import { useCards } from '@/hooks/useCards'
import { householdQuery, useHousehold } from '@/hooks/useHousehold'
import { useBudgets } from '@/hooks/usePlanning'
import { useRecurrences } from '@/hooks/useRecurrences'
import { currentMonthKey } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/** Checklist de primeiros passos para o dono de uma casa nova. Some ao dispensar. */
export function GettingStarted() {
  const { current } = useHousehold()
  const householdId = current.household.id
  const queryClient = useQueryClient()
  const accounts = useAccounts().data ?? []
  const cards = useCards().data ?? []
  const recurrences = useRecurrences().data ?? []
  const budgets = useBudgets(currentMonthKey()).data
  const hasTransaction = useQuery({
    queryKey: ['transactions', householdId, 'any'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', householdId)
      if (error) throw error
      return (count ?? 0) > 0
    },
  }).data

  const dismiss = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('households').update({ onboarding_completed: true }).eq('id', householdId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdQuery.queryKey }),
  })

  const steps = [
    { done: accounts.length > 0, label: 'Cadastre sua conta bancária com o saldo atual', to: '/accounts' },
    { done: cards.length > 0, label: 'Adicione seus cartões de crédito', to: '/cards', optional: true },
    { done: recurrences.length > 0, label: 'Cadastre contas fixas e salário (recorrências)', to: '/recurrences' },
    { done: Boolean(hasTransaction), label: 'Lance seus primeiros gastos', to: '/transactions' },
    { done: (budgets?.byCategory.size ?? 0) > 0, label: 'Defina quanto quer gastar por categoria', to: '/categories' },
    { done: false, label: 'Convide quem divide as contas com você', to: '/members', optional: true },
  ]
  const required = steps.filter((s) => !s.optional)
  const doneCount = required.filter((s) => s.done).length

  return (
    <Card className="space-y-3 border-primary/30 bg-primary/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Primeiros passos</h2>
          <p className="text-sm text-muted-foreground">
            {doneCount} de {required.length} concluídos
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Dispensar primeiros passos" onClick={() => dismiss.mutate()}>
          <X />
        </Button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(doneCount / required.length) * 100}%` }} />
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.to}>
            <Link
              to={s.to as never}
              className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-card', s.done && 'text-muted-foreground line-through')}
            >
              {s.done ? <CheckCircle2 className="size-4 shrink-0 text-primary" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}
              {s.label}
              {s.optional && !s.done && <span className="text-xs text-muted-foreground">(opcional)</span>}
            </Link>
          </li>
        ))}
      </ul>
      {doneCount === required.length && (
        <Button size="sm" onClick={() => dismiss.mutate()}>
          Tudo pronto!
        </Button>
      )}
    </Card>
  )
}
