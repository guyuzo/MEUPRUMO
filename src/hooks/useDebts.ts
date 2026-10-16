import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useHousehold } from '@/hooks/useHousehold'
import { useHouseholdRows, useRowsBy, useTableMutations } from '@/hooks/useTable'
import { supabase } from '@/lib/supabase'
import type { Debt, DebtSummary, Transaction } from '@/types/database'

export type DebtWithSummary = Debt & DebtSummary & { remaining: number; progress: number }

/** Saldo restante: por parcelas quando há parcelamento, senão valor original − pago. */
export function debtRemaining(debt: Debt, summary?: Pick<DebtSummary, 'paid_amount' | 'installments_paid'>) {
  const paid = summary?.paid_amount ?? 0
  const installmentsPaid = summary?.installments_paid ?? 0
  if (debt.paid_off_at) return { remaining: 0, progress: 100 }
  if (debt.total_installments && debt.installment_amount) {
    const left = Math.max(0, debt.total_installments - installmentsPaid)
    return { remaining: left * debt.installment_amount, progress: (installmentsPaid / debt.total_installments) * 100 }
  }
  return {
    remaining: Math.max(0, debt.original_amount - paid),
    progress: Math.min(100, (paid / debt.original_amount) * 100),
  }
}

export function useDebts() {
  const debts = useHouseholdRows<Debt>('debts', { order: 'created_at' })
  const summaries = useHouseholdRows<DebtSummary & { household_id: string }>('debt_summaries', { order: 'debt_id' })
  const byId = new Map((summaries.data ?? []).map((s) => [s.debt_id, s]))
  const data: DebtWithSummary[] | undefined = debts.data?.map((d) => {
    const s = byId.get(d.id)
    return {
      ...d,
      debt_id: d.id,
      paid_amount: s?.paid_amount ?? 0,
      installments_paid: s?.installments_paid ?? 0,
      last_payment_on: s?.last_payment_on ?? null,
      ...debtRemaining(d, s),
    }
  })
  return { data, isPending: debts.isPending || summaries.isPending, isSuccess: debts.isSuccess }
}

export function useDebtPayments(debtId: string | undefined) {
  return useRowsBy<Transaction>('transactions', 'debt_id', debtId, 'occurred_on')
}

export type DebtInput = Omit<Debt, 'id' | 'household_id' | 'created_at' | 'paid_off_at'>

export function useDebtMutations() {
  const queryClient = useQueryClient()
  const householdId = useHousehold().current.household.id
  const table = useTableMutations<DebtInput & { paid_off_at?: string | null }>('debts', {
    invalidate: ['debt_summaries'],
    label: 'dívida',
  })

  const pay = useMutation({
    mutationFn: async (input: { debt: Debt; amount: number; date: string; accountId: string; installments: number; note: string }) => {
      const { error } = await supabase.from('transactions').insert({
        household_id: householdId,
        kind: 'debt_payment',
        status: 'paid',
        amount: input.amount,
        description: `Pagamento ${input.debt.name}`,
        notes: input.note || null,
        occurred_on: input.date,
        paid_on: input.date,
        bank_account_id: input.accountId,
        debt_id: input.debt.id,
        debt_installments: input.installments,
      })
      if (error) throw error
    },
    onSuccess: () => {
      for (const key of ['debt_summaries', 'transactions', 'accounts']) {
        queryClient.invalidateQueries({ queryKey: [key, householdId] })
      }
      toast.success('Pagamento registrado.')
    },
    onError: () => toast.error('Não foi possível registrar o pagamento.'),
  })

  return { ...table, pay }
}
