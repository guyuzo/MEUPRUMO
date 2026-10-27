import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useHousehold } from '@/hooks/useHousehold'
import type { MonthKey } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import type { PaymentMethod, Transaction, TxDirection, TxKind, TxStatus } from '@/types/database'

export interface TransactionFilters {
  month: MonthKey
  accountId?: string
  categoryId?: string
  status?: TxStatus
  direction?: TxDirection
  search?: string
  /** expenses = tudo menos ganhos (saídas, cartão, transferências); income = só ganhos. */
  scope?: 'expenses' | 'income'
  /** Pessoa da casa; 'none' = sem pessoa (gastos da casa). */
  memberId?: string
}

export function useTransactions(filters: TransactionFilters) {
  const householdId = useHousehold().current.household.id
  return useQuery({
    queryKey: ['transactions', householdId, filters],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Transaction[]> => {
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('household_id', householdId)
        // Mês de competência: compra no cartão aparece no mês da fatura em que será paga.
        .eq('competence_month', filters.month)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })

      if (filters.accountId) {
        query = query.or(`bank_account_id.eq.${filters.accountId},destination_account_id.eq.${filters.accountId}`)
      }
      if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
      if (filters.status) query = query.eq('status', filters.status)
      if (filters.direction) query = query.eq('direction', filters.direction)
      if (filters.scope === 'income') query = query.eq('kind', 'income')
      if (filters.scope === 'expenses') query = query.neq('kind', 'income')
      if (filters.memberId === 'none') query = query.is('household_member_id', null)
      else if (filters.memberId) query = query.eq('household_member_id', filters.memberId)
      if (filters.search?.trim()) {
        // Remove caracteres com significado no filtro do PostgREST.
        const term = filters.search.trim().replace(/[%,()*]/g, ' ')
        query = query.ilike('description', `%${term}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data as Transaction[]
    },
  })
}

/** Todas as transações pendentes (contas a pagar e a receber), por vencimento. */
export function usePendingTransactions() {
  const householdId = useHousehold().current.household.id
  return useQuery({
    queryKey: ['transactions', householdId, 'pending'],
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('household_id', householdId)
        .eq('status', 'pending')
        .order('due_on', { ascending: true, nullsFirst: false })
        .limit(50)
      if (error) throw error
      return data as Transaction[]
    },
  })
}

export interface TransactionInput {
  kind: TxKind
  description: string
  amount: number
  occurred_on: string
  status: TxStatus
  due_on: string | null
  notes: string | null
  category_id: string | null
  subcategory_id: string | null
  bank_account_id: string | null
  destination_account_id: string | null
  household_member_id: string | null
  payment_method?: PaymentMethod | null
  card_id?: string | null
  /** Fatura escolhida manualmente; null = automática. Só para compra no cartão. */
  invoice_month?: string | null
  /** > 1 cria um parcelamento (só compra no cartão, só na criação). */
  installments?: number
}

type QuickField = 'description' | 'category_id' | 'subcategory_id' | 'card_id' | 'bank_account_id' | 'household_member_id'

type SplitInput ={ member_id: string; percentage: number }[] | null

async function applySplits(transactionIds: string[], splits: SplitInput) {
  for (const id of transactionIds) {
    const { error } = await supabase.rpc('set_transaction_splits', { p_transaction_id: id, p_splits: splits ?? [] })
    if (error) throw error
  }
}

export function useTransactionMutations() {
  const queryClient = useQueryClient()
  const householdId = useHousehold().current.household.id
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
    queryClient.invalidateQueries({ queryKey: ['accounts', householdId] })
    queryClient.invalidateQueries({ queryKey: ['invoices', householdId] })
    queryClient.invalidateQueries({ queryKey: ['transaction_splits', householdId] })
  }

  /** `splits`: undefined = não mexe; null/[] = remove a divisão; lista = substitui. */
  const saveTransaction = useMutation({
    mutationFn: async ({ id, splits, installments = 1, ...input }: TransactionInput & { id?: string; splits?: SplitInput }) => {
      const onCard = input.kind === 'card_purchase' || input.kind === 'card_refund'

      // Compra parcelada: a RPC cria o plano e as parcelas (cada uma na sua fatura).
      if (!id && input.kind === 'card_purchase' && installments > 1) {
        const { data: planId, error } = await supabase.rpc('create_installment_purchase', {
          p_card_id: input.card_id,
          p_description: input.description,
          p_total_amount: input.amount,
          p_installments: installments,
          p_first_date: input.occurred_on,
          p_category_id: input.category_id,
          p_subcategory_id: input.subcategory_id,
          p_notes: input.notes,
          p_first_invoice: input.invoice_month ?? null,
          p_member_id: input.household_member_id,
        })
        if (error) throw error
        if (splits) {
          const { data: parcels, error: parcelsError } = await supabase.from('transactions').select('id').eq('installment_plan_id', planId)
          if (parcelsError) throw parcelsError
          await applySplits(parcels.map((p) => p.id), splits)
        }
        return
      }

      const values = {
        ...input,
        paid_on: input.status === 'paid' ? input.occurred_on : null,
        // Ao trocar de cartão para outra forma, solta a fatura (o trigger só preenche em compras).
        ...(onCard ? {} : { card_id: null, invoice_id: null, invoice_month: null }),
      }
      const { data, error } = id
        ? await supabase.from('transactions').update(values).eq('id', id).select('id').single()
        : await supabase.from('transactions').insert({ ...values, household_id: householdId }).select('id').single()
      if (error) throw error
      if (splits !== undefined) await applySplits([data.id], splits)
    },
    onSuccess: (_, input) => {
      invalidate()
      toast.success(input.id ? 'Transação atualizada.' : 'Transação criada.')
    },
    onError: () => toast.error('Não foi possível salvar a transação.'),
  })

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Transação excluída.')
    },
    onError: () => toast.error('Não foi possível excluir.'),
  })

  const togglePaid = useMutation({
    mutationFn: async (tx: Pick<Transaction, 'id' | 'status'>) => {
      const paid = tx.status !== 'paid'
      const { error } = await supabase
        .from('transactions')
        .update({ status: paid ? 'paid' : 'pending', paid_on: paid ? format(new Date(), 'yyyy-MM-dd') : null })
        .eq('id', tx.id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: () => toast.error('Não foi possível atualizar o status.'),
  })

  /** Edição rápida de um campo direto na lista (nome, categoria, cartão/conta, pessoa). */
  const updateFields = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Transaction, QuickField>> }) => {
      const { error } = await supabase.from('transactions').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: () => toast.error('Não foi possível salvar a alteração.'),
  })

  /** Mesma alteração em vários lançamentos de uma vez (seleção na lista). */
  const updateMany = useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: Partial<Pick<Transaction, QuickField>> }) => {
      if (ids.length === 0) return
      const { error } = await supabase.from('transactions').update(patch).in('id', ids)
      if (error) throw error
    },
    onSuccess: (_, { ids }) => {
      invalidate()
      toast.success(`${ids.length} lançamento${ids.length === 1 ? '' : 's'} atualizado${ids.length === 1 ? '' : 's'}.`)
    },
    onError: () => toast.error('Não foi possível alterar os lançamentos selecionados.'),
  })

  const deleteMany = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('transactions').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: (_, ids) => {
      invalidate()
      toast.success(`${ids.length} lançamento${ids.length === 1 ? '' : 's'} excluído${ids.length === 1 ? '' : 's'}.`)
    },
    onError: () => toast.error('Não foi possível excluir os lançamentos selecionados.'),
  })

  return { saveTransaction, deleteTransaction, togglePaid, updateFields, updateMany, deleteMany }
}
