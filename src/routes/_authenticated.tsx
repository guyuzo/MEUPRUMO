import { createFileRoute, Outlet, redirect, type ErrorComponentProps } from '@tanstack/react-router'
import { Menu, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Suspense, useEffect, useState } from 'react'
import { AppSidebar } from '@/components/shared/AppSidebar'
import { Logo } from '@/components/shared/Logo'
import { Button } from '@/components/ui/button'
import { householdQuery, useHousehold } from '@/hooks/useHousehold'
import { materialize } from '@/hooks/useRecurrences'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      throw redirect({ to: '/auth/login', search: { redirect: location.href } })
    }
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(householdQuery),
  pendingComponent: FullPageSpinner,
  errorComponent: LoadError,
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  useMaterializeOnOpen()

  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r border-border bg-card md:block print:hidden">
        <AppSidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-card shadow-xl">
            <Button variant="ghost" size="icon" className="absolute right-2 top-3" onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
              <X />
            </Button>
            <AppSidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center border-b border-border bg-card px-4 md:hidden print:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu />
          </Button>
          <Logo className="ml-2 h-8" />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8 print:max-w-none print:p-0">
          <Suspense fallback={<FullPageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

/** Ao abrir o app, gera as ocorrências de recorrências que entraram no horizonte de projeção. */
function useMaterializeOnOpen() {
  const queryClient = useQueryClient()
  const { current } = useHousehold()
  const canEdit = current.permission.role === 'owner' || current.permission.can_edit_transactions
  const householdId = current.household.id

  useEffect(() => {
    if (!canEdit) return
    let cancelled = false
    materialize(householdId)
      .then((created) => {
        if (!cancelled && created > 0) queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      })
      .catch(() => {
        // Sem impacto para o usuário: a próxima abertura tenta de novo.
      })
    return () => {
      cancelled = true
    }
  }, [canEdit, householdId, queryClient])
}

function FullPageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

function LoadError({ error }: ErrorComponentProps) {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <p className="font-medium">Não foi possível carregar sua conta.</p>
      <p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
      <Button className="mt-4" variant="outline" onClick={() => supabase.auth.signOut()}>
        Sair e entrar novamente
      </Button>
    </div>
  )
}
