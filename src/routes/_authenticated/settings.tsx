import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Download, FileText, Monitor, Moon, Sun } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Field, PageHeader } from '@/components/shared/layout'
import { MonthPicker } from '@/components/shared/pickers'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { FieldError, Input } from '@/components/ui/input'
import { useExportTransactions } from '@/hooks/useExport'
import { householdQuery, useHousehold, usePermission } from '@/hooks/useHousehold'
import { authErrorMessage } from '@/lib/authErrors'
import { currentMonthKey } from '@/lib/dates'
import { supabase, verifyPassword } from '@/lib/supabase'
import { getThemePreference, setThemePreference, type ThemePreference } from '@/lib/theme'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/settings')({ component: SettingsPage })

function SettingsPage() {
  const { current } = useHousehold()
  const isOwner = current.permission.role === 'owner'
  const canViewTx = usePermission('transactions', 'view')

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Configurações" />
      <ProfileSection />
      <PasswordSection />
      <ThemeSection />
      {canViewTx && <ExportSection />}
      {isOwner && <DangerSection />}
    </div>
  )
}

function Section({ title, description, children, className }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('space-y-4', className)}>
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </Card>
  )
}

function ProfileSection() {
  const { profile, email, userId } = useHousehold()
  const queryClient = useQueryClient()
  const [name, setName] = useState(profile.full_name)

  const save = useMutation({
    mutationFn: async (fullName: string) => {
      const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', userId)
      if (error) throw error
      // Mantém o nome igual na "pessoa" da casa própria (nas casas de outros, quem edita é o dono).
      await supabase.from('household_members').update({ full_name: fullName }).eq('user_id', userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: householdQuery.queryKey })
      queryClient.invalidateQueries({ queryKey: ['household_members'] })
      toast.success('Perfil atualizado.')
    },
    onError: () => toast.error('Não foi possível salvar.'),
  })

  return (
    <Section title="Perfil">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" htmlFor="profile-name">
          <Input id="profile-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-mail" htmlFor="profile-email">
          <Input id="profile-email" value={email} disabled />
        </Field>
      </div>
      <Button
        variant="outline"
        disabled={!name.trim() || name.trim() === profile.full_name || save.isPending}
        onClick={() => save.mutate(name.trim())}
      >
        Salvar nome
      </Button>
    </Section>
  )
}

const passwordSchema = z
  .object({
    current: z.string().min(1, 'Informe a senha atual'),
    password: z.string().min(8, 'Mínimo de 8 caracteres'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' })

function PasswordSection() {
  const { email } = useHousehold()
  const form = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ current, password }) => {
    // Confirma a senha atual antes de trocar (sessão aberta não basta).
    if (!(await verifyPassword(email, current))) return form.setError('current', { message: 'Senha atual incorreta' })
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return form.setError('root', { message: authErrorMessage(error) })
    form.reset({ current: '', password: '', confirm: '' })
    toast.success('Senha alterada.')
  })

  return (
    <Section title="Senha">
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Senha atual" htmlFor="pw-current" error={errors.current?.message}>
            <Input id="pw-current" type="password" autoComplete="current-password" {...form.register('current')} />
          </Field>
          <Field label="Nova senha" htmlFor="pw-new" error={errors.password?.message}>
            <Input id="pw-new" type="password" autoComplete="new-password" {...form.register('password')} />
          </Field>
          <Field label="Confirmar" htmlFor="pw-confirm" error={errors.confirm?.message}>
            <Input id="pw-confirm" type="password" autoComplete="new-password" {...form.register('confirm')} />
          </Field>
        </div>
        <FieldError message={errors.root?.message} />
        <Button type="submit" variant="outline" disabled={isSubmitting}>
          Alterar senha
        </Button>
      </form>
    </Section>
  )
}

function ThemeSection() {
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference)
  const options: [ThemePreference, string, typeof Sun][] = [
    ['light', 'Claro', Sun],
    ['dark', 'Escuro', Moon],
    ['system', 'Igual ao sistema', Monitor],
  ]
  return (
    <Section title="Aparência" description="Vale para este dispositivo.">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
        {options.map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            onClick={() => {
              setTheme(value)
              setThemePreference(value)
            }}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-md border p-3 text-sm',
              theme === value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted',
            )}
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </div>
    </Section>
  )
}

function ExportSection() {
  const [month, setMonth] = useState(currentMonthKey)
  const exportTx = useExportTransactions()
  return (
    <Section title="Exportar" description="Planilha (CSV, abre no Excel e no Google Planilhas) ou relatório para imprimir/salvar em PDF.">
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker value={month} onChange={setMonth} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={exportTx.isPending} onClick={() => exportTx.mutate(month)}>
          <Download /> CSV do mês
        </Button>
        <Button variant="outline" disabled={exportTx.isPending} onClick={() => exportTx.mutate(null)}>
          <Download /> CSV de tudo
        </Button>
        <Link to="/report" search={{ month }}>
          <Button variant="outline">
            <FileText /> Relatório do mês (PDF)
          </Button>
        </Link>
      </div>
    </Section>
  )
}

function DangerSection() {
  const [open, setOpen] = useState(false)
  return (
    <Section
      title="Recomeçar do zero"
      description="Apaga contas, cartões, transações, dívidas, metas, investimentos e lista de desejos desta casa. Pessoas e acessos são mantidos."
      className="border-destructive/40"
    >
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Apagar dados da casa
      </Button>
      {open && <ResetDialog onClose={() => setOpen(false)} />}
    </Section>
  )
}

function ResetDialog({ onClose }: { onClose: () => void }) {
  const { current } = useHousehold()
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState('')
  const [keepCategories, setKeepCategories] = useState(true)
  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('reset_household', { hh: current.household.id, keep_categories: keepCategories })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.clear()
      toast.success('Dados apagados. Começando do zero.')
      onClose()
    },
    onError: () => toast.error('Não foi possível apagar.'),
  })

  return (
    <Dialog open onClose={onClose} title="Apagar todos os dados?" description="Esta ação não pode ser desfeita. Exporte um CSV antes, se quiser guardar o histórico.">
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={keepCategories} onChange={(e) => setKeepCategories(e.target.checked)} />
          Manter minhas categorias (desmarcado volta ao padrão)
        </label>
        <Field label='Digite "APAGAR" para confirmar' htmlFor="reset-confirm">
          <Input id="reset-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={confirm !== 'APAGAR' || reset.isPending} onClick={() => reset.mutate()}>
            Apagar tudo
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
