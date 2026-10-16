import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { AuthLayout } from '@/components/shared/AuthLayout'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { authErrorMessage } from '@/lib/authErrors'
import { safeRedirect } from '@/lib/redirect'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/auth/signup')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: SignupPage,
})

const schema = z
  .object({
    fullName: z.string().trim().min(2, 'Informe seu nome'),
    email: z.string().email('E-mail inválido'),
    password: z.string().min(8, 'Mínimo de 8 caracteres'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' })

function SignupPage() {
  const navigate = useNavigate()
  const { redirect } = Route.useSearch()
  const target = safeRedirect(redirect)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })

  const onSubmit = form.handleSubmit(async ({ fullName, email, password }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // O link de confirmação volta para onde a pessoa estava indo (ex.: o convite).
      options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}${target}` },
    })
    if (error) {
      form.setError('root', { message: authErrorMessage(error) })
      return
    }
    // Com confirmação de e-mail ligada no Supabase não há sessão ainda.
    if (data.session) navigate({ to: target })
    else setPendingEmail(email)
  })

  if (pendingEmail) {
    return (
      <AuthLayout title="Confirme seu e-mail" subtitle={`Enviamos um link de confirmação para ${pendingEmail}.`}>
        <Link to="/auth/login" search={{ redirect }} className="text-sm text-primary hover:underline">
          Voltar para o login
        </Link>
      </AuthLayout>
    )
  }

  const { errors, isSubmitting } = form.formState

  return (
    <AuthLayout title="Criar conta" subtitle="Comece a organizar o dinheiro da sua casa.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Nome</Label>
          <Input id="fullName" autoComplete="name" {...form.register('fullName')} />
          <FieldError message={errors.fullName?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          <FieldError message={errors.email?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
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
          {isSubmitting ? 'Criando…' : 'Criar conta'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link to="/auth/login" search={{ redirect }} className="text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  )
}
