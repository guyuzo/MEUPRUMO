import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { ColorPicker } from '@/components/shared/pickers'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useAccountMutations, type AccountWithBalance } from '@/hooks/useAccounts'
import { ACCOUNT_TYPE_LABEL } from '@/lib/finance/labels'

const optionalText = z
  .string()
  .trim()
  .max(60)
  .transform((v) => v || null)

const schema = z.object({
  name: z.string().trim().min(1, 'Informe um nome').max(60),
  type: z.enum(['checking', 'savings', 'cash', 'investment', 'other']),
  bank: optionalText,
  branch: optionalText,
  account_number: optionalText,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  initial_balance: z.number({ invalid_type_error: 'Informe o saldo' }).int(),
  initial_balance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data'),
})
type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

function AccountFormDialogContent({
  open,
  onClose,
  account,
}: {
  open: boolean
  onClose: () => void
  account?: AccountWithBalance
}) {
  const { saveAccount } = useAccountMutations()
  // Fixado na montagem para os `values` não mudarem (e resetarem o form) a cada render.
  const [today] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  // Valores iniciais: usados como "values" e para limpar o form ao fechar.
  const initialValues: FormInput = {
    name: account?.name ?? '',
    type: account?.type ?? 'checking',
    bank: account?.bank ?? '',
    branch: account?.branch ?? '',
    account_number: account?.account_number ?? '',
    color: account?.color ?? '#1f6b56',
    initial_balance: account?.initial_balance ?? 0,
    initial_balance_date: account?.initial_balance_date ?? today,
  }
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    // Dados que chegam depois (ex.: contas) não apagam o que o usuário já digitou.
    resetOptions: { keepDirtyValues: true },
    values: initialValues,
  })
  const { errors, isSubmitting } = form.formState
  const close = () => {
    form.reset(initialValues)
    onClose()
  }

  const onSubmit = form.handleSubmit(async (values) => {
    await saveAccount.mutateAsync({ id: account?.id, ...values })
    close()
  })

  return (
    <Dialog open={open} onClose={close} title={account ? 'Editar conta' : 'Nova conta'}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="acc-name">Nome</Label>
            <Input id="acc-name" placeholder="Ex.: Conta principal" autoFocus {...form.register('name')} />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-type">Tipo</Label>
            <Select id="acc-type" {...form.register('type')}>
              {Object.entries(ACCOUNT_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-bank">Banco</Label>
            <Input id="acc-bank" placeholder="Opcional" {...form.register('bank')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-branch">Agência</Label>
            <Input id="acc-branch" placeholder="Opcional" {...form.register('branch')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-number">Número da conta</Label>
            <Input id="acc-number" placeholder="Opcional" {...form.register('account_number')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-balance">Saldo inicial</Label>
            <Controller
              control={form.control}
              name="initial_balance"
              render={({ field }) => (
                <MoneyInput id="acc-balance" allowNegative value={field.value} onChange={(v) => field.onChange(v ?? 0)} />
              )}
            />
            <FieldError message={errors.initial_balance?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-date">Saldo em</Label>
            <Input id="acc-date" type="date" {...form.register('initial_balance_date')} />
            <FieldError message={errors.initial_balance_date?.message} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Transações anteriores à data do saldo inicial não alteram o saldo da conta.
        </p>
        <div className="space-y-1.5">
          <Label>Cor</Label>
          <Controller
            control={form.control}
            name="color"
            render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Monta o formulário só quando aberto: cada abertura começa limpa (sem valores da anterior). */
export function AccountFormDialog(props: Parameters<typeof AccountFormDialogContent>[0]) {
  return props.open ? <AccountFormDialogContent {...props} /> : null
}
