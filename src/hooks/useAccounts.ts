import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useHousehold } from '@/hooks/useHousehold'
import { supabase } from '@/lib/supabase'
import type { AccountBalance, AccountType, BankAccount } from '@/types/database'

export type AccountWithBalance = BankAccount & Omit<AccountBalance, 'account_id' | 'household_id'>

export function useAccounts({ includeArchived = false } = {}) {
  const householdId = useHousehold().current.household.id
  return useQuery({
    queryKey: ['accounts', householdId],
    queryFn: async (): Promise<AccountWithBalance[]> => {
      const [accounts, balances] = await Promise.all([
        supabase.from('bank_accounts').select('*').eq('household_id', householdId).order('sort_order').order('created_at'),
        supabase.from('account_balances').select('*').eq('household_id', householdId),
      ])
      if (accounts.error) throw accounts.error
      if (balances.error) throw balances.error
      const byId = new Map((balances.data as AccountBalance[]).map((b) => [b.account_id, b]))
      return (accounts.data as BankAccount[]).map((a) => ({
        ...a,
        balance: byId.get(a.id)?.balance ?? a.initial_balance,
        projected_balance: byId.get(a.id)?.projected_balance ?? a.initial_balance,
        pending_total: byId.get(a.id)?.pending_total ?? 0,
      }))
    },
    select: (rows) => (includeArchived ? rows : rows.filter((a) => !a.archived_at)),
  })
}

export interface AccountInput {
  name: string
  bank: string | null
  branch: string | null
  account_number: string | null
  type: AccountType
  color: string
  initial_balance: number
  initial_balance_date: string
}

export function useAccountMutations() {
  const queryClient = useQueryClient()
  const householdId = useHousehold().current.household.id
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['accounts', householdId] })

  const saveAccount = useMutation({
    mutationFn: async ({ id, ...input }: AccountInput & { id?: string }) => {
      const { error } = id
        ? await supabase.from('bank_accounts').update(input).eq('id', id)
        : await supabase.from('bank_accounts').insert({ ...input, household_id: householdId })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: () => toast.error('Não foi possível salvar a conta.'),
  })

  const setArchived = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from('bank_accounts')
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: () => toast.error('Não foi possível atualizar a conta.'),
  })

  const deleteAccount = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bank_accounts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (error: { code?: string }) =>
      toast.error(
        error.code === '23503'
          ? 'A conta tem transações. Arquive-a em vez de excluir.'
          : 'Não foi possível excluir a conta.',
      ),
  })

  return { saveAccount, setArchived, deleteAccount }
}
