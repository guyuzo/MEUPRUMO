import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Field } from '@/components/shared/layout'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useDebtMutations } from '@/hooks/useDebts'
import { DEBT_TYPE_LABEL } from '@/lib/finance/labels'
import type { Debt } from '@/types/database'

const optionalText = z
  .string()
  .trim()
  .max(500)
  .transform((v) => v || null)
const optionalInt = z
  .union([z.literal(''), z.coerce.number().int().min(1, 'Mínimo 1').max(600)])
  .transform((v) => (v === '' ? null : v))

const schema = z.object({
  name: z.string().trim().min(1, 'Informe um nome').max(80),
  creditor: optionalText,
  type: z.enum(['loan', 'financing', 'credit_card', 'overdraft', 'personal', 'other']),
  original_amount: z.number({ required_error: 'Informe o valor', invalid_type_error: 'Informe o valor' }).int().positive('Informe o valor'),
  installment_amount: z.number().int().positive().nullable(),
  total_installments: optionalInt,
  interest_rate: z
    .union([z.literal(''), z.coerce.number().min(0).max(999)])
    .transform((v) => (v === '' ? null : v)),
  start_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: optionalText,
})
type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

function DebtFormDialogContent({ open, onClose, debt }: { open: boolean; onClose: () => void; debt?: Debt }) {
  const { save } = useDebtMutations()
  const [today] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  // Valores iniciais: usados como "values" e para limpar o form ao fechar.
  const initialValues: FormInput = {
    name: debt?.name ?? '',
    creditor: debt?.creditor ?? '',
    type: debt?.type ?? 'loan',
    original_amount: debt?.original_amount ?? (undefined as unknown as number),
    installment_amount: debt?.installment_amount ?? null,
    total_installments: debt?.total_installments ?? '',
    interest_rate: debt?.interest_rate ?? '',
    start_on: debt?.start_on ?? today,
    notes: debt?.notes ?? '',
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
    await save.mutateAsync({ id: debt?.id, ...values })
    close()
  })

  return (
    <Dialog open={open} onClose={close} title={debt ? 'Editar dívida' : 'Nova dívida'} className="max-w-lg">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" htmlFor="debt-name" error={errors.name?.message} className="sm:col-span-2">
            <Input id="debt-name" placeholder="Ex.: Financiamento do carro" {...form.register('name')} />
          </Field>
          <Field label="Tipo" htmlFor="debt-type">
            <Select id="debt-type" {...form.register('type')}>
              {Object.entries(DEBT_TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Credor" htmlFor="debt-creditor">
            <Input id="debt-creditor" placeholder="Banco, pessoa…" {...form.register('creditor')} />
          </Field>
          <Field label="Saldo devedor inicial" htmlFor="debt-original" error={errors.original_amount?.message}>
            <Controller
              control={form.control}
              name="original_amount"
              render={({ field }) => <MoneyInput id="debt-original" value={field.value ?? null} onChange={(v) => field.onChange(v ?? undefined)} />}
            />
          </Field>
          <Field label="Início do controle" htmlFor="debt-start">
            <Input id="debt-start" type="date" {...form.register('start_on')} />
          </Field>
          <Field label="Valor da parcela" htmlFor="debt-installment">
            <Controller
              control={form.control}
              name="installment_amount"
              render={({ field }) => <MoneyInput id="debt-installment" value={field.value} onChange={field.onChange} placeholder="Opcional" />}
            />
          </Field>
          <Field label="Parcelas restantes" htmlFor="debt-total" error={errors.total_installments?.message}>
            <Input id="debt-total" type="number" min={1} placeholder="Opcional" {...form.register('total_installments')} />
          </Field>
          <Field label="Juros ao mês (%)" htmlFor="debt-rate">
            <Input id="debt-rate" type="number" step="0.01" min={0} placeholder="Opcional" {...form.register('interest_rate')} />
          </Field>
          <Field label="Observações" htmlFor="debt-notes" className="sm:col-span-2">
            <Input id="debt-notes" {...form.register('notes')} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Com valor e número de parcelas, o progresso é contado por parcelas pagas. Sem eles, pelo valor pago.
        </p>
        <div className="flex justify-end gap-2">
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
export function DebtFormDialog(props: Parameters<typeof DebtFormDialogContent>[0]) {
  return props.open ? <DebtFormDialogContent {...props} /> : null
}
