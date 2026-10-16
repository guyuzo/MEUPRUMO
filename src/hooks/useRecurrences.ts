import { useMutation, useQueryClient } from '@tanstack/react-query'
import { endOfMonth, format, subDays } from 'date-fns'
import { toast } from 'sonner'
import { useHousehold } from '@/hooks/useHousehold'
import { useHouseholdRows } from '@/hooks/useTable'
import { currentMonthKey, shiftMonth } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import type { Recurrence } from '@/types/database'

/** Ocorrências são geradas até o fim do 6º mês à frente (horizonte do fluxo de caixa). */
export const MATERIALIZE_MONTHS_AHEAD = 6

export function materializeHorizon(): string {
  return format(endOfMonth(new Date(`${shiftMonth(currentMonthKey(), MATERIALIZE_MONTHS_AHEAD)}T00:00`)), 'yyyy-MM-dd')
}

const today = () => format(new Date(), 'yyyy-MM-dd')
const yesterday = () => format(subDays(new Date(), 1), 'yyyy-MM-dd')

export async function materialize(householdId: string): Promise<number> {
  const { data, error } = await supabase.rpc('materialize_recurrences', { hh: householdId, until: materializeHorizon() })
  if (error) throw error
  return data as number
}

/** Remove as ocorrências pendentes de hoje em diante (para regerar ou ao pausar/excluir). */
async function dropFuturePending(recurrenceId: string) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('recurrence_id', recurrenceId)
    .eq('status', 'pending')
    .gte('occurred_on', today())
  if (error) throw error
}

export function useRecurrences() {
  return useHouseholdRows<Recurrence>('recurrences', { order: 'description' })
}

export type RecurrenceInput = Omit<Recurrence, 'id' | 'household_id' | 'created_at' | 'materialized_until' | 'active'>

export function useRecurrenceMutations() {
  const queryClient = useQueryClient()
  const householdId = useHousehold().current.household.id
  const refresh = () => {
    for (const key of ['recurrences', 'transactions', 'accounts', 'invoices']) {
      queryClient.invalidateQueries({ queryKey: [key, householdId] })
    }
  }

  /**
   * Criar: gera as ocorrências. Editar: as pendentes futuras são refeitas com os novos
   * valores (as passadas e as já pagas ficam como estão).
   */
  const save = useMutation({
    mutationFn: async ({ id, ...input }: RecurrenceInput & { id?: string }) => {
      if (id) {
        await dropFuturePending(id)
        const { error } = await supabase
          .from('recurrences')
          .update({ ...input, materialized_until: yesterday() })
          .eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('recurrences').insert({ ...input, household_id: householdId })
        if (error) throw error
      }
      await materialize(householdId)
    },
    onSuccess: (_, input) => {
      refresh()
      toast.success(input.id ? 'Recorrência atualizada.' : 'Recorrência criada.')
    },
    onError: () => toast.error('Não foi possível salvar a recorrência.'),
  })

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      if (!active) await dropFuturePending(id)
      const { error } = await supabase
        .from('recurrences')
        .update(active ? { active, materialized_until: yesterday() } : { active })
        .eq('id', id)
      if (error) throw error
      if (active) await materialize(householdId)
    },
    onSuccess: refresh,
    onError: () => toast.error('Não foi possível atualizar a recorrência.'),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await dropFuturePending(id)
      const { error } = await supabase.from('recurrences').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      refresh()
      toast.success('Recorrência excluída.')
    },
    onError: () => toast.error('Não foi possível excluir.'),
  })

  return { save, setActive, remove }
}
