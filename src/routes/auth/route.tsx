import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/auth')({
  beforeLoad: async ({ location }) => {
    // Quem já está logado não precisa ver login/cadastro; a redefinição de senha é exceção.
    if (location.pathname.startsWith('/auth/reset-password')) return
    const { data } = await supabase.auth.getSession()
    if (data.session) throw redirect({ to: '/dashboard' })
  },
  component: Outlet,
})
