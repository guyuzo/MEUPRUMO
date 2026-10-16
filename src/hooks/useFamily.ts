import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { householdQuery, setCurrentHousehold, useHousehold } from '@/hooks/useHousehold'
import { useHouseholdRows, useTableMutations } from '@/hooks/useTable'
import { supabase } from '@/lib/supabase'
import { MODULES, type HouseholdMember, type Invite, type Permission, type PermissionFlags, type TransactionSplit } from '@/types/database'

export function useMembers() {
  return useHouseholdRows<HouseholdMember>('household_members', { order: 'sort_order' })
}

export type AccessEntry = Permission & { profile: { full_name: string } | null }

/** Quem tem acesso ao app nesta casa (permissões + nome do perfil). */
export function useAccessList() {
  const householdId = useHousehold().current.household.id
  return useQuery({
    queryKey: ['permissions', householdId],
    queryFn: async (): Promise<AccessEntry[]> => {
      const { data, error } = await supabase
        .from('permissions')
        .select('*, profile:profiles(full_name)')
        .eq('household_id', householdId)
        .order('created_at')
      if (error) throw error
      return data as AccessEntry[]
    },
  })
}

export function useInvites(enabled: boolean) {
  return useHouseholdRows<Invite>('invites', { order: 'created_at', ascending: false, enabled })
}

/** Divisões das transações informadas (para a lista e o relatório por pessoa). */
export function useSplits(transactionIds: string[]) {
  const householdId = useHousehold().current.household.id
  const ids = [...transactionIds].sort()
  return useQuery({
    queryKey: ['transaction_splits', householdId, ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<TransactionSplit[]> => {
      // Lotes para não estourar o tamanho da URL.
      const out: TransactionSplit[] = []
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await supabase.from('transaction_splits').select('*').in('transaction_id', ids.slice(i, i + 150))
        if (error) throw error
        out.push(...(data as TransactionSplit[]))
      }
      return out
    },
  })
}

export const FULL_VIEW: PermissionFlags = Object.fromEntries(
  MODULES.flatMap((m) => [
    [`can_view_${m}`, true],
    [`can_edit_${m}`, false],
  ]),
) as PermissionFlags

export const FULL_EDIT: PermissionFlags = Object.fromEntries(
  MODULES.flatMap((m) => [
    [`can_view_${m}`, true],
    [`can_edit_${m}`, true],
  ]),
) as PermissionFlags

export function pickFlags(source: PermissionFlags): PermissionFlags {
  return Object.fromEntries(MODULES.flatMap((m) => [[`can_view_${m}`, source[`can_view_${m}`]], [`can_edit_${m}`, source[`can_edit_${m}`]]])) as PermissionFlags
}

export function useFamilyMutations() {
  const queryClient = useQueryClient()
  const { current, userId } = useHousehold()
  const householdId = current.household.id
  const members = useTableMutations<Pick<HouseholdMember, 'full_name' | 'relationship' | 'color'> & { sort_order?: number }>(
    'household_members',
    { invalidate: ['transactions'], label: 'pessoa' },
  )

  const createInvite = useMutation({
    mutationFn: async (input: { full_name: string; email: string | null } & PermissionFlags) => {
      const { data, error } = await supabase
        .from('invites')
        .insert({ ...input, household_id: householdId })
        .select('token')
        .single()
      if (error) throw error
      return data.token as string
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites', householdId] }),
    onError: () => toast.error('Não foi possível criar o convite.'),
  })

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invites').update({ revoked_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites', householdId] })
      toast.success('Convite cancelado.')
    },
  })

  // Otimista: o checkbox muda na hora e volta se o servidor recusar.
  const updatePermission = useMutation({
    mutationFn: async ({ id, flags }: { id: string; flags: Partial<PermissionFlags> }) => {
      const { error } = await supabase.from('permissions').update(flags).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, flags }) => {
      const key = ['permissions', householdId]
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<AccessEntry[]>(key)
      queryClient.setQueryData<AccessEntry[]>(key, (rows) => rows?.map((r) => (r.id === id ? { ...r, ...flags } : r)))
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(['permissions', householdId], context.previous)
      toast.error('Não foi possível alterar a permissão.')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['permissions', householdId] }),
  })

  const removeAccess = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('permissions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', householdId] })
      toast.success('Acesso removido.')
    },
    onError: () => toast.error('Não foi possível remover o acesso.'),
  })

  /** Sai da casa atual e volta para a própria. */
  const leave = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('permissions').delete().eq('household_id', householdId).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: async () => {
      setCurrentHousehold('')
      queryClient.clear()
      await queryClient.fetchQuery(householdQuery)
      toast.success('Você saiu da casa.')
    },
    onError: () => toast.error('Não foi possível sair.'),
  })

  return { saveMember: members.save, removeMember: members.remove, createInvite, revokeInvite, updatePermission, removeAccess, leave }
}

export function inviteLink(token: string) {
  return `${window.location.origin}/invite/${token}`
}

const INVITE_ERRORS: Record<string, string> = {
  invite_not_found: 'Convite não encontrado ou cancelado.',
  invite_already_used: 'Este convite já foi usado.',
  invite_expired: 'Este convite expirou. Peça um novo.',
  already_member: 'Você já faz parte desta casa.',
}

export function inviteErrorMessage(error: { message: string }) {
  return INVITE_ERRORS[error.message] ?? 'Não foi possível aceitar o convite.'
}
