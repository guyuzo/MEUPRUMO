import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { AuthLayout } from '@/components/shared/AuthLayout'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { authErrorMessage } from '@/lib/authErrors'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/auth/reset-password')({ component: ResetPasswordPage })

// Mesma página atende os dois passos: pedir o link e, ao voltar pelo link (evento
// PASSWORD_RECOVERY), definir a nova senha.
function ResetPasswordPage() {
  // O cliente pode processar o link antes desta tela montar; o hash ainda indica o fluxo.
  const [recovering, setRecovering] = useState(() => window.location.hash.includes('type=recovery'))

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return recovering ? <NewPasswordForm /> : <RequestLinkForm />
}

const requestSchema = z.object({ email: z.string().email('E-mail inválido') })

function RequestLinkForm() {
  const [sent, setSent] = useState(false)
  const form = useForm<z.infer<typeof requestSchema>>({ resolver: zodResolver(requestSchema) })

  const onSubmit = form.handleSubmit(async ({ email }) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (error) form.setError('root', { message: authErrorMessage(error) })
    else setSent(true)
  })

  const { errors, isSubmitting } = form.formState

  return (
    <AuthLayout
      title="Redefinir senha"
      subtitle={sent ? 'Se o e-mail existir, você receberá um link em instantes.' : 'Enviaremos um link para o seu e-mail.'}
    >
      {!sent && (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
            <FieldError message={errors.email?.message} />
          </div>
          <FieldError message={errors.root?.message} />
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            Enviar link
          </Button>
        </form>
      )}
      <Link to="/auth/login" className="mt-6 inline-block text-sm text-primary hover:underline">
        Voltar para o login
      </Link>
    </AuthLayout>
  )
}

const newPasswordSchema = z
  .object({ password: z.string().min(8, 'Mínimo de 8 caracteres'), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' })

function NewPasswordForm() {
  const navigate = useNavigate()
  const form = useForm<z.infer<typeof newPasswordSchema>>({ resolver: zodResolver(newPasswordSchema) })

  const onSubmit = form.handleSubmit(async ({ password }) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      form.setError('root', { message: authErrorMessage(error) })
      return
    }
    toast.success('Senha atualizada.')
    navigate({ to: '/dashboard' })
  })

  const { errors, isSubmitting } = form.formState

  return (
    <AuthLayout title="Nova senha">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="password">Nova senha</Label>
          <Input id="password" type="password" autoComplete="new-password" {...form.register('password')} />
          <FieldError message={errors.password?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmar senha</Label>
          <Input id="confirm" type="password" autoComplete="new-password" {...form.register('confirm')} />
          <FieldError message={errors.confirm?.message} />
        </div>
        <FieldError message={errors.root?.message} />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          Salvar senha
        </Button>
      </form>
    </AuthLayout>
  )
}
