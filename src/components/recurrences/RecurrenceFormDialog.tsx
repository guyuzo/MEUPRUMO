import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Field } from '@/components/shared/layout'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useAccounts } from '@/hooks/useAccounts'
import { useCards } from '@/hooks/useCards'
import { useCategories } from '@/hooks/usePlanning'
import { useRecurrenceMutations } from '@/hooks/useRecurrences'
import { cn } from '@/lib/utils'
import type { Recurrence, RecurrenceKind } from '@/types/database'

const KINDS: [RecurrenceKind, string][] = [
  ['expense_fixed', 'Despesa fixa'],
  ['expense_variable', 'Despesa variável'],
  ['income', 'Ganho'],
  ['card_purchase', 'No cartão'],
]

const optionalId = z.string().transform((v) => v || null)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data')

const schema = z
  .object({
    kind: z.enum(['expense_fixed', 'expense_variable', 'income', 'card_purchase']),
    description: z.string().trim().min(1, 'Informe uma descrição').max(120),
    amount: z.number({ required_error: 'Informe o valor', invalid_type_error: 'Informe o valor' }).int().positive('O valor deve ser maior que zero'),
    frequency: z.enum(['weekly', 'monthly', 'yearly']),
    interval_count: z.coerce.number().int().min(1).max(12),
    start_on: date,
    end_on: z.string().transform((v) => v || null),
    category_id: optionalId,
    subcategory_id: optionalId,
    bank_account_id: optionalId,
    card_id: optionalId,
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'card_purchase' && !v.card_id) ctx.addIssue({ code: 'custom', path: ['card_id'], message: 'Escolha o cartão' })
    if (v.end_on && v.end_on < v.start_on) ctx.addIssue({ code: 'custom', path: ['end_on'], message: 'Deve ser depois do início' })
  })
type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

function RecurrenceFormDialogContent({
  open,
  onClose,
  recurrence,
}: {
  open: boolean
  onClose: () => void
  recurrence?: Recurrence
}) {
  const accounts = useAccounts().data ?? []
  const cards = useCards().data ?? []
  const categories = useCategories().data ?? []
  const { save } = useRecurrenceMutations()
  const [today] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  // Valores iniciais: usados como "values" e para limpar o form ao fechar.
  const initialValues: FormInput = {
    kind: recurrence?.kind ?? 'expense_fixed',
    description: recurrence?.description ?? '',
    amount: recurrence?.amount ?? (undefined as unknown as number),
    frequency: recurrence?.frequency ?? 'monthly',
    interval_count: recurrence?.interval_count ?? 1,
    start_on: recurrence?.start_on ?? today,
    end_on: recurrence?.end_on ?? '',
    category_id: recurrence?.category_id ?? '',
    subcategory_id: recurrence?.subcategory_id ?? '',
    bank_account_id: recurrence?.bank_account_id ?? accounts[0]?.id ?? '',
    card_id: recurrence?.card_id ?? cards[0]?.id ?? '',
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
  const [kind, categoryId] = useWatch({ control: form.control, name: ['kind', 'category_id'] })
  const onCard = kind === 'card_purchase'
  const categoryOptions = categories.filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense'))
  const subOptions = categories.find((c) => c.id === categoryId)?.subcategories ?? []

  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync({
      id: recurrence?.id,
      ...values,
      bank_account_id: onCard ? null : values.bank_account_id,
      card_id: onCard ? values.card_id : null,
    })
    close()
  })

  return (
    <Dialog
      open={open}
      onClose={close}
      title={recurrence ? 'Editar recorrência' : 'Nova recorrência'}
      description={recurrence ? 'As ocorrências pendentes de hoje em diante serão refeitas com os novos valores.' : undefined}
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-1 sm:grid-cols-4" role="radiogroup" aria-label="Tipo">
              {KINDS.filter(([k]) => k !== 'card_purchase' || cards.length > 0).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={field.value === value}
                  onClick={() => {
                    field.onChange(value)
                    form.setValue('category_id', '')
                    form.setValue('subcategory_id', '')
                  }}
                  className={cn(
                    'rounded px-2 py-1.5 text-sm',
                    field.value === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Descrição" htmlFor="rec-desc" error={errors.description?.message} className="sm:col-span-2">
            <Input id="rec-desc" placeholder="Ex.: Aluguel, Salário, Netflix" {...form.register('description')} />
          </Field>
          <Field label="Valor" htmlFor="rec-amount" error={errors.amount?.message}>
            <Controller
              control={form.control}
              name="amount"
              render={({ field }) => <MoneyInput id="rec-amount" value={field.value ?? null} onChange={(v) => field.onChange(v ?? undefined)} />}
            />
          </Field>
          <Field label="Repete" htmlFor="rec-freq">
            <div className="flex gap-2">
              <Select aria-label="Intervalo" className="w-20" {...form.register('interval_count')}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? 'Todo' : `A cada ${n}`}
                  </option>
                ))}
              </Select>
              <div className="flex-1">
                <Select id="rec-freq" {...form.register('frequency')}>
                  <option value="monthly">mês</option>
                  <option value="weekly">semana</option>
                  <option value="yearly">ano</option>
                </Select>
              </div>
            </div>
          </Field>
          <Field label="Primeira ocorrência" htmlFor="rec-start" error={errors.start_on?.message}>
            <Input id="rec-start" type="date" {...form.register('start_on')} />
          </Field>
          <Field label="Termina em (opcional)" htmlFor="rec-end" error={errors.end_on?.message}>
            <Input id="rec-end" type="date" {...form.register('end_on')} />
          </Field>
          {onCard ? (
            <Field label="Cartão" htmlFor="rec-card" error={errors.card_id?.message} className="sm:col-span-2">
              <Select id="rec-card" {...form.register('card_id')}>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Conta" htmlFor="rec-account" className="sm:col-span-2">
              <Select id="rec-account" {...form.register('bank_account_id')}>
                <option value="">Sem conta</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id} data-color={a.color}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Categoria" htmlFor="rec-cat">
            <Select id="rec-cat" {...form.register('category_id', { onChange: () => form.setValue('subcategory_id', '') })}>
              <option value="">Sem categoria</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id} data-color={c.color}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subcategoria" htmlFor="rec-sub">
            <Select id="rec-sub" disabled={subOptions.length === 0} {...form.register('subcategory_id')}>
              <option value="">—</option>
              {subOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
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
export function RecurrenceFormDialog(props: Parameters<typeof RecurrenceFormDialogContent>[0]) {
  return props.open ? <RecurrenceFormDialogContent {...props} /> : null
}
