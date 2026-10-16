import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Household, Module, Permission, PermissionAction, Profile } from '@/types/database'

export interface Membership {
  permission: Permission
  household: Household
}

export interface HouseholdContext {
  userId: string
  email: string
  profile: Profile
  memberships: Membership[]
  current: Membership
}

const CURRENT_KEY = 'ff.currentHousehold'

function readStoredHousehold(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

export function setCurrentHousehold(id: string) {
  try {
    localStorage.setItem(CURRENT_KEY, id)
  } catch {
    // Sem storage: segue com o household padrão.
  }
}

export const householdQuery = queryOptions({
  queryKey: ['household-context'],
  staleTime: 5 * 60_000,
  queryFn: async (): Promise<HouseholdContext> => {
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || !auth.user) throw authError ?? new Error('not_authenticated')

    const [profileRes, permsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', auth.user.id).single<Profile>(),
      supabase
        .from('permissions')
        .select('*, household:households!inner(*)')
        .eq('user_id', auth.user.id)
        .order('created_at'),
    ])
    if (profileRes.error) throw profileRes.error
    if (permsRes.error) throw permsRes.error

    const memberships: Membership[] = (permsRes.data ?? []).map(
      ({ household, ...permission }: Permission & { household: Household }) => ({ permission, household }),
    )
    if (memberships.length === 0) throw new Error('no_household')

    const stored = readStoredHousehold()
    const current = memberships.find((m) => m.household.id === stored) ?? memberships[0]

    return {
      userId: auth.user.id,
      email: auth.user.email ?? '',
      profile: profileRes.data,
      memberships,
      current,
    }
  },
})

export function useHousehold() {
  return useSuspenseQuery(householdQuery).data
}

export function usePermission(module: Module, action: PermissionAction = 'view') {
  const { permission } = useHousehold().current
  return permission.role === 'owner' || permission[`can_${action}_${module}`]
}
