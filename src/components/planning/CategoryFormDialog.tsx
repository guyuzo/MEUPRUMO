import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { CategoryIconPicker } from '@/components/planning/CategoryIcon'
import { ColorPicker } from '@/components/shared/pickers'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { useCategoryMutations, type CategoryWithSubs } from '@/hooks/usePlanning'
import { categoryIconKey } from '@/lib/categoryIcons'
import type { CategoryKind } from '@/types/database'

const schema = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(60),
  emoji: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})
type Values = z.infer<typeof schema>

function CategoryFormDialogContent({
  open,
  onClose,
  kind,
  category,
  nextSortOrder,
}: {
  open: boolean
  onClose: () => void
  kind: CategoryKind
  category?: CategoryWithSubs
  nextSortOrder: number
}) {
  const { saveCategory } = useCategoryMutations()
  // Valores iniciais: usados como "values" e para limpar o form ao fechar.
  const initialValues: Values = {
    name: category?.name ?? '',
    emoji: categoryIconKey(category?.emoji) ?? (kind === 'income' ? 'coins' : 'tag'),
    color: category?.color ?? '#6366f1',
  }
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    // Dados que chegam depois (ex.: contas) não apagam o que o usuário já digitou.
    resetOptions: { keepDirtyValues: true },
    values: initialValues,
  })
  const color = form.watch('color')
  const close = () => {
    form.reset(initialValues)
    onClose()
  }

  const onSubmit = form.handleSubmit(async (values) => {
    await saveCategory.mutateAsync(
      category ? { id: category.id, kind, ...values } : { kind, sort_order: nextSortOrder, ...values },
    )
    close()
  })

  return (
    <Dialog open={open} onClose={close} title={category ? 'Editar categoria' : 'Nova categoria'}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="category-name">Nome</Label>
          <Input id="category-name" autoFocus {...form.register('name')} />
          <FieldError message={form.formState.errors.name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label>Ícone</Label>
          <Controller
            control={form.control}
            name="emoji"
            render={({ field }) => <CategoryIconPicker value={field.value} color={color} onChange={field.onChange} />}
          />
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
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Monta o formulário só quando aberto: cada abertura começa limpa (sem valores da anterior). */
export function CategoryFormDialog(props: Parameters<typeof CategoryFormDialogContent>[0]) {
  return props.open ? <CategoryFormDialogContent {...props} /> : null
}
