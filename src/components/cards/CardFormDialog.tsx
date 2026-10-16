import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { ColorPicker } from '@/components/shared/pickers'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useAccounts } from '@/hooks/useAccounts'
import { useCardMutations } from '@/hooks/useCards'
import type { Card } from '@/types/database'

const optionalText = z
  .string()
  .trim()
  .max(40)
  .transform((v) => v || null)
const day = z.coerce.number({ invalid_type_error: 'Dia inválido' }).int().min(1, 'Entre 1 e 31').max(31, 'Entre 1 e 31')

const schema = z.object({
  name: z.string().trim().min(1, 'Informe um apelido').max(60),
  bank: optionalText,
  brand: optionalText,
  last_four: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}$/.test(v), 'Informe 4 dígitos')
    .transform((v) => v || null),
  credit_limit: z.number().int().nonnegative().nullable(),
  closing_day: day,
  due_day: day,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  default_account_id: z.string().transform((v) => v || null),
})
type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

function CardFormDialogContent({ open, onClose, card }: { open: boolean; onClose: () => void; card?: Card }) {
  const { saveCard } = useCardMutations()
  const accounts = useAccounts().data ?? []
  // Valores iniciais: usados como "values" e para limpar o form ao fechar.
  const initialValues: FormInput = {
    name: card?.name ?? '',
    bank: card?.bank ?? '',
    brand: card?.brand ?? '',
    last_four: card?.last_four ?? '',
    credit_limit: card?.credit_limit ?? null,
    closing_day: card?.closing_day ?? ('' as unknown as number),
    due_day: card?.due_day ?? ('' as unknown as number),
    color: card?.color ?? '#8b5cf6',
    default_account_id: card?.default_account_id ?? '',
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
    await saveCard.mutateAsync({ id: card?.id, ...values })
    close()
  })

  return (
    <Dialog open={open} onClose={close} title={card ? 'Editar cartão' : 'Novo cartão'}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="card-name">Apelido</Label>
            <Input id="card-name" placeholder="Ex.: Cartão roxo" autoFocus {...form.register('name')} />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-bank">Banco</Label>
            <Input id="card-bank" placeholder="Opcional" {...form.register('bank')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-brand">Bandeira</Label>
            <Input id="card-brand" placeholder="Visa, Master…" {...form.register('brand')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-last4">Final</Label>
            <Input id="card-last4" inputMode="numeric" maxLength={4} placeholder="1234" {...form.register('last_four')} />
            <FieldError message={errors.last_four?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-limit">Limite</Label>
            <Controller
              control={form.control}
              name="credit_limit"
              render={({ field }) => <MoneyInput id="card-limit" value={field.value} onChange={field.onChange} />}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-closing">Dia do fechamento</Label>
            <Input id="card-closing" type="number" min={1} max={31} {...form.register('closing_day')} />
            <FieldError message={errors.closing_day?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-due">Dia do vencimento</Label>
            <Input id="card-due" type="number" min={1} max={31} {...form.register('due_day')} />
            <FieldError message={errors.due_day?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="card-account">Conta para pagar a fatura</Label>
            <Select id="card-account" {...form.register('default_account_id')}>
              <option value="">Escolher na hora</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} data-color={a.color}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
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
export function CardFormDialog(props: Parameters<typeof CardFormDialogContent>[0]) {
  return props.open ? <CardFormDialogContent {...props} /> : null
}
