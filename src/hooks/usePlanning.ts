import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useHousehold } from '@/hooks/useHousehold'
import type { MonthKey } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import type { Category, CategoryBudget, CategoryKind, Subcategory, SubcategoryBudget } from '@/types/database'

export type CategoryWithSubs = Category & { subcategories: Subcategory[] }

export const categoriesQuery = (householdId: string) =>
  queryOptions({
    queryKey: ['categories', householdId],
    queryFn: async (): Promise<CategoryWithSubs[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*, subcategories(*)')
        .eq('household_id', householdId)
        .order('sort_order')
        .order('sort_order', { referencedTable: 'subcategories' })
      if (error) throw error
      return data as CategoryWithSubs[]
    },
  })

export const budgetsQuery = (householdId: string, period: MonthKey) =>
  queryOptions({
    queryKey: ['budgets', householdId, period],
    queryFn: async () => {
      const [cat, sub] = await Promise.all([
        supabase.from('category_budgets').select('*').eq('household_id', householdId).eq('period', period),
        supabase.from('subcategory_budgets').select('*').eq('household_id', householdId).eq('period', period),
      ])
      if (cat.error) throw cat.error
      if (sub.error) throw sub.error
      return {
        byCategory: new Map((cat.data as CategoryBudget[]).map((b) => [b.category_id, b.amount])),
        bySubcategory: new Map((sub.data as SubcategoryBudget[]).map((b) => [b.subcategory_id, b.amount])),
      }
    },
  })

export function useCategories() {
  const householdId = useHousehold().current.household.id
  return useQuery(categoriesQuery(householdId))
}

export function useBudgets(period: MonthKey, enabled = true) {
  const householdId = useHousehold().current.household.id
  return useQuery({ ...budgetsQuery(householdId, period), enabled })
}

function onError(error: Error) {
  toast.error(error.message.includes('duplicate') ? 'Já existe um item com esse nome.' : 'Não foi possível salvar.')
}

export interface CategoryInput {
  name: string
  emoji: string
  color: string
  kind: CategoryKind
}

export function useCategoryMutations() {
  const queryClient = useQueryClient()
  const householdId = useHousehold().current.household.id
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['categories', householdId] })

  const saveCategory = useMutation({
    mutationFn: async ({ id, ...input }: CategoryInput & { id?: string; sort_order?: number }) => {
      const { error } = id
        ? await supabase.from('categories').update(input).eq('id', id)
        : await supabase.from('categories').insert({ ...input, household_id: householdId })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError,
  })

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['budgets', householdId] })
    },
    onError,
  })

  const saveSubcategory = useMutation({
    mutationFn: async (input: { id?: string; category_id: string; name: string; sort_order?: number }) => {
      const { id, ...values } = input
      const { error } = id
        ? await supabase.from('subcategories').update({ name: values.name }).eq('id', id)
        : await supabase.from('subcategories').insert({ ...values, household_id: householdId })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError,
  })

  const deleteSubcategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('subcategories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError,
  })

  return { saveCategory, deleteCategory, saveSubcategory, deleteSubcategory }
}

export function useBudgetMutations(period: MonthKey) {
  const queryClient = useQueryClient()
  const householdId = useHousehold().current.household.id
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['budgets', householdId, period] })

  /** amount null/0 remove o orçamento. */
  const setBudget = useMutation({
    mutationFn: async (input: { target: 'category' | 'subcategory'; id: string; amount: number | null }) => {
      const table = input.target === 'category' ? 'category_budgets' : 'subcategory_budgets'
      const fk = input.target === 'category' ? 'category_id' : 'subcategory_id'
      const { error } =
        input.amount && input.amount > 0
          ? await supabase
              .from(table)
              .upsert({ household_id: householdId, [fk]: input.id, period, amount: input.amount }, { onConflict: `${fk},period` })
          : await supabase.from(table).delete().eq(fk, input.id).eq('period', period)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError,
  })

  const copyFrom = useMutation({
    mutationFn: async (source: MonthKey) => {
      for (const [table, fk] of [
        ['category_budgets', 'category_id'],
        ['subcategory_budgets', 'subcategory_id'],
      ] as const) {
        const { data, error } = await supabase
          .from(table)
          .select(`${fk}, amount`)
          .eq('household_id', householdId)
          .eq('period', source)
        if (error) throw error
        if (!data.length) continue
        const rows = (data as Record<string, string | number>[]).map((row) => ({
          household_id: householdId,
          [fk]: row[fk],
          amount: row.amount,
          period,
        }))
        const { error: upsertError } = await supabase.from(table).upsert(rows, { onConflict: `${fk},period` })
        if (upsertError) throw upsertError
      }
    },
    onSuccess: () => {
      invalidate()
      toast.success('Orçamento copiado.')
    },
    onError,
  })

  return { setBudget, copyFrom }
}
