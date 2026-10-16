import { zodResolver } from '@hookform/resolvers/zod'
import { format, getDaysInMonth, parseISO } from 'date-fns'
import {
  ArrowRightLeft,
  Banknote,
  Calendar,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  DollarSign,
  FileText,
  Hash,
  Landmark,
  Layers,
  Plus,
  StickyNote,
  Tag,
  Trash2,
  User,
} from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { CardFormDialog } from '@/components/cards/CardFormDialog'
import { equalSplit, SplitEditor, splitsTotal, type SplitDraft } from '@/components/family/MemberSplitField'
import { CategoryPicker } from '@/components/planning/CategoryPicker'
import { Dropdown } from '@/components/ui/dropdown'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { CheckChip, FormRow, rowInputClass, RowSelect, Toggle } from '@/components/ui/form-row'
import { FieldError } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { useAccounts } from '@/hooks/useAccounts'
import { useCardMutations, useCards } from '@/hooks/useCards'
import { useMembers, useSplits } from '@/hooks/useFamily'
import { useCategories } from '@/hooks/usePlanning'
import { useTransactionMutations } from '@/hooks/useTransactions'
import { formatMonthTitle } from '@/lib/dates'
import { invoiceDates, invoiceOffset, referenceFromOffset, splitInstallments } from '@/lib/finance/invoice'
import { EXPENSE_METHODS, INCOME_METHODS, PAYMENT_METHOD_LABEL, TX_KIND_LABEL, type ManualKind } from '@/lib/finance/labels'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { PaymentMethod, Transaction, TxKind } from '@/types/database'

type Mode = 'expense' | 'income' | 'transfer'

const EDITABLE_KINDS: TxKind[] = ['expense_fixed', 'expense_variable', 'income', 'transfer', 'card_purchase']
const optionalId = z.string().transform((v) => v || null)

const schema = z
  .object({
    mode: z.enum(['expense', 'income', 'transfer']),
    expense_type: z.enum(['variable', 'fixed']),
    payment_method: z.enum(['credit', 'debit', 'pix', 'cash', 'boleto', 'transfer', 'other']),
    description: z.string().trim().min(1, 'Informe uma descrição').max(120),
    amount: z
      .number({ required_error: 'Informe o valor', invalid_type_error: 'Informe o valor' })
      .int()
      .positive('O valor deve ser maior que zero'),
    occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data'),
    paid: z.boolean(),
    due_on: z.string(),
    notes: z
      .string()
      .trim()
      .max(500)
      .transform((v) => v || null),
    category_id: optionalId,
    subcategory_id: optionalId,
    bank_account_id: optionalId,
    destination_account_id: optionalId,
    card_id: optionalId,
    household_member_id: optionalId,
    is_installment: z.boolean(),
    installments: z.coerce.number().int().min(2).max(24),
    /** '' = fatura automática; '0' | '1' | '2' = meses após a compra. */
    invoice_offset: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'transfer') {
      if (!v.bank_account_id) ctx.addIssue({ code: 'custom', path: ['bank_account_id'], message: 'Escolha a conta de origem' })
      if (!v.destination_account_id) ctx.addIssue({ code: 'custom', path: ['destination_account_id'], message: 'Escolha a conta de destino' })
      if (v.bank_account_id && v.bank_account_id === v.destination_account_id)
        ctx.addIssue({ code: 'custom', path: ['destination_account_id'], message: 'Origem e destino devem ser diferentes' })
    }
    if (v.mode === 'expense' && v.payment_method === 'credit') {
      if (!v.card_id) ctx.addIssue({ code: 'custom', path: ['card_id'], message: 'Escolha o cartão' })
      if (v.is_installment && v.amount < v.installments)
        ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Valor pequeno demais para parcelar' })
    }
  })
type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

function modeOf(kind?: TxKind): Mode {
  return kind === 'income' ? 'income' : kind === 'transfer' ? 'transfer' : 'expense'
}

