import { useQuery } from '@tanstack/react-query'
import { useHousehold } from '@/hooks/useHousehold'
import type { MonthKey } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import type { Transaction } from '@/types/database'

/**
 * Transações do intervalo [start, end) pela data ou pelo pagamento (compra em 31/10 paga em 02/11
 * conta em novembro), mais todas as pendentes (podem vencer dentro dele).
 */
export function useCashFlowTransactions(start: MonthKey, end: MonthKey) {
  const householdId = useHousehold().current.household.id
  return useQuery({
    queryKey: ['transactions', householdId, 'cashflow', start, end],
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('household_id', householdId)
        .or(`and(occurred_on.gte.${start},occurred_on.lt.${end}),and(paid_on.gte.${start},paid_on.lt.${end}),status.eq.pending`)
      if (error) throw error
      return data as Transaction[]
    },
  })
}
