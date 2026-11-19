import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { useHousehold } from '@/hooks/useHousehold'
import { parseInstallment } from '@/lib/finance/installments'
import { buildParcelIndex } from '@/lib/import/parcels'
import { SIMILAR_WINDOW_DAYS } from '@/lib/import/similar'
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

/** Prefixo do external_id das parcelas futuras criadas a partir de uma fatura importada. */
export const PROJECTED_PREFIX = 'proj:'

export const isProjected = (externalId: string | null | undefined) => Boolean(externalId?.startsWith(PROJECTED_PREFIX))

const shiftDay = (date: string, days: number) => format(addDays(parseISO(date), days), 'yyyy-MM-dd')

const TX_FIELDS =
  'id, occurred_on, amount, description, external_id, kind, installment_plan_id, category_id, subcategory_id, household_member_id, invoice_month'

/**
 * O que já está no cartão para comparar com o arquivo da fatura `reference`:
 * - lançamentos do período do arquivo (com folga de dias): duplicados e "mesmo valor";
 * - parcelas previstas desta fatura em diante (a data delas não serve: cada banco data as parcelas de um jeito).
 */
export async function fetchExistingKeys(cardId: string, from: string, to: string, reference: string) {
  const [periodRes, projectedRes] = await Promise.all([
    supabase
      .from('transactions')
      .select(TX_FIELDS)
      .eq('card_id', cardId)
      .in('kind', ['card_purchase', 'card_refund'])
      .gte('occurred_on', shiftDay(from, -SIMILAR_WINDOW_DAYS))
      .lte('occurred_on', shiftDay(to, SIMILAR_WINDOW_DAYS)),
    supabase
      .from('transactions')
      .select(TX_FIELDS)
      .eq('card_id', cardId)
      .like('external_id', `${PROJECTED_PREFIX}%`)
      .gte('invoice_month', reference),
  ])
  if (periodRes.error) throw periodRes.error
  if (projectedRes.error) throw projectedRes.error
  const period = periodRes.data.filter((t) => !isProjected(t.external_id))
  const projected = projectedRes.data

  const toRow = (t: (typeof projected)[number]) => ({
    id: t.id,
    date: t.occurred_on,
    description: t.description,
    amount: t.kind === 'card_refund' ? -t.amount : t.amount,
    inPlan: Boolean(t.installment_plan_id),
    projected: isProjected(t.external_id),
    category_id: t.category_id as string | null,
    subcategory_id: t.subcategory_id as string | null,
    household_member_id: t.household_member_id as string | null,
  })
  // Candidatos a "mesmo valor": os do período e as previstas desta fatura.
  const rows = [...period, ...projected.filter((t) => t.invoice_month === reference)].map(toRow)
  // Parcelas já no app: as previstas são trocadas pela real; as reais são duplicadas.
  const parcels = buildParcelIndex(
    [...period, ...projected]
      .filter((t) => t.kind === 'card_purchase')
      .map((t) => ({ id: t.id, description: t.description, amount: t.amount, projected: isProjected(t.external_id), invoiceMonth: t.invoice_month })),
  )
  return {
    keys: new Set(period.map((t) => duplicateKey(t.occurred_on, t.kind === 'card_refund' ? -t.amount : t.amount, t.description))),
    externalIds: new Set(period.map((t) => t.external_id).filter(Boolean) as string[]),
    parcels,
    rows,
  }
}

export type ExistingKeys = Awaited<ReturnType<typeof fetchExistingKeys>>

/**
 * Chave para achar lançamento repetido. Inclui o número da parcela: na fatura, a parcela 3/10 vem
 * com a mesma data de compra e o mesmo valor da 2/10 do mês anterior, e não é duplicada.
 */
export function duplicateKey(date: string, amount: number, description: string) {
  const parcel = parseInstallment(description)
  return `${date}|${amount}|${normalizeDescription(description)}|${parcel ? `${parcel.current}/${parcel.total}` : ''}`
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
  /** Fatura em que entra (parcelas futuras); sem isso, a fatura que está sendo importada. */
  invoice_month?: string
  /** Lançamento que esta linha substitui: parcela prevista ou gasto lançado à mão que a pessoa disse ser o mesmo. */
  replaces?: string
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
      return data as { batch_id: string | null; inserted: number; skipped: number; total: number; projected?: number }
    },
    onSuccess: (result) => {
      refresh()
      const projected = result.projected
        ? ` ${result.projected} parcela${result.projected === 1 ? '' : 's'} futura${result.projected === 1 ? '' : 's'} lançada${result.projected === 1 ? '' : 's'} nas próximas faturas.`
        : ''
      toast.success(
        result.inserted === 0
          ? `Nada novo: esses lançamentos já tinham sido importados.${projected}`
          : `${result.inserted} lançamento${result.inserted === 1 ? '' : 's'} importado${result.inserted === 1 ? '' : 's'}${result.skipped ? ` (${result.skipped} já existia${result.skipped === 1 ? '' : 'm'})` : ''}.${projected}`,
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
