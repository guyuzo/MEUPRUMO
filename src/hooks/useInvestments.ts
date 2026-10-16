import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useHousehold } from '@/hooks/useHousehold'
import { useHouseholdRows, useRowsBy, useTableMutations } from '@/hooks/useTable'
import { supabase } from '@/lib/supabase'
import type { Investment, InvestmentSummary, InvestmentValuation, Transaction } from '@/types/database'

export type InvestmentWithSummary = Investment &
  InvestmentSummary & {
    /** Líquido aportado (aportes − resgates). */
    invested: number
    /** Ganho = valor atual − líquido aportado. */
    gain: number
  }

export function useInvestments() {
  const investments = useHouseholdRows<Investment>('investments', { order: 'created_at' })
  const summaries = useHouseholdRows<InvestmentSummary & { household_id: string }>('investment_summaries', { order: 'investment_id' })
  const byId = new Map((summaries.data ?? []).map((s) => [s.investment_id, s]))
  const data: InvestmentWithSummary[] | undefined = investments.data?.map((i) => {
    const s = byId.get(i.id)
    const contributed = s?.contributed ?? 0
    const withdrawn = s?.withdrawn ?? 0
    const current = s?.current_value ?? 0
    const invested = contributed - withdrawn
    return {
      ...i,
      investment_id: i.id,
      contributed,
      withdrawn,
      last_valuation: s?.last_valuation ?? null,
      last_valued_on: s?.last_valued_on ?? null,
      current_value: current,
      invested,
      gain: current - invested,
    }
  })
  return { data, isPending: investments.isPending || summaries.isPending, isSuccess: investments.isSuccess }
}

export function useInvestmentFlows(investmentId: string | undefined) {
  return useRowsBy<Transaction>('transactions', 'investment_id', investmentId, 'occurred_on')
}

export function useInvestmentValuations(investmentId: string | undefined) {
  return useRowsBy<InvestmentValuation>('investment_valuations', 'investment_id', investmentId, 'valued_on')
}

export type InvestmentInput = Pick<Investment, 'name' | 'type' | 'institution' | 'color'> & Partial<Pick<Investment, 'archived_at'>>

export function useInvestmentMutations() {
  const queryClient = useQueryClient()
  const householdId = useHousehold().current.household.id
  const table = useTableMutations<InvestmentInput>('investments', { invalidate: ['investment_summaries'], label: 'investimento' })
  const valuations = useTableMutations<{ investment_id: string; value: number; valued_on: string }>('investment_valuations', {
    invalidate: ['investment_summaries'],
    label: 'valor',
  })

  const refresh = () => {
    for (const key of ['investment_summaries', 'transactions', 'accounts']) {
      queryClient.invalidateQueries({ queryKey: [key, householdId] })
    }
  }

  /** Aporte (sai da conta) ou resgate (volta para a conta). */
  const move = useMutation({
    mutationFn: async (input: {
      investment: Investment
      direction: 'in' | 'out'
      amount: number
      date: string
      accountId: string
      note: string
    }) => {
      const { error } = await supabase.from('transactions').insert({
        household_id: householdId,
        kind: input.direction === 'in' ? 'investment_contribution' : 'investment_withdrawal',
        status: 'paid',
        amount: input.amount,
        description: `${input.direction === 'in' ? 'Aporte' : 'Resgate'} ${input.investment.name}`,
        notes: input.note || null,
        occurred_on: input.date,
        paid_on: input.date,
        bank_account_id: input.accountId,
        investment_id: input.investment.id,
      })
      if (error) throw error
    },
    onSuccess: (_, input) => {
      refresh()
      toast.success(input.direction === 'in' ? 'Aporte registrado.' : 'Resgate registrado.')
    },
    onError: () => toast.error('Não foi possível registrar.'),
  })

  return { save: table.save, remove: table.remove, addValuation: valuations.save, removeValuation: valuations.remove, move }
}
