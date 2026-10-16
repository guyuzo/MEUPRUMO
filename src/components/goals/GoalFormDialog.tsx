import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Field } from '@/components/shared/layout'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { ColorPicker, EmojiPicker } from '@/components/shared/pickers'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useGoalMutations } from '@/hooks/useGoals'
import type { Goal } from '@/types/database'

const schema = z.object({
  name: z.string().trim().min(1, 'Informe um nome').max(80),
  emoji: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  target_amount: z.number({ required_error: 'Informe o valor', invalid_type_error: 'Informe o valor' }).int().positive('Informe o valor'),
  target_date: z.string().transform((v) => v || null),
})
type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

function GoalFormDialogContent({ open, onClose, goal }: { open: boolean; onClose: () => void; goal?: Goal }) {
  const { saveGoal } = useGoalMutations()
  // Valores iniciais: usados como "values" e para limpar o form ao fechar.
  const initialValues: FormInput = {
    name: goal?.name ?? '',
    emoji: goal?.emoji ?? '🎯',
    color: goal?.color ?? '#f59e0b',
    target_amount: goal?.target_amount ?? (undefined as unknown as number),
    target_date: goal?.target_date ?? '',
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
    await saveGoal.mutateAsync({ id: goal?.id, ...values })
    close()
  })

  return (
    <Dialog open={open} onClose={close} title={goal ? 'Editar meta' : 'Nova meta'}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nome" htmlFor="goal-name" error={errors.name?.message}>
          <Input id="goal-name" placeholder="Ex.: Viagem, Reserva de emergência" {...form.register('name')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quanto quer juntar" htmlFor="goal-target" error={errors.target_amount?.message}>
            <Controller
              control={form.control}
              name="target_amount"
              render={({ field }) => <MoneyInput id="goal-target" value={field.value ?? null} onChange={(v) => field.onChange(v ?? undefined)} />}
            />
          </Field>
          <Field label="Até quando (opcional)" htmlFor="goal-date">
            <Input id="goal-date" type="date" {...form.register('target_date')} />
          </Field>
        </div>
        <Field label="Ícone">
          <Controller control={form.control} name="emoji" render={({ field }) => <EmojiPicker value={field.value} onChange={field.onChange} />} />
        </Field>
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
export function GoalFormDialog(props: Parameters<typeof GoalFormDialogContent>[0]) {
  return props.open ? <GoalFormDialogContent {...props} /> : null
}
