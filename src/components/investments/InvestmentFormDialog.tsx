import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Field } from '@/components/shared/layout'
import { ColorPicker } from '@/components/shared/pickers'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useInvestmentMutations } from '@/hooks/useInvestments'
import { INVESTMENT_TYPE_LABEL } from '@/lib/finance/labels'
import type { Investment } from '@/types/database'

const schema = z.object({
  name: z.string().trim().min(1, 'Informe um nome').max(80),
  type: z.enum(['fixed_income', 'stocks', 'funds', 'crypto', 'pension', 'savings', 'other']),
  institution: z
    .string()
    .trim()
    .max(60)
    .transform((v) => v || null),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})
type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

function InvestmentFormDialogContent({
  open,
  onClose,
  investment,
}: {
  open: boolean
  onClose: () => void
  investment?: Investment
}) {
  const { save } = useInvestmentMutations()
  // Valores iniciais: usados como "values" e para limpar o form ao fechar.
  const initialValues: FormInput = {
    name: investment?.name ?? '',
    type: investment?.type ?? 'fixed_income',
    institution: investment?.institution ?? '',
    color: investment?.color ?? '#10b981',
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
    await save.mutateAsync({ id: investment?.id, ...values })
    close()
  })

  return (
    <Dialog
      open={open}
      onClose={close}
      title={investment ? 'Editar investimento' : 'Novo investimento'}
      description={investment ? undefined : 'Depois de criar, registre aportes e atualize o valor atual quando quiser.'}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nome" htmlFor="inv-name" error={errors.name?.message}>
          <Input id="inv-name" placeholder="Ex.: CDB 110% CDI, Tesouro Selic" {...form.register('name')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo" htmlFor="inv-type">
            <Select id="inv-type" {...form.register('type')}>
              {Object.entries(INVESTMENT_TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Instituição" htmlFor="inv-inst">
            <Input id="inv-inst" placeholder="Opcional" {...form.register('institution')} />
          </Field>
        </div>
        <Field label="Cor">
          <Controller control={form.control} name="color" render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />} />
        </Field>
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
export function InvestmentFormDialog(props: Parameters<typeof InvestmentFormDialogContent>[0]) {
  return props.open ? <InvestmentFormDialogContent {...props} /> : null
}
