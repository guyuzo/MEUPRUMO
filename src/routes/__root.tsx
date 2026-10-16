import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet, type ErrorComponentProps } from '@tanstack/react-router'
import { APP_NAME } from '@/config/app'
import { isSupabaseConfigured } from '@/lib/supabase'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <p className="text-5xl">🧭</p>
      <h1 className="mt-4 text-xl font-semibold">Página não encontrada</h1>
      <p className="mt-1 text-sm text-muted-foreground">O endereço pode estar errado ou a página foi removida.</p>
      <Link to="/dashboard" className="mt-4 inline-block text-sm text-primary hover:underline">
        Voltar para o início
      </Link>
    </main>
  )
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-lg font-semibold">Algo deu errado</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {error instanceof Error && error.message ? error.message : 'Erro inesperado.'}
      </p>
      <button type="button" onClick={reset} className="mt-4 text-sm text-primary hover:underline">
        Tentar de novo
      </button>
    </div>
  )
}

function Root() {
  if (!isSupabaseConfigured) return <MissingConfig />
  return <Outlet />
}

function MissingConfig() {
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-xl font-semibold">{APP_NAME}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Supabase não configurado. Copie <code>.env.example</code> para <code>.env.local</code>, preencha{' '}
        <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> e reinicie o <code>npm run dev</code>.
      </p>
    </main>
  )
}
