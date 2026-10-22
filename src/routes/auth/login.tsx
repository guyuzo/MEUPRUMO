import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { AuthLayout } from '@/components/shared/AuthLayout'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { authErrorMessage } from '@/lib/authErrors'
import { safeRedirect } from '@/lib/redirect'
import { supabase } from '@/lib/supabase'

const searchSchema = z.object({ redirect: z.string().optional() })

export const Route = createFileRoute('/auth/login')({
  validateSearch: searchSchema,
  component: LoginPage,
})

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
})

function LoginPage() {
  const navigate = useNavigate()
  const { redirect } = Route.useSearch()
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await supabase.auth.signInWithPassword(values)
    if (error) {
      form.setError('root', { message: authErrorMessage(error) })
      return
    }
    navigate({ to: safeRedirect(redirect) })
  })

  const { errors, isSubmitting } = form.formState

  return (
    <AuthLayout title="Entrar" subtitle="Acesse sua conta para organizar suas finanças.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          <FieldError message={errors.email?.message} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <Link to="/auth/reset-password" className="text-xs text-primary hover:underline py-3">
              Esqueci minha senha
            </Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" {...form.register('password')} />
          <FieldError message={errors.password?.message} />
        </div>
        <FieldError message={errors.root?.message} />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Não tem conta?{' '}
        <Link to="/auth/signup" search={{ redirect }} className="text-primary hover:underline py-3">
          Criar conta
        </Link>
      </p>
    </AuthLayout>
  )
}
