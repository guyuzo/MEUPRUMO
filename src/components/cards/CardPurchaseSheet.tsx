import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Sheet } from '@/components/ui/sheet'
import { useCardMutations, useCards } from '@/hooks/useCards'
import { useMembers } from '@/hooks/useFamily'
import { useCategories } from '@/hooks/usePlanning'
import { useTransactionMutations } from '@/hooks/useTransactions'
import { formatMonth } from '@/lib/dates'
import { invoiceDates, splitInstallments } from '@/lib/finance/invoice'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types/database'

const optionalId = z.string().transform((v) => v || null)

const schema = z.object({
  card_id: z.string().min(1, 'Escolha o cartão'),
  kind: z.enum(['card_purchase', 'card_refund']),
  description: z.string().trim().min(1, 'Informe uma descrição').max(100),
  amount: z.number({ required_error: 'Informe o valor', invalid_type_error: 'Informe o valor' }).int().positive('O valor deve ser maior que zero'),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data'),
  installments: z.coerce.number().int().min(1).max(72),
  category_id: optionalId,
  subcategory_id: optionalId,
  household_member_id: optionalId,
  notes: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null),
})
type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

/** Compra/estorno no cartão. Na criação permite parcelar; na edição altera só aquela parcela. */
function CardPurchaseSheetContent({
  open,
  onClose,
  transaction,
  defaultCardId,
  defaultKind = 'card_purchase',
}: {
  open: boolean
  onClose: () => void
  transaction?: Transaction
  defaultCardId?: string
  defaultKind?: 'card_purchase' | 'card_refund'
}) {
  const cards = useCards().data ?? []
  const categories = useCategories().data ?? []
  const members = useMembers().data ?? []
  const { savePurchase, deletePlan } = useCardMutations()
  const { deleteTransaction } = useTransactionMutations()
  const [confirm, setConfirm] = useState<'one' | 'plan' | null>(null)
  const [today] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  // Valores iniciais: usados como "values" e para limpar o form ao fechar.
  const initialValues: FormInput = {
    card_id: transaction?.card_id ?? defaultCardId ?? cards[0]?.id ?? '',
    kind: (transaction?.kind as 'card_purchase' | 'card_refund') ?? defaultKind,
    description: transaction?.description ?? '',
    amount: transaction?.amount ?? (undefined as unknown as number),
    occurred_on: transaction?.occurred_on ?? today,
    installments: 1,
    category_id: transaction?.category_id ?? '',
    subcategory_id: transaction?.subcategory_id ?? '',
    household_member_id: transaction?.household_member_id ?? '',
    notes: transaction?.notes ?? '',
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
  const [cardId, kind, amount, occurredOn, installments, categoryId] = useWatch({
    control: form.control,
    name: ['card_id', 'kind', 'amount', 'occurred_on', 'installments', 'category_id'],
  })

  const card = cards.find((c) => c.id === cardId)
  const count = Number(installments) || 1
  const preview =
    card && /^\d{4}-\d{2}-\d{2}$/.test(occurredOn) ? invoiceDates(occurredOn, card.closing_day, card.due_day) : null
  const parts = amount > 0 && count > 1 ? splitInstallments(amount, count) : null
  const expenseCategories = categories.filter((c) => c.kind === 'expense')
  const subOptions = categories.find((c) => c.id === categoryId)?.subcategories ?? []

  const onSubmit = form.handleSubmit(async (values) => {
    await savePurchase.mutateAsync({ id: transaction?.id, ...values })
    close()
  })

  return (
    <Sheet
      open={open}
      onClose={close}
      title={transaction ? 'Editar lançamento' : 'Lançamento no cartão'}
      footer={
        <div className="flex items-center gap-2">
          {transaction && (
            <Button variant="ghost" size="icon" onClick={() => setConfirm(transaction.installment_plan_id ? 'plan' : 'one')} aria-label="Excluir">
              <Trash2 />
            </Button>
          )}
          <Button variant="outline" className="ml-auto" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            Salvar
          </Button>
        </div>
      }
    >
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">Cadastre um cartão primeiro.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Controller
            control={form.control}
            name="kind"
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-1" role="radiogroup" aria-label="Tipo">
                {(
                  [
                    ['card_purchase', 'Compra'],
                    ['card_refund', 'Estorno'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={field.value === value}
                    onClick={() => field.onChange(value)}
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

          <div className="space-y-1.5">
            <Label htmlFor="cp-card">Cartão</Label>
            <Select id="cp-card" {...form.register('card_id')}>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.last_four ? ` •••• ${c.last_four}` : ''}
                </option>
              ))}
            </Select>
            <FieldError message={errors.card_id?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-amount">{count > 1 ? 'Valor total' : 'Valor'}</Label>
            <Controller
              control={form.control}
              name="amount"
              render={({ field }) => (
                <MoneyInput
                  id="cp-amount"
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? undefined)}
                  className="h-12 text-lg font-semibold"
                />
              )}
            />
            <FieldError message={errors.amount?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-desc">Descrição</Label>
            <Input id="cp-desc" placeholder="Ex.: Tênis" {...form.register('description')} />
            <FieldError message={errors.description?.message} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-date">Data da compra</Label>
              <Input id="cp-date" type="date" {...form.register('occurred_on')} />
              <FieldError message={errors.occurred_on?.message} />
            </div>
            {!transaction && kind === 'card_purchase' && (
              <div className="space-y-1.5">
                <Label htmlFor="cp-inst">Parcelas</Label>
                <Select id="cp-inst" {...form.register('installments')}>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? 'À vista' : `${n}x`}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {preview && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {count > 1 ? 'A 1ª parcela entra' : 'Entra'} na fatura de{' '}
              <span className="font-medium text-foreground">{formatMonth(preview.referenceMonth)}</span>{' '}
              (vence {format(new Date(`${preview.dueOn}T00:00`), 'dd/MM')}).
              {parts && ` ${count}x de ${formatCents(parts[1])}${parts[0] !== parts[1] ? ` (1ª de ${formatCents(parts[0])})` : ''}.`}
            </p>
          )}
          {transaction?.installment_plan_id && (
            <p className="text-xs text-muted-foreground">
              Esta é a parcela {transaction.installment_number}. Alterações valem só para ela.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-cat">Categoria</Label>
              <Select id="cp-cat" {...form.register('category_id', { onChange: () => form.setValue('subcategory_id', '') })}>
                <option value="">Sem categoria</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id} data-color={c.color}>
                    {c.emoji} {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-sub">Subcategoria</Label>
              <Select id="cp-sub" disabled={subOptions.length === 0} {...form.register('subcategory_id')}>
                <option value="">—</option>
                {subOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {members.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-member">De quem é</Label>
              <Select id="cp-member" {...form.register('household_member_id')}>
                <option value="">Da casa (todos)</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cp-notes">Observações</Label>
            <textarea
              id="cp-notes"
              rows={2}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...form.register('notes')}
            />
          </div>
          <button type="submit" hidden />
        </form>
      )}

      {transaction && (
        <>
          <ConfirmDialog
            open={confirm === 'one'}
            onClose={() => setConfirm(null)}
            pending={deleteTransaction.isPending}
            onConfirm={() => deleteTransaction.mutate(transaction.id, { onSuccess: () => (setConfirm(null), close()) })}
            title="Excluir lançamento?"
            description={`"${transaction.description}" será removido da fatura.`}
          />
          <ConfirmDialog
            open={confirm === 'plan'}
            onClose={() => setConfirm(null)}
            pending={deletePlan.isPending}
            onConfirm={() =>
              transaction.installment_plan_id &&
              deletePlan.mutate(transaction.installment_plan_id, { onSuccess: () => (setConfirm(null), close()) })
            }
            title="Excluir o parcelamento inteiro?"
            description="Todas as parcelas desta compra serão removidas de todas as faturas."
            confirmLabel="Excluir todas as parcelas"
          />
        </>
      )}
    </Sheet>
  )
}

/** Monta o formulário só quando aberto: cada abertura começa limpa (sem valores da anterior). */
export function CardPurchaseSheet(props: Parameters<typeof CardPurchaseSheetContent>[0]) {
  return props.open ? <CardPurchaseSheetContent {...props} /> : null
}
