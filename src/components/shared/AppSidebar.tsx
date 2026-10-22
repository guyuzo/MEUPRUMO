import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import {
  ArrowLeftRight,
  ChevronDown,
  ClipboardList,
  CreditCard,
  Gift,
  Goal,
  HandCoins,
  House,
  Landmark,
  LineChart,
  LogOut,
  PiggyBank,
  Repeat,
  Settings,
  Sprout,
  Tags,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
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

interface NavLink {
  to: string
  label: string
  icon: LucideIcon
  module?: Module
}

interface NavGroup {
  id: string
  label: string
  icon: LucideIcon
  items: NavLink[]
}

type NavEntry = NavLink | NavGroup
const isGroup = (entry: NavEntry): entry is NavGroup => 'items' in entry

export const NAV: NavEntry[] = [
  { to: '/dashboard', label: 'Início', icon: House },
  {
    id: 'contas',
    label: 'Contas',
    icon: Wallet,
    items: [
      { to: '/transactions', label: 'Transações', icon: ArrowLeftRight, module: 'transactions' },
      { to: '/accounts', label: 'Contas', icon: Landmark, module: 'transactions' },
      { to: '/cards', label: 'Cartões', icon: CreditCard, module: 'transactions' },
    ],
  },
  {
    id: 'planejamento',
    label: 'Planejamento',
    icon: ClipboardList,
    items: [
      { to: '/cash-flow', label: 'Fluxo de caixa', icon: LineChart, module: 'transactions' },
      { to: '/budget', label: 'Orçamento', icon: PiggyBank, module: 'planning' },
      { to: '/categories', label: 'Categorias', icon: Tags, module: 'planning' },
      { to: '/recurrences', label: 'Recorrências', icon: Repeat, module: 'transactions' },
    ],
  },
  {
    id: 'futuro',
    label: 'Futuro',
    icon: Sprout,
    items: [
      { to: '/goals', label: 'Metas', icon: Goal, module: 'goals' },
      { to: '/investments', label: 'Investimentos', icon: TrendingUp, module: 'investments' },
      { to: '/wishlist', label: 'Lista de desejos', icon: Gift, module: 'wishlist' },
      { to: '/debts', label: 'Dívidas', icon: HandCoins, module: 'debts' },
    ],
  },
  { to: '/members', label: 'Família', icon: Users },
  { to: '/settings', label: 'Configurações', icon: Settings },
]

const OPEN_KEY = 'mp.nav.open'

function readOpenGroups(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}')
  } catch {
    return {}
  }
}

const linkClass =
  'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/90 transition-colors hover:bg-sidebar-active/50 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-foreground/60'
const activeClass = 'bg-sidebar-active font-medium !text-sidebar-foreground'

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { current, profile, memberships, userId } = useHousehold()
  const me = (useMembers().data ?? []).find((m) => m.user_id === userId)
  const myAvatar = useAvatarUrls(me ? [me] : []).data?.get(me?.id ?? '')
  const { permission } = current
  const router = useRouter()
  const { routesByPath } = router
  const queryClient = useQueryClient()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [openGroups, setOpenGroups] = useState(readOpenGroups)

  // Troca de casa: todo o cache é de uma casa só, então limpa tudo e recarrega o contexto.
  const switchHousehold = async (id: string) => {
    setCurrentHousehold(id)
    queryClient.clear()
    await queryClient.fetchQuery(householdQuery)
    onNavigate?.()
    router.navigate({ to: '/dashboard' })
  }

  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`)

  const toggleGroup = (id: string, open: boolean) => {
    const next = { ...openGroups, [id]: open }
    setOpenGroups(next)
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next))
    } catch {
      // Sem storage: vale só nesta sessão.
    }
  }

  const allowed = (item: NavLink) =>
    // Listas com rota de detalhe usam index route ("/accounts/").
    (item.to in routesByPath || `${item.to}/` in routesByPath) &&
    (!item.module || permission.role === 'owner' || permission[`can_view_${item.module}`])

  // Grupos sem nenhum item permitido somem do menu.
  const entries = NAV.flatMap((entry): NavEntry[] => {
    if (!isGroup(entry)) return allowed(entry) ? [entry] : []
    const items = entry.items.filter(allowed)
    return items.length ? [{ ...entry, items }] : []
  })

  return (
    <nav aria-label="Menu principal" className="flex h-full flex-col gap-1 overflow-y-auto bg-sidebar p-3 text-sidebar-foreground">
      <div className="mb-4 px-2 py-2">
        <Logo className="h-10" tone="onDark" />
      </div>
      {entries.map((entry) => {
        if (!isGroup(entry)) {
          const Icon = entry.icon
          return (
            <Link
              key={entry.to}
              // As rotas vêm de NAV (texto); o filtro acima garante que existem.
              to={entry.to as never}
              onClick={onNavigate}
              className={linkClass}
              activeProps={{ className: activeClass }}
            >
              <Icon className="size-4" />
              {entry.label}
            </Link>
          )
        }
        const Icon = entry.icon
        const hasActive = entry.items.some((item) => isActive(item.to))
        // O grupo da página atual abre sozinho; os demais seguem a escolha salva.
        const open = hasActive || (openGroups[entry.id] ?? false)
        const panelId = `nav-${entry.id}`
        return (
          <div key={entry.id}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => toggleGroup(entry.id, !open)}
              className={cn(linkClass, 'w-full')}
            >
              <Icon className="size-4" />
              <span className="flex-1 text-left">{entry.label}</span>
              <ChevronDown className={cn('size-4 opacity-80 transition-transform', open && 'rotate-180')} />
            </button>
            {open && (
              <div id={panelId} className="ml-5 mt-0.5 space-y-0.5 border-l border-sidebar-foreground/20 pl-2">
                {entry.items.map((item) => {
                  const ItemIcon = item.icon
                  return (
                    <Link
                      key={item.to}
                      to={item.to as never}
                      onClick={onNavigate}
                      className={cn(linkClass, 'py-1.5')}
                      activeProps={{ className: activeClass }}
                    >
                      <ItemIcon className="size-4" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      <div className="mt-auto border-t border-sidebar-foreground/20 pt-3">
        <div className="flex items-center gap-2 px-3">
          {/* Contorno: sem foto, a cor da pessoa pode ser igual ao verde do menu. */}
          {me && <Avatar member={me} url={myAvatar} size="sm" className="ring-2 ring-sidebar-foreground/70" />}
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{profile.full_name || 'Você'}</p>
          <ThemeToggle className="text-sidebar-foreground/90 hover:bg-sidebar-active/50 hover:text-sidebar-foreground" />
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
          <p className="truncate px-3 text-xs text-sidebar-foreground/90">{current.household.name}</p>
        )}
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="mt-2 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/90 hover:bg-sidebar-active/50 hover:text-sidebar-foreground"
        >
          <LogOut className="size-4" />
          Sair
        </button>
      </div>
    </nav>
  )
}
