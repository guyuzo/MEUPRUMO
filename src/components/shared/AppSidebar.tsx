import { Link, useRouter } from '@tanstack/react-router'
import {
  ArrowLeftRight,
  CreditCard,
  Gift,
  Goal,
  House,
  Landmark,
  LayoutGrid,
  LineChart,
  LogOut,
  Repeat,
  Settings,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar } from '@/components/family/Avatar'
import { Logo } from '@/components/shared/Logo'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { Dropdown } from '@/components/ui/dropdown'
import { useAvatarUrls } from '@/hooks/useAvatars'
import { useMembers } from '@/hooks/useFamily'
import { householdQuery, setCurrentHousehold, useHousehold } from '@/hooks/useHousehold'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Module } from '@/types/database'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  module?: Module
}

// Telas que ainda não existem ficam fora do menu até a fase correspondente.
export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Início', icon: House },
  { to: '/transactions', label: 'Transações', icon: ArrowLeftRight, module: 'transactions' },
  { to: '/accounts', label: 'Contas', icon: Landmark, module: 'transactions' },
  { to: '/cards', label: 'Cartões', icon: CreditCard, module: 'transactions' },
  { to: '/cash-flow', label: 'Fluxo de caixa', icon: LineChart, module: 'transactions' },
  { to: '/categories', label: 'Planejamento', icon: LayoutGrid, module: 'planning' },
  { to: '/recurrences', label: 'Recorrências', icon: Repeat, module: 'transactions' },
  { to: '/debts', label: 'Dívidas', icon: Wallet, module: 'debts' },
  { to: '/goals', label: 'Metas', icon: Goal, module: 'goals' },
  { to: '/investments', label: 'Investimentos', icon: TrendingUp, module: 'investments' },
  { to: '/wishlist', label: 'Lista de desejos', icon: Gift, module: 'wishlist' },
  { to: '/members', label: 'Família', icon: Users },
  { to: '/settings', label: 'Configurações', icon: Settings },
]

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { current, profile, memberships, userId } = useHousehold()
  const me = (useMembers().data ?? []).find((m) => m.user_id === userId)
  const myAvatar = useAvatarUrls(me ? [me] : []).data?.get(me?.id ?? '')
  const { permission } = current
  const router = useRouter()
  const { routesByPath } = router
  const queryClient = useQueryClient()

  // Troca de casa: todo o cache é de uma casa só, então limpa tudo e recarrega o contexto.
  const switchHousehold = async (id: string) => {
    setCurrentHousehold(id)
    queryClient.clear()
    await queryClient.fetchQuery(householdQuery)
    onNavigate?.()
    router.navigate({ to: '/dashboard' })
  }

  const visible = NAV_ITEMS.filter(
    (item) =>
      // Listas com rota de detalhe usam index route ("/accounts/").
      (item.to in routesByPath || `${item.to}/` in routesByPath) &&
      (!item.module || permission.role === 'owner' || permission[`can_view_${item.module}`]),
  )

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      <div className="mb-4 px-2 py-2">
        <Logo className="h-10" />
      </div>
      {visible.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          // NAV_ITEMS inclui rotas de fases futuras; o filtro acima garante que `to` existe.
          to={to as never}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          activeProps={{ className: cn('bg-muted font-medium !text-foreground') }}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
      <div className="mt-auto border-t border-border pt-3">
        <div className="flex items-center gap-2 px-3">
          {me && <Avatar member={me} url={myAvatar} size="sm" />}
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{profile.full_name || 'Você'}</p>
          <ThemeToggle />
        </div>
        {memberships.length > 1 ? (
          <div className="mt-1 px-2">
            <Dropdown
              aria-label="Trocar de casa"
              value={current.household.id}
              onChange={switchHousehold}
              options={memberships.map((m) => ({
                value: m.household.id,
                label: m.household.name,
                description: m.permission.role === 'owner' ? 'Sua casa' : 'Convidado',
              }))}
            />
          </div>
        ) : (
          <p className="truncate px-3 text-xs text-muted-foreground">{current.household.name}</p>
        )}
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="mt-2 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" />
          Sair
        </button>
      </div>
    </nav>
  )
}
