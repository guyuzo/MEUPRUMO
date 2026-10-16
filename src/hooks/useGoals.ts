import { useHouseholdRows, useRowsBy, useTableMutations } from '@/hooks/useTable'
import type { Goal, GoalEntry } from '@/types/database'

export type GoalWithProgress = Goal & { saved: number; progress: number }

export function useGoals() {
  const goals = useHouseholdRows<Goal>('goals', { order: 'created_at' })
  const summaries = useHouseholdRows<{ goal_id: string; saved_amount: number }>('goal_summaries', { order: 'goal_id' })
  const saved = new Map((summaries.data ?? []).map((s) => [s.goal_id, s.saved_amount]))
  const data: GoalWithProgress[] | undefined = goals.data?.map((g) => {
    const value = saved.get(g.id) ?? 0
    return { ...g, saved: value, progress: Math.min(100, (Math.max(0, value) / g.target_amount) * 100) }
  })
  return { data, isPending: goals.isPending || summaries.isPending, isSuccess: goals.isSuccess }
}

export function useGoalEntries(goalId: string | undefined) {
  return useRowsBy<GoalEntry>('goal_entries', 'goal_id', goalId, 'occurred_on')
}

export type GoalInput = Pick<Goal, 'name' | 'emoji' | 'color' | 'target_amount' | 'target_date'> &
  Partial<Pick<Goal, 'achieved_at' | 'archived_at'>>

export function useGoalMutations() {
  const goals = useTableMutations<GoalInput>('goals', { invalidate: ['goal_summaries'], label: 'meta' })
  const entries = useTableMutations<{ goal_id: string; amount: number; occurred_on: string; note: string | null }>('goal_entries', {
    invalidate: ['goal_summaries'],
    label: 'lançamento',
  })
  return { saveGoal: goals.save, removeGoal: goals.remove, addEntry: entries.save, removeEntry: entries.remove }
}

/** Quanto guardar por mês para chegar na meta até a data alvo (null sem data ou já atingida). */
export function monthlyToReach(goal: GoalWithProgress, today: Date): number | null {
  if (!goal.target_date || goal.saved >= goal.target_amount) return null
  const target = new Date(`${goal.target_date}T00:00`)
  const months = (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth())
  return Math.ceil((goal.target_amount - goal.saved) / Math.max(1, months))
}
