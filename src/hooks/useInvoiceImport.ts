import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useHousehold } from '@/hooks/useHousehold'
import { normalizeDescription } from '@/lib/import/statement'
import { supabase } from '@/lib/supabase'

export interface ImportBatch {
  id: string
  card_id: string
  reference_month: string
  file_name: string
  rows_count: number
  total: number
  created_at: string
}

/**
 * Sugestão de categoria pelo histórico: a última categoria usada para a mesma descrição
 * (normalizada, sem número de parcela).
 */
export function useCategorySuggestions(enabled: boolean) {
  const householdId = useHousehold().current.household.id
  return useQuery({
    queryKey: ['transactions', householdId, 'category-suggestions'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('description, category_id, subcategory_id')
        .eq('household_id', householdId)
        .not('category_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) throw error
      const map = new Map<string, { category_id: string; subcategory_id: string | null }>()
      for (const row of data) {
        const key = normalizeDescription(row.description)
        if (key && !map.has(key)) map.set(key, { category_id: row.category_id!, subcategory_id: row.subcategory_id })
      }
      return map
    },
  })
}

/** Lançamentos já existentes no cartão no período do arquivo, para marcar duplicados. */
export async function fetchExistingKeys(cardId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from('transactions')
    .select('occurred_on, amount, description, external_id, kind')
    .eq('card_id', cardId)
    .gte('occurred_on', from)
    .lte('occurred_on', to)
  if (error) throw error
  return {
    keys: new Set(data.map((t) => duplicateKey(t.occurred_on, t.kind === 'card_refund' ? -t.amount : t.amount, t.description))),
    externalIds: new Set(data.map((t) => t.external_id).filter(Boolean) as string[]),
  }
}

export function duplicateKey(date: string, amount: number, description: string) {
  return `${date}|${amount}|${normalizeDescription(description)}`
}

export interface ImportRow {
  kind: 'card_purchase' | 'card_refund'
  occurred_on: string
  description: string
  amount: number
  external_id: string
  category_id: string | null
  subcategory_id: string | null
  household_member_id: string | null
}

export function useImportBatches(cardId: string | undefined) {
  const householdId = useHousehold().current.household.id
  return useQuery({
    queryKey: ['import_batches', householdId, cardId],
    enabled: Boolean(cardId),
    queryFn: async (): Promise<ImportBatch[]> => {
      const { data, error } = await supabase
        .from('import_batches')
        .select('id, card_id, reference_month, file_name, rows_count, total, created_at')
        .eq('card_id', cardId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ImportBatch[]
    },
  })
}

export function useInvoiceImportMutations() {
  const queryClient = useQueryClient()
  const householdId = useHousehold().current.household.id
  const refresh = () => {
    for (const key of ['transactions', 'invoices', 'import_batches', 'cards']) {
      queryClient.invalidateQueries({ queryKey: [key, householdId] })
    }
  }

  const importStatement = useMutation({
    mutationFn: async (input: { cardId: string; referenceMonth: string; fileName: string; rows: ImportRow[] }) => {
      const { data, error } = await supabase.rpc('import_card_statement', {
        p_card_id: input.cardId,
        p_reference_month: input.referenceMonth,
        p_file_name: input.fileName,
        p_rows: input.rows,
      })
      if (error) throw error
      return data as { batch_id: string | null; inserted: number; skipped: number; total: number }
    },
    onSuccess: (result) => {
      refresh()
      toast.success(
        result.inserted === 0
          ? 'Nada novo: esses lançamentos já tinham sido importados.'
          : `${result.inserted} lançamento${result.inserted === 1 ? '' : 's'} importado${result.inserted === 1 ? '' : 's'}${result.skipped ? ` (${result.skipped} já existia${result.skipped === 1 ? '' : 'm'})` : ''}.`,
      )
    },
    onError: () => toast.error('Não foi possível importar a fatura.'),
  })

  const undoBatch = useMutation({
    mutationFn: async (batchId: string) => {
      const { error } = await supabase.from('import_batches').delete().eq('id', batchId)
      if (error) throw error
    },
    onSuccess: () => {
      refresh()
      toast.success('Importação desfeita.')
    },
    onError: () => toast.error('Não foi possível desfazer.'),
  })

  return { importStatement, undoBatch }
}