function kindOf(v: Pick<FormOutput, 'mode' | 'payment_method' | 'expense_type'>): TxKind {
  if (v.mode === 'income') return 'income'
  if (v.mode === 'transfer') return 'transfer'
  if (v.payment_method === 'credit') return 'card_purchase'
  return v.expense_type === 'fixed' ? 'expense_fixed' : 'expense_variable'
}

/** Dia de vencimento da fatura de um mês de referência ("10/11"). */
function dueLabel(reference: string, dueDay: number) {
  const day = Math.min(dueDay, getDaysInMonth(parseISO(reference)))
  return `${String(day).padStart(2, '0')}/${reference.slice(5, 7)}`
}

export interface TransactionDefaults {
  kind?: ManualKind
  bank_account_id?: string
  payment_method?: PaymentMethod
  card_id?: string
}

/** Lançamento de despesa (inclusive no cartão), ganho ou transferência. */
function TransactionFormSheetContent({
  open,
  onClose,
  transaction,
  defaults,
}: {
  open: boolean
  onClose: () => void
  transaction?: Transaction
  defaults?: TransactionDefaults
}) {
  const { saveTransaction, deleteTransaction } = useTransactionMutations()
  const { deletePlan } = useCardMutations()
  const accounts = useAccounts().data ?? []
  const cards = useCards().data ?? []
  const categories = useCategories().data ?? []
  const members = useMembers().data ?? []
  const existingSplits = useSplits(transaction ? [transaction.id] : []).data ?? []
  const [confirm, setConfirm] = useState<'one' | 'plan' | null>(null)
  // Fixado na montagem para os `values` não mudarem (e resetarem o form) a cada render.
  const [today] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  const editable = !transaction || EDITABLE_KINDS.includes(transaction.kind)
  const isParcel = Boolean(transaction?.installment_plan_id)
  const defaultMode = modeOf(transaction?.kind ?? defaults?.kind)

  // Rascunho da divisão vale só para a transação aberta; sem rascunho, mostra o que está salvo.
  const draftKey = transaction?.id ?? 'new'
  const [splitDraft, setSplitDraft] = useState<{ key: string; splits: SplitDraft[] | null }>()
  const savedSplits = existingSplits.length
    ? existingSplits.map((s) => ({ member_id: s.member_id, percentage: Number(s.percentage) }))
    : null
  const splits = splitDraft?.key === draftKey ? splitDraft.splits : savedSplits
  const setSplits = (next: SplitDraft[] | null) => setSplitDraft({ key: draftKey, splits: next })

  // Valores iniciais: usados como "values" e para limpar o form ao fechar.
  const initialValues: FormInput = {
    mode: defaultMode,
    expense_type: (transaction?.kind ?? defaults?.kind) === 'expense_fixed' ? 'fixed' : 'variable',
    payment_method:
      transaction?.payment_method ??
      (transaction?.kind === 'card_purchase' ? 'credit' : undefined) ??
      defaults?.payment_method ??
      (defaultMode === 'income' ? 'pix' : cards.length > 0 ? 'credit' : 'debit'),
    description: transaction?.description ?? '',
    amount: transaction?.amount ?? (undefined as unknown as number),
    occurred_on: transaction?.occurred_on ?? today,
    paid: transaction ? transaction.status === 'paid' : true,
    due_on: transaction?.due_on ?? '',
    notes: transaction?.notes ?? '',
    category_id: transaction?.category_id ?? '',
    subcategory_id: transaction?.subcategory_id ?? '',
    bank_account_id: transaction?.bank_account_id ?? defaults?.bank_account_id ?? accounts[0]?.id ?? '',
    destination_account_id: transaction?.destination_account_id ?? '',
    card_id: transaction?.card_id ?? defaults?.card_id ?? cards[0]?.id ?? '',
    household_member_id: transaction?.household_member_id ?? '',
    is_installment: false,
    installments: 2,
    invoice_offset: transaction?.invoice_month ? String(invoiceOffset(transaction.occurred_on, transaction.invoice_month)) : '',
  }
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    // Dados que chegam depois (contas, cartões) não apagam o que o usuário já digitou.
    resetOptions: { keepDirtyValues: true },
    values: initialValues,
  })
  const { errors, isSubmitting } = form.formState
  const close = () => {
    form.reset(initialValues)
    setSplitDraft(undefined)
    onClose()
  }

  const [mode, method, amount, occurredOn, paid, cardId, categoryId, subcategoryId, isInstallment, installments, invoiceOffsetValue] =
    useWatch({
      control: form.control,
      name: [
        'mode',
        'payment_method',
        'amount',
        'occurred_on',
        'paid',
        'card_id',
        'category_id',
        'subcategory_id',
        'is_installment',
        'installments',
        'invoice_offset',
      ],
    })
  const onCredit = mode === 'expense' && method === 'credit'
  const card = cards.find((c) => c.id === cardId)
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(occurredOn)

  // Fatura: automática pelos dias do cartão, ou escolhida em "Fatura em".
  const auto = onCredit && card && validDate ? invoiceDates(occurredOn, card.closing_day, card.due_day) : null
  const autoOffset = auto ? invoiceOffset(occurredOn, auto.referenceMonth) : 0
  const chosenOffset = invoiceOffsetValue === '' ? autoOffset : Number(invoiceOffsetValue)
  const reference = auto ? referenceFromOffset(occurredOn, chosenOffset) : null
  const parts = onCredit && isInstallment && amount > 0 ? splitInstallments(amount, Number(installments) || 2) : null

  const categoryOptions = categories.filter((c) => c.kind === (mode === 'income' ? 'income' : 'expense'))
  const [cardFormOpen, setCardFormOpen] = useState(false)
  const methods = mode === 'income' ? INCOME_METHODS : EXPENSE_METHODS

  const onSubmit = form.handleSubmit(async (v) => {
    const kind = kindOf(v)
    const useSplitsNow = v.mode !== 'transfer' && splits !== null
    if (useSplitsNow && (splits.length === 0 || splitsTotal(splits) !== 100)) {
      form.setError('root', { message: 'A divisão precisa somar 100%.' })
      return
    }
    const credit = kind === 'card_purchase'
    // Só grava a fatura escolhida se for diferente da automática.
    const invoiceMonth =
      credit && auto && v.invoice_offset !== '' && Number(v.invoice_offset) !== autoOffset
        ? referenceFromOffset(v.occurred_on, Number(v.invoice_offset))
        : null

    await saveTransaction.mutateAsync({
      id: transaction?.id,
      kind,
      description: v.description,
      amount: v.amount,
      occurred_on: v.occurred_on,
      status: credit || v.paid ? 'paid' : 'pending',
      due_on: credit || v.paid ? null : v.due_on || v.occurred_on,
      notes: v.notes,
      category_id: v.mode === 'transfer' ? null : v.category_id,
      subcategory_id: v.mode === 'transfer' ? null : v.subcategory_id,
      bank_account_id: credit ? null : v.bank_account_id,
      destination_account_id: v.mode === 'transfer' ? v.destination_account_id : null,
      household_member_id: useSplitsNow || v.mode === 'transfer' ? null : v.household_member_id,
      payment_method: v.mode === 'transfer' ? 'transfer' : v.payment_method,
      card_id: credit ? v.card_id : null,
      invoice_month: invoiceMonth,
      installments: credit && v.is_installment && !transaction ? v.installments : 1,
      // Só chama a RPC quando há divisão nova ou havia uma salva para remover.
      splits: useSplitsNow ? splits : savedSplits ? null : undefined,
    })
    close()
  })

  const setMode = (next: Mode) => {
    form.setValue('mode', next, { shouldDirty: true })
    form.setValue('category_id', '', { shouldDirty: true })
    form.setValue('subcategory_id', '', { shouldDirty: true })
    if (next === 'income' && method === 'credit') form.setValue('payment_method', 'pix', { shouldDirty: true })
  }

  const accountOptions = accounts.map((a) => (
    <option key={a.id} value={a.id} data-color={a.color}>
      {a.name}
    </option>
  ))

  return (
    <Sheet
      open={open}
      onClose={close}
      title={transaction ? 'Editar lançamento' : 'Novo lançamento'}
      footer={
        <div className="flex items-center gap-2">
          {transaction && (
            <Button variant="ghost" size="icon" onClick={() => setConfirm(isParcel ? 'plan' : 'one')} aria-label="Excluir">
              <Trash2 />
            </Button>
          )}
          <Button variant="outline" className="ml-auto" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting || !editable}>
            Salvar
          </Button>
        </div>
      }
    >
      {!editable ? (
        <p className="text-sm text-muted-foreground">{TX_KIND_LABEL[transaction!.kind]} — edite pelo módulo de origem.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1" role="radiogroup" aria-label="Tipo de lançamento">
            {(
              [
                ['expense', 'Despesa'],
                ['income', 'Ganho'],
                ['transfer', 'Transferência'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                disabled={isParcel}
                onClick={() => setMode(value)}
                className={cn(
                  'rounded-lg px-2 py-2 text-sm font-medium',
                  mode === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <FormRow icon={FileText} label="Descrição" htmlFor="tx-desc" error={errors.description?.message}>
            <input id="tx-desc" className={rowInputClass} placeholder="Ex.: Mercado" maxLength={120} {...form.register('description')} />
          </FormRow>

          <FormRow icon={DollarSign} label={onCredit && isInstallment ? 'Valor total' : 'Valor'} htmlFor="tx-amount" error={errors.amount?.message}>
            <Controller
              control={form.control}
              name="amount"
              render={({ field }) => (
                <MoneyInput
                  id="tx-amount"
                  bare
                  placeholder="Ex.: 1.000,00"
                  className="text-sm font-medium"
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? undefined)}
                />
              )}
            />
          </FormRow>

          {mode !== 'transfer' && (
            <FormRow icon={Banknote} label={mode === 'income' ? 'Forma de recebimento' : 'Forma de Pagamento'} htmlFor="tx-method">
              <RowSelect id="tx-method" disabled={isParcel} {...form.register('payment_method')}>
                {methods.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
              </RowSelect>
            </FormRow>
          )}

          {mode === 'expense' && !onCredit && (
            <FormRow icon={Layers} label="Tipo de despesa">
              <Controller
                control={form.control}
                name="expense_type"
                render={({ field }) => (
                  <div className="flex gap-4" role="radiogroup" aria-label="Tipo de despesa">
                    <CheckChip checked={field.value === 'variable'} onClick={() => field.onChange('variable')}>
                      Variável
                    </CheckChip>
                    <CheckChip checked={field.value === 'fixed'} onClick={() => field.onChange('fixed')}>
                      Fixa
                    </CheckChip>
                  </div>
                )}
              />
            </FormRow>
          )}

          {onCredit ? (
            <>
              <FormRow icon={CreditCard} label="Cartão" htmlFor="tx-card" error={errors.card_id?.message}>
                {cards.length === 0 ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setCardFormOpen(true)}>
                    <Plus /> Cadastrar cartão
                  </Button>
                ) : (
                  <Controller
                    control={form.control}
                    name="card_id"
                    render={({ field }) => (
                      <Dropdown
                        id="tx-card"
                        variant="row"
                        disabled={isParcel}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        placeholder="Escolher"
                        options={cards.map((c) => ({
                          value: c.id,
                          label: c.name,
                          color: c.color,
                          description: [c.bank, c.last_four && `•••• ${c.last_four}`, `fecha dia ${c.closing_day}`].filter(Boolean).join(' · '),
                        }))}
                        footer={(closeList) => (
                          <button
                            type="button"
                            onClick={() => {
                              closeList()
                              setCardFormOpen(true)
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-primary hover:bg-muted"
                          >
                            <Plus className="size-4" /> Cadastrar cartão
                          </button>
                        )}
                      />
                    )}
                  />
                )}
              </FormRow>
              <FormRow icon={Calendar} label="Data da compra" htmlFor="tx-date" error={errors.occurred_on?.message}>
                <input id="tx-date" type="date" className={cn(rowInputClass, 'w-auto')} {...form.register('occurred_on')} />
              </FormRow>
              {auto && reference && card && (
                <>
                  <FormRow icon={CalendarDays} label="Fatura em">
                    <div className="flex flex-wrap justify-end gap-x-4 gap-y-1" role="radiogroup" aria-label="Fatura em">
                      {(['Mês da compra', 'Mês seguinte', '2 meses'] as const).map((label, offset) => (
                        <CheckChip
                          key={label}
                          checked={chosenOffset === offset}
                          onClick={() => form.setValue('invoice_offset', String(offset), { shouldDirty: true })}
                        >
                          {label}
                        </CheckChip>
                      ))}
                    </div>
                  </FormRow>
                  <div className="rounded-xl bg-primary/10 px-4 py-3 text-sm">
                    Cobrando em: <span className="font-semibold">Fatura de {formatMonthTitle(reference).replace(' de ', '/')}</span>
                    <span className="text-muted-foreground"> · vence {dueLabel(reference, card.due_day)}</span>
                    {chosenOffset !== autoOffset && (
                      <button
                        type="button"
                        className="ml-2 text-xs text-primary hover:underline"
                        onClick={() => form.setValue('invoice_offset', '', { shouldDirty: true })}
                      >
                        usar automática
                      </button>
                    )}
                  </div>
                </>
              )}
              {!transaction && (
                <div className="flex items-center gap-3 px-1 py-1 text-sm">
                  <Controller
                    control={form.control}
                    name="is_installment"
                    render={({ field }) => (
                      <Toggle id="tx-is-installment" checked={field.value} onChange={field.onChange} label="Esta despesa é um parcelamento?" />
                    )}
                  />
                  <label htmlFor="tx-is-installment">Esta despesa é um parcelamento?</label>
                </div>
              )}
              {!transaction && isInstallment && (
                <FormRow icon={Hash} label="Parcelas" htmlFor="tx-installments">
                  {parts && (
                    <span className="text-xs text-muted-foreground">
                      de {formatCents(parts[1])}
                      {parts[0] !== parts[1] && ` (1ª ${formatCents(parts[0])})`}
                    </span>
                  )}
                  <RowSelect id="tx-installments" {...form.register('installments')}>
                    {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => (
                      <option key={n} value={n}>
                        {n}x
                      </option>
                    ))}
                  </RowSelect>
                </FormRow>
              )}
              {isParcel && (
                <p className="px-1 text-xs text-muted-foreground">
                  Parcela {transaction!.installment_number} de um parcelamento: as alterações valem só para ela.
                </p>
              )}
            </>
          ) : (
            <>
              {mode === 'transfer' ? (
                <>
                  <FormRow icon={Landmark} label="De" htmlFor="tx-account" error={errors.bank_account_id?.message}>
                    <RowSelect id="tx-account" {...form.register('bank_account_id')}>
                      <option value="">Escolha…</option>
                      {accountOptions}
                    </RowSelect>
                  </FormRow>
                  <FormRow icon={ArrowRightLeft} label="Para" htmlFor="tx-dest" error={errors.destination_account_id?.message}>
                    <RowSelect id="tx-dest" {...form.register('destination_account_id')}>
                      <option value="">Escolha…</option>
                      {accountOptions}
                    </RowSelect>
                  </FormRow>
                </>
              ) : (
                <FormRow icon={Landmark} label="Conta" htmlFor="tx-account">
                  <RowSelect id="tx-account" {...form.register('bank_account_id')}>
                    <option value="">Sem conta</option>
                    {accountOptions}
                  </RowSelect>
                </FormRow>
              )}
              <FormRow icon={Calendar} label="Data" htmlFor="tx-date" error={errors.occurred_on?.message}>
                <input id="tx-date" type="date" className={cn(rowInputClass, 'w-auto')} {...form.register('occurred_on')} />
              </FormRow>
              <FormRow icon={CheckCircle2} label={mode === 'income' ? 'Recebido' : mode === 'transfer' ? 'Efetivada' : 'Pago'}>
                <Controller
                  control={form.control}
                  name="paid"
                  render={({ field }) => <Toggle checked={field.value} onChange={field.onChange} label="Pago" />}
                />
              </FormRow>
              {!paid && (
                <FormRow icon={CalendarDays} label="Vencimento" htmlFor="tx-due">
                  <input id="tx-due" type="date" className={cn(rowInputClass, 'w-auto')} {...form.register('due_on')} />
                </FormRow>
              )}
            </>
          )}

          {mode !== 'transfer' && (
            <>
              <FormRow icon={Tag} label="Categoria" htmlFor="tx-cat">
                <CategoryPicker
                  id="tx-cat"
                  categories={categoryOptions}
                  categoryId={categoryId ?? ''}
                  subcategoryId={subcategoryId ?? ''}
                  onChange={(cat, sub) => {
                    form.setValue('category_id', cat, { shouldDirty: true })
                    form.setValue('subcategory_id', sub, { shouldDirty: true })
                  }}
                />
              </FormRow>

              {members.length > 1 && (
                <>
                  <FormRow icon={User} label="Corresponde" htmlFor="tx-member">
                    {splits === null && (
                      <RowSelect id="tx-member" {...form.register('household_member_id')}>
                        <option value="">—</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.full_name}
                          </option>
                        ))}
                      </RowSelect>
                    )}
                    <span className="shrink-0 text-sm text-muted-foreground">Dividir?</span>
                    <Toggle checked={splits !== null} onChange={(on) => setSplits(on ? equalSplit(members) : null)} label="Dividir entre pessoas" />
                  </FormRow>
                  {splits !== null && <SplitEditor members={members} splits={splits} onChange={setSplits} amount={amount} />}
                </>
              )}
            </>
          )}

          <FormRow icon={StickyNote} label="Anotação" htmlFor="tx-notes" stacked>
            <textarea
              id="tx-notes"
              rows={3}
              placeholder="Digite aqui…"
              className="w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
              {...form.register('notes')}
            />
          </FormRow>

          <FieldError message={errors.root?.message} />
          <button type="submit" hidden />
        </form>
      )}

      {/* Fora do <form> acima: <form> aninhado vira envio nativo e recarrega a página. */}
      <CardFormDialog open={cardFormOpen} onClose={() => setCardFormOpen(false)} />

      {transaction && (
        <>
          <ConfirmDialog
            open={confirm === 'one'}
            onClose={() => setConfirm(null)}
            pending={deleteTransaction.isPending}
            onConfirm={() =>
              deleteTransaction.mutate(transaction.id, {
                onSuccess: () => {
                  setConfirm(null)
                  close()
                },
              })
            }
            title="Excluir lançamento?"
            description={`"${transaction.description}" será removido permanentemente.`}
          />
          <ConfirmDialog
            open={confirm === 'plan'}
            onClose={() => setConfirm(null)}
            pending={deletePlan.isPending}
            onConfirm={() =>
              transaction.installment_plan_id &&
              deletePlan.mutate(transaction.installment_plan_id, {
                onSuccess: () => {
                  setConfirm(null)
                  close()
                },
              })
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
export function TransactionFormSheet(props: Parameters<typeof TransactionFormSheetContent>[0]) {
  return props.open ? <TransactionFormSheetContent {...props} /> : null
}
