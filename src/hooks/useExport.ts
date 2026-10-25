import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useHousehold } from '@/hooks/useHousehold'
import { centsToDecimal, downloadFile, toCsv } from '@/lib/csv'
import type { MonthKey } from '@/lib/dates'
import { TX_KIND_LABEL } from '@/lib/finance/labels'
import { supabase } from '@/lib/supabase'
import type { Transaction } from '@/types/database'

const PAGE = 1000

/** Exporta as transações (de um mês ou todas) em CSV, com nomes em vez de ids. */
export function useExportTransactions() {
  const householdId = useHousehold().current.household.id

  return useMutation({
    mutationFn: async (month: MonthKey | null) => {
      const rows: Transaction[] = []
      // PostgREST limita o tamanho da resposta: busca em páginas.
      for (let from = 0; ; from += PAGE) {
        let query = supabase
          .from('transactions')
          .select('*')
          .eq('household_id', householdId)
          .order('occurred_on')
          .order('created_at')
          .range(from, from + PAGE - 1)
        // Mês de competência: compra no cartão entra no mês da fatura.
        if (month) query = query.eq('competence_month', month)
        const { data, error } = await query
        if (error) throw error
        rows.push(...(data as Transaction[]))
        if (data.length < PAGE) break
      }

      const [accounts, cards, categories, subcategories, members] = await Promise.all(
        ['bank_accounts', 'cards', 'categories', 'subcategories', 'household_members'].map(async (table) => {
          const { data, error } = await supabase
            .from(table)
            .select(table === 'household_members' ? 'id, name:full_name' : 'id, name')
            .eq('household_id', householdId)
          if (error) throw error
          return new Map((data as unknown as { id: string; name: string }[]).map((r) => [r.id, r.name]))
        }),
      )

      const csv = toCsv(
        ['Data', 'Descrição', 'Tipo', 'Situação', 'Valor', 'Categoria', 'Subcategoria', 'Conta', 'Conta destino', 'Cartão', 'Pessoa', 'Vencimento', 'Observações'],
        rows.map((t) => [
          t.occurred_on.split('-').reverse().join('/'),
          t.description,
          TX_KIND_LABEL[t.kind],
          t.status === 'paid' ? 'Pago' : 'Pendente',
          centsToDecimal(t.direction === 'outflow' ? -t.amount : t.amount),
          t.category_id ? categories.get(t.category_id) : '',
          t.subcategory_id ? subcategories.get(t.subcategory_id) : '',
          t.bank_account_id ? accounts.get(t.bank_account_id) : '',
          t.destination_account_id ? accounts.get(t.destination_account_id) : '',
          t.card_id ? cards.get(t.card_id) : '',
          t.household_member_id ? members.get(t.household_member_id) : '',
          t.due_on ? t.due_on.split('-').reverse().join('/') : '',
          t.notes,
        ]),
      )
      downloadFile(`transacoes-${month ? month.slice(0, 7) : 'todas'}.csv`, csv)
      return rows.length
    },
    onSuccess: (count) => toast.success(`${count} transações exportadas.`),
    onError: () => toast.error('Não foi possível exportar.'),
  })
}
