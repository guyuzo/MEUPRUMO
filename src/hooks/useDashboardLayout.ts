import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { householdQuery, useHousehold } from '@/hooks/useHousehold'
import { isDefaultLayout, normalizeLayout, type LayoutItem } from '@/lib/dashboardLayout'
import { supabase } from '@/lib/supabase'

/** Layout da tela Início da pessoa logada (vale em todos os aparelhos). */
export function useDashboardLayout() {
  const { profile, userId } = useHousehold()
  const queryClient = useQueryClient()
  const layout = normalizeLayout(profile.dashboard_layout)

  const save = useMutation({
    mutationFn: async (next: LayoutItem[]) => {
      // Igual ao padrão: guarda null, para receber melhorias futuras do layout padrão.
      const value = isDefaultLayout(next) ? null : next
      const { error } = await supabase.from('profiles').update({ dashboard_layout: value }).eq('id', userId)
      if (error) throw error
      return value
    },
    onSuccess: (value) => {
      queryClient.setQueryData(householdQuery.queryKey, (ctx) => (ctx ? { ...ctx, profile: { ...ctx.profile, dashboard_layout: value } } : ctx))
      toast.success('Layout do Início salvo.')
    },
    onError: () => toast.error('Não foi possível salvar o layout.'),
  })

  return { layout, save }
}
