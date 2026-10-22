import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Users } from 'lucide-react'
import { useState } from 'react'
import { AuthLayout } from '@/components/shared/AuthLayout'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/input'
import { inviteErrorMessage } from '@/hooks/useFamily'
import { setCurrentHousehold } from '@/hooks/useHousehold'
import { supabase } from '@/lib/supabase'

// Fora de /_authenticated e de /auth: precisa abrir logado ou não.
export const Route = createFileRoute('/invite/$token')({ component: InvitePage })

interface Summary {
  household_name: string
  invited_by: string
  invitee_name: string
  status: 'valid' | 'accepted' | 'expired' | 'revoked'
}

const STATUS_TEXT: Record<Exclude<Summary['status'], 'valid'>, string> = {
  accepted: 'Este convite já foi usado.',
  expired: 'Este convite expirou. Peça um novo para quem te convidou.',
  revoked: 'Este convite foi cancelado.',
}

function InvitePage() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string>()
  const [accepting, setAccepting] = useState(false)

  const data = useQuery({
    queryKey: ['invite-summary', token],
    queryFn: async () => {
      const [{ data: summary, error: summaryError }, { data: session }] = await Promise.all([
        supabase.rpc('get_invite_summary', { p_token: token }),
        supabase.auth.getSession(),
      ])
      if (summaryError) throw summaryError
      return { summary: (summary as Summary[])[0] ?? null, loggedIn: Boolean(session.session) }
    },
  })

  const accept = async () => {
    setAccepting(true)
    setError(undefined)
    const { data: householdId, error: acceptError } = await supabase.rpc('accept_invite', { p_token: token })
    setAccepting(false)
    if (acceptError) return setError(inviteErrorMessage(acceptError))
    setCurrentHousehold(householdId as string)
    queryClient.clear()
    navigate({ to: '/dashboard' })
  }

  if (data.isPending) {
    return (
      <AuthLayout title="Convite">
        <div className="h-24 animate-pulse rounded-md bg-muted" />
      </AuthLayout>
    )
  }

  const summary = data.data?.summary
  if (!summary) {
    return (
      <AuthLayout title="Convite inválido" subtitle="Confira se o link foi copiado inteiro.">
        <Link to="/auth/login" className="text-sm text-primary hover:underline py-3">
          Ir para o login
        </Link>
      </AuthLayout>
    )
  }

  if (summary.status !== 'valid') {
    return (
      <AuthLayout title="Convite indisponível" subtitle={STATUS_TEXT[summary.status]}>
        <Link to="/dashboard" className="text-sm text-primary hover:underline py-3">
          Ir para o app
        </Link>
      </AuthLayout>
    )
  }

  const redirect = `/invite/${token}`

  return (
    <AuthLayout
      title={`Olá, ${summary.invitee_name.split(' ')[0]}!`}
      subtitle={`${summary.invited_by} convidou você para organizar as finanças de "${summary.household_name}".`}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-md bg-muted px-4 py-3 text-sm">
          <Users className="size-5 shrink-0 text-primary" />
          Você verá o que foi liberado para você nesta casa. Sua própria conta continua separada.
        </div>
        {data.data?.loggedIn ? (
          <Button className="w-full" onClick={accept} disabled={accepting}>
            {accepting ? 'Entrando na casa…' : 'Aceitar convite'}
          </Button>
        ) : (
          <div className="grid gap-2">
            <Link to="/auth/signup" search={{ redirect }}>
              <Button className="w-full">Criar conta e aceitar</Button>
            </Link>
            <Link to="/auth/login" search={{ redirect }}>
              <Button variant="outline" className="w-full">
                Já tenho conta
              </Button>
            </Link>
          </div>
        )}
        <FieldError message={error} />
      </div>
    </AuthLayout>
  )
}
