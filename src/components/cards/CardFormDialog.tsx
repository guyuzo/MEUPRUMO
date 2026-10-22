import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { BankLogo } from '@/components/cards/BankLogo'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { ColorPicker } from '@/components/shared/pickers'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown'
import { FieldError, Input, Label } from '@/components/ui/input'
import { useCardMutations } from '@/hooks/useCards'
import { BANKS, findBank } from '@/lib/banks'
import type { Card } from '@/types/database'

const day = z.coerce.number({ invalid_type_error: 'Dia inválido' }).int().min(1, 'Entre 1 e 31').max(31, 'Entre 1 e 31')

const schema = z.object({
  name: z.string().trim().min(1, 'Informe um apelido').max(60),
  bank: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v || null),
  last_four: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}$/.test(v), 'Informe 4 dígitos')
    .transform((v) => v || null),
  credit_limit: z.number().int().nonnegative().nullable(),
  closing_day: day,
  due_day: day,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})
type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

const OTHER = '__other'
const BANK_OPTIONS: DropdownOption[] = [
  ...BANKS.map((b) => ({
    value: b.slug,
    label: b.name,
    keywords: b.aliases?.join(' '),
    icon: (size: 'sm' | 'md') => <BankLogo bank={b.name} size={size} />,
  })),
  { value: OTHER, label: 'Outro banco', description: 'Digitar o nome' },
]

function CardFormDialogContent({ open, onClose, card }: { open: boolean; onClose: () => void; card?: Card }) {
  const { saveCard } = useCardMutations()
  const initialValues: FormInput = {
    name: card?.name ?? '',
    bank: card?.bank ?? '',
    last_four: card?.last_four ?? '',
    credit_limit: card?.credit_limit ?? null,
    closing_day: card?.closing_day ?? ('' as unknown as number),
    due_day: card?.due_day ?? ('' as unknown as number),
    color: card?.color ?? '#1f6b56',
  }
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
  })
  const { errors, isSubmitting } = form.formState
  // Banco fora da lista: o nome é digitado num campo de texto.
  const [otherBank, setOtherBank] = useState(Boolean(card?.bank && !findBank(card.bank)))
  const bank = form.watch('bank') ?? ''
  const color = form.watch('color')

  const chooseBank = (value: string) => {
    if (value === OTHER) {
      setOtherBank(true)
      form.setValue('bank', '', { shouldDirty: true })
      return
    }
    const picked = BANKS.find((b) => b.slug === value)
    if (!picked) return
    setOtherBank(false)
    form.setValue('bank', picked.name, { shouldDirty: true })
    // A cor acompanha o banco, a menos que o usuário já tenha escolhido outra.
    if (!form.getFieldState('color').isDirty) form.setValue('color', picked.color)
    if (!form.getValues('name').trim()) form.setValue('name', picked.name)
  }

  const onSubmit = form.handleSubmit(async (values) => {
    await saveCard.mutateAsync({ id: card?.id, ...values })
    onClose()
  })

  return (
    <Dialog open={open} onClose={onClose} title={card ? 'Editar cartão' : 'Novo cartão'}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <BankLogo bank={bank} color={color} />
          <div className="min-w-0">
            <p className="truncate font-medium">{form.watch('name') || 'Novo cartão'}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[bank || 'Sem banco', form.watch('last_four') && `•••• ${form.watch('last_four')}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="card-bank">Banco</Label>
            <Dropdown
              id="card-bank"
              value={otherBank ? OTHER : (findBank(bank)?.slug ?? '')}
              onChange={chooseBank}
              options={BANK_OPTIONS}
              placeholder="Escolha o banco"
              searchable
            />
            {otherBank && (
              <Input
                id="card-bank-other"
                aria-label="Nome do banco"
                placeholder="Nome do banco"
                className="mt-2"
                autoFocus={!card?.bank}
                {...form.register('bank')}
              />
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="card-name">Apelido</Label>
            <Input id="card-name" placeholder="Ex.: Cartão roxo" {...form.register('name')} />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-last4">Final</Label>
            <Input
              id="card-last4"
              inputMode="numeric"
              maxLength={4}
              placeholder="1234"
              {...form.register('last_four', {
                // Só dígitos: corrige o campo e o valor guardado no formulário.
                onChange: (e) => {
                  const digits = e.target.value.replace(/\D/g, '')
                  if (digits !== e.target.value) {
                    e.target.value = digits
                    form.setValue('last_four', digits)
                  }
                },
              })}
            />
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
            <Input id="card-closing" type="number" inputMode="numeric" min={1} max={31} {...form.register('closing_day')} />
            <FieldError message={errors.closing_day?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-due">Dia do vencimento</Label>
            <Input id="card-due" type="number" inputMode="numeric" min={1} max={31} {...form.register('due_day')} />
            <FieldError message={errors.due_day?.message} />
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
          <Button type="button" variant="outline" onClick={onClose}>
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
