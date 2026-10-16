import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useHousehold } from '@/hooks/useHousehold'
import { supabase } from '@/lib/supabase'

// Helpers genéricos para os módulos simples (CRUD de uma tabela do household).

/** Lista todas as linhas do household numa tabela ou view. */
export function useHouseholdRows<T>(
  table: string,
  { order = 'created_at', ascending = true, enabled = true }: { order?: string; ascending?: boolean; enabled?: boolean } = {},
) {
  const householdId = useHousehold().current.household.id
  return useQuery({
    queryKey: [table, householdId],
    enabled,
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('household_id', householdId)
        .order(order, { ascending })
      if (error) throw error
      return data as T[]
    },
  })
}

/** Linhas de uma tabela filtradas por uma coluna (ex.: lançamentos de uma meta). */
export function useRowsBy<T>(table: string, column: string, value: string | undefined, order = 'created_at') {
  const householdId = useHousehold().current.household.id
  return useQuery({
    queryKey: [table, householdId, column, value],
    enabled: Boolean(value),
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq(column, value!)
        .order(order, { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as T[]
    },
  })
}

/**
 * save/remove para uma tabela. `invalidate` lista as chaves (tabelas/views) que dependem dela.
 * Toda chave de query começa com [tabela, householdId], então invalidar por prefixo cobre filtros.
 */
export function useTableMutations<Input extends Record<string, unknown>>(
  table: string,
  { invalidate = [], label = 'item' }: { invalidate?: string[]; label?: string } = {},
) {
  const queryClient = useQueryClient()
  const householdId = useHousehold().current.household.id
  const refresh = () => {
    for (const key of [table, ...invalidate]) queryClient.invalidateQueries({ queryKey: [key, householdId] })
  }

  const save = useMutation({
    mutationFn: async ({ id, ...rest }: Input & { id?: string }) => {
      const values = rest as Record<string, unknown>
      const { error } = id
        ? await supabase.from(table).update(values).eq('id', id)
        : await supabase.from(table).insert({ ...values, household_id: householdId })
      if (error) throw error
    },
    onSuccess: refresh,
    onError: () => toast.error(`Não foi possível salvar o ${label}.`),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (error: { code?: string }) =>
      toast.error(
        error.code === '23503'
          ? `O ${label} tem lançamentos vinculados e não pode ser excluído.`
          : `Não foi possível excluir o ${label}.`,
      ),
  })

  return { save, remove, refresh }
}
