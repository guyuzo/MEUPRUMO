import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useHousehold } from '@/hooks/useHousehold'
import { supabase } from '@/lib/supabase'
import type { Card, InvoiceSummary, Transaction } from '@/types/database'

export function useCards({ includeArchived = false } = {}) {
  const householdId = useHousehold().current.household.id
  return useQuery({
    queryKey: ['cards', householdId],
    queryFn: async (): Promise<Card[]> => {
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .eq('household_id', householdId)
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return data as Card[]
    },
    select: (rows) => (includeArchived ? rows : rows.filter((c) => !c.archived_at)),
  })
}

/** Todas as faturas do household (são poucas por cartão/mês). */
export function useInvoices() {
  const householdId = useHousehold().current.household.id
  return useQuery({
    queryKey: ['invoices', householdId],
    queryFn: async (): Promise<InvoiceSummary[]> => {
      const { data, error } = await supabase
        .from('invoice_summaries')
        .select('*')
        .eq('household_id', householdId)
        .order('reference_month')
      if (error) throw error
      return data as InvoiceSummary[]
    },
  })
}

/** Lançamentos de uma fatura (compras, estornos e pagamentos). */
export function useInvoiceTransactions(invoiceId: string | undefined) {
  const householdId = useHousehold().current.household.id
  return useQuery({
    queryKey: ['transactions', householdId, 'invoice', invoiceId],
    enabled: Boolean(invoiceId),
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('invoice_id', invoiceId!)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Transaction[]
    },
  })
}

export interface InstallmentPlanWithParts {
  id: string
  card_id: string
  description: string
  total_amount: number
  installments: number
  first_date: string
  created_at: string
  parts: Pick<Transaction, 'id' | 'amount' | 'installment_number' | 'invoice_id' | 'category_id' | 'household_member_id'>[]
}

/** Compras parceladas com as parcelas (a fatura de cada uma diz quando é cobrada). */
export function useInstallmentPlans() {
  const householdId = useHousehold().current.household.id
  return useQuery({
    queryKey: ['transactions', householdId, 'installment-plans'],
    queryFn: async (): Promise<InstallmentPlanWithParts[]> => {
      const { data, error } = await supabase
        .from('installment_plans')
        .select('*, parts:transactions(id, amount, installment_number, invoice_id, category_id, household_member_id)')
        .eq('household_id', householdId)
        .order('first_date', { ascending: false })
      if (error) throw error
      return data as InstallmentPlanWithParts[]
    },
  })
}

/** Limite usado = soma do que falta pagar em todas as faturas do cartão. */
export function limitUsed(cardId: string, invoices: InvoiceSummary[]) {
  return invoices
    .filter((i) => i.card_id === cardId)
    .reduce((sum, i) => sum + Math.max(0, i.total - i.paid), 0)
}

export interface CardInput {
  name: string
  bank: string | null
  last_four: string | null
  credit_limit: number | null
  closing_day: number
  due_day: number
  color: string
}

export interface CardPurchaseInput {
  card_id: string
  kind: 'card_purchase' | 'card_refund'
  description: string
  amount: number
  occurred_on: string
  installments: number
  category_id: string | null
  subcategory_id: string | null
  notes: string | null
  household_member_id: string | null
}

export function useCardMutations() {
  const queryClient = useQueryClient()
  const householdId = useHousehold().current.household.id
  const invalidateAll = () => {
    for (const key of ['cards', 'invoices', 'transactions', 'accounts']) {
      queryClient.invalidateQueries({ queryKey: [key, householdId] })
    }
  }

  const saveCard = useMutation({
    mutationFn: async ({ id, ...input }: CardInput & { id?: string }) => {
      const { error } = id
        ? await supabase.from('cards').update(input).eq('id', id)
        : await supabase.from('cards').insert({ ...input, household_id: householdId })
      if (error) throw error
    },
    onSuccess: invalidateAll,
    onError: () => toast.error('Não foi possível salvar o cartão.'),
  })

  const setArchived = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from('cards')
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidateAll,
    onError: () => toast.error('Não foi possível atualizar o cartão.'),
  })

  const deleteCard = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cards').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidateAll,
    onError: (error: { code?: string }) =>
      toast.error(error.code === '23503' ? 'O cartão tem lançamentos. Arquive-o em vez de excluir.' : 'Não foi possível excluir.'),
  })

  /** Compra à vista, estorno ou compra parcelada (via RPC atômica). */
  const savePurchase = useMutation({
    mutationFn: async ({ id, installments, ...input }: CardPurchaseInput & { id?: string }) => {
      if (!id && installments > 1 && input.kind === 'card_purchase') {
        const { data: planId, error } = await supabase.rpc('create_installment_purchase', {
          p_card_id: input.card_id,
          p_description: input.description,
          p_total_amount: input.amount,
          p_installments: installments,
          p_first_date: input.occurred_on,
          p_category_id: input.category_id,
          p_subcategory_id: input.subcategory_id,
          p_notes: input.notes,
        })
        if (error) throw error
        if (input.household_member_id) {
          const { error: memberError } = await supabase
            .from('transactions')
            .update({ household_member_id: input.household_member_id })
            .eq('installment_plan_id', planId)
          if (memberError) throw memberError
        }
        return
      }
      const values = { ...input, status: 'paid' as const }
      const { error } = id
        ? await supabase.from('transactions').update(values).eq('id', id)
        : await supabase.from('transactions').insert({ ...values, household_id: householdId })
      if (error) throw error
    },
    onSuccess: (_, input) => {
      invalidateAll()
      toast.success(input.id ? 'Lançamento atualizado.' : 'Lançamento criado.')
    },
    onError: () => toast.error('Não foi possível salvar o lançamento.'),
  })

  const deletePlan = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase.from('installment_plans').delete().eq('id', planId)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateAll()
      toast.success('Parcelamento excluído.')
    },
    onError: () => toast.error('Não foi possível excluir o parcelamento.'),
  })

  const payInvoice = useMutation({
    mutationFn: async (input: {
      invoice: InvoiceSummary
      cardName: string
      bank_account_id: string
      amount: number
      paid_on: string
      label: string
    }) => {
      const { error } = await supabase.from('transactions').insert({
        household_id: householdId,
        kind: 'invoice_payment',
        status: 'paid',
        amount: input.amount,
        description: `Fatura ${input.cardName} — ${input.label}`,
        occurred_on: input.paid_on,
        paid_on: input.paid_on,
        bank_account_id: input.bank_account_id,
        invoice_id: input.invoice.invoice_id,
        card_id: input.invoice.card_id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidateAll()
      toast.success('Pagamento registrado.')
    },
    onError: () => toast.error('Não foi possível registrar o pagamento.'),
  })

  return { saveCard, setArchived, deleteCard, savePurchase, deletePlan, payInvoice }
}

export const todayIso = () => format(new Date(), 'yyyy-MM-dd')
