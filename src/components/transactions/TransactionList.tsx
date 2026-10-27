import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeftRight, CheckCircle2, ChevronRight, Circle, Tag, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { BankLogo } from '@/components/cards/BankLogo'
import { CategoryIcon } from '@/components/planning/CategoryIcon'
import { CategoryPicker } from '@/components/planning/CategoryPicker'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Dropdown } from '@/components/ui/dropdown'
import { useAccounts } from '@/hooks/useAccounts'
import { useCards } from '@/hooks/useCards'
import { useMembers } from '@/hooks/useFamily'
import { usePermission } from '@/hooks/useHousehold'
import { useCategories, type CategoryWithSubs } from '@/hooks/usePlanning'
import { useTransactionMutations } from '@/hooks/useTransactions'
import { PAYMENT_METHOD_LABEL, TX_KIND_LABEL } from '@/lib/finance/labels'
import type { Totals } from '@/lib/finance/totals'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Card as CreditCardT, HouseholdMember, Transaction } from '@/types/database'

export function TotalsBar({ totals }: { totals: Totals }) {
  return (
    // No celular vira um cartão com três linhas (valores grandes não cabem em 3 colunas).
    <Card className="grid gap-2 p-4 sm:grid-cols-3 sm:gap-4">
      {(
        [
          ['Entradas', totals.inflow, 'text-income'],
          ['Saídas', totals.outflow, 'text-expense'],
          ['Resultado', totals.net, totals.net < 0 ? 'text-expense' : 'text-income'],
        ] as const
      ).map(([label, value, color]) => (
        <div key={label} className="flex items-baseline justify-between gap-2 sm:block">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn('font-semibold tabular-nums sm:mt-1', color)}>{formatCents(value)}</p>
        </div>
      ))}
    </Card>
  )
}

/** Lista agrupada por dia. `accountId` define o sinal das transferências na visão de uma conta. */
export function TransactionList({
  transactions,
  loading,
  accountId,
  onSelect,
}: {
  transactions: Transaction[]
  loading?: boolean
  accountId?: string
  onSelect: (tx: Transaction) => void
}) {
  const accounts = useAccounts({ includeArchived: true }).data ?? []
  const cards = useCards({ includeArchived: true }).data ?? []
  const members = useMembers().data ?? []
  const categories = useCategories().data ?? []
  const canEdit = usePermission('transactions', 'edit')
  const { togglePaid, updateFields, updateMany, deleteMany } = useTransactionMutations()
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (transactions.length === 0) {
    return <Card className="py-12 text-center text-sm text-muted-foreground">Nenhuma transação neste período.</Card>
  }

  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const list = groups.get(tx.occurred_on) ?? []
    list.push(tx)
    groups.set(tx.occurred_on, list)
  }

  // Seleção só vale para o que está na tela (mudou o mês ou o filtro, some o que saiu).
  const selected = transactions.filter((t) => picked.has(t.id))
  const allSelected = selected.length === transactions.length
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const clear = () => setPicked(new Set())

  const ctx: RowContext = {
    accounts,
    cards,
    members,
    categories,
    accountId,
    canEdit,
    onSelect,
    togglePaid: (tx) => togglePaid.mutate(tx),
    togglePending: togglePaid.isPending,
    update: (id, patch) => updateFields.mutate({ id, patch }),
    isPicked: (id) => picked.has(id),
    togglePick: toggle,
  }

  return (
    <div className={cn('space-y-4', selected.length > 0 && 'pb-24')}>
      {canEdit && (
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 px-3 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = selected.length > 0 && !allSelected
            }}
            onChange={() => setPicked(allSelected ? new Set() : new Set(transactions.map((t) => t.id)))}
          />
          {selected.length > 0 ? `${selected.length} de ${transactions.length} selecionados` : `Selecionar todos (${transactions.length})`}
        </label>
      )}
      {/* Cabeçalho das colunas (só no desktop; no celular as colunas viram uma segunda linha). */}
      <div className={cn('hidden px-3 text-xs font-medium text-muted-foreground xl:grid xl:gap-2', GRID)}>
        <span className={canEdit ? 'pl-[5.25rem]' : 'pl-12'}>Nome</span>
        <span className="px-2">Categoria</span>
        <span className="px-2">Cartão / conta</span>
        <span className="px-2">Pessoa</span>
        <span className="text-right">Valor</span>
        <span />
      </div>
      {[...groups].map(([day, rows]) => (
        <section key={day}>
          <h3 className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {format(parseISO(day), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </h3>
          <Card className="divide-y divide-border p-0">
            {rows.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} ctx={ctx} />
            ))}
          </Card>
        </section>
      ))}

      {canEdit && selected.length > 0 && (
        <BulkBar
          selected={selected}
          cards={cards}
          members={members}
          categories={categories}
          pending={updateMany.isPending || deleteMany.isPending}
          onClear={clear}
          onApply={(ids, patch) => updateMany.mutate({ ids, patch })}
          onDelete={() => setConfirmDelete(true)}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        pending={deleteMany.isPending}
        onConfirm={() =>
          deleteMany.mutate(
            selected.map((t) => t.id),
            {
              onSettled: () => {
                setConfirmDelete(false)
                clear()
              },
            },
          )
        }
        title={`Excluir ${selected.length} lançamento${selected.length === 1 ? '' : 's'}?`}
        description="Essa ação não pode ser desfeita. Parcelas excluídas aqui somem só da fatura em que estão."
        confirmLabel="Excluir"
      />
    </div>
  )
}

/**
 * Barra flutuante para mudar vários lançamentos de uma vez. Cada mudança só se aplica a quem
 * aceita aquele campo: categoria e pessoa a despesas/receitas (categoria do mesmo tipo),
 * cartão às compras no cartão.
 */
function BulkBar({
  selected,
  cards,
  members,
  categories,
  pending,
  onClear,
  onApply,
  onDelete,
}: {
  selected: Transaction[]
  cards: CreditCardT[]
  members: HouseholdMember[]
  categories: CategoryWithSubs[]
  pending: boolean
  onClear: () => void
  onApply: (ids: string[], patch: Partial<Transaction>) => void
  onDelete: () => void
}) {
  const categorized = selected.filter((t) => CATEGORIZED.includes(t.kind))
  const incomes = categorized.filter((t) => t.kind === 'income')
  const expenses = categorized.filter((t) => t.kind !== 'income')
  // Seleção só de receitas mostra categorias de receita; com despesas, as de despesa.
  const categoryKind = expenses.length > 0 ? 'expense' : 'income'
  const categoryTargets = categoryKind === 'expense' ? expenses : incomes
  const onCard = selected.filter((t) => t.kind === 'card_purchase' || t.kind === 'card_refund')

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-3 lg:bottom-6" role="region" aria-label="Ações nos selecionados">
      <Card className="flex w-full max-w-4xl flex-wrap items-center gap-2 border-primary/40 p-2 shadow-xl">
        <span className="px-2 text-sm font-semibold tabular-nums">
          {selected.length} selecionado{selected.length === 1 ? '' : 's'}
        </span>
        {categoryTargets.length > 0 && (
          <div className="min-w-44 flex-1">
            <CategoryPicker
              variant="field"
              categories={categories.filter((c) => c.kind === categoryKind)}
              // Id inexistente: o botão mostra "Escolher" em vez de uma categoria.
              categoryId="__bulk"
              subcategoryId=""
              onChange={(cat, sub) =>
                onApply(
                  categoryTargets.map((t) => t.id),
                  { category_id: cat || null, subcategory_id: sub || null },
                )
              }
            />
          </div>
        )}
        {categorized.length > 0 && (
          <div className="min-w-36 flex-1">
            <Dropdown
              aria-label="Pessoa dos selecionados"
              value="__bulk"
              placeholder="Pessoa…"
              disabled={pending}
              onChange={(id) => onApply(categorized.map((t) => t.id), { household_member_id: id || null })}
              options={[{ value: '', label: 'Casa' }, ...members.map((m) => ({ value: m.id, label: m.full_name, color: m.color }))]}
            />
          </div>
        )}
        {onCard.length > 0 && (
          <div className="min-w-40 flex-1">
            <Dropdown
              aria-label="Cartão dos selecionados"
              value="__bulk"
              placeholder="Cartão…"
              disabled={pending}
              onChange={(card_id) => onApply(onCard.map((t) => t.id), { card_id })}
              options={cards
                .filter((c) => !c.archived_at)
                .map((c) => ({ value: c.id, label: c.name, icon: (size: 'sm' | 'md') => <BankLogo bank={c.bank} color={c.color} size={size} /> }))}
            />
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Excluir selecionados" title="Excluir selecionados" onClick={onDelete} disabled={pending}>
            <Trash2 />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Limpar seleção" title="Limpar seleção" onClick={onClear}>
            <X />
          </Button>
        </div>
        {categoryTargets.length < selected.length && (
          <p className="w-full px-2 text-[11px] text-muted-foreground">
            Categoria vale para {categoryTargets.length} de {selected.length}
            {incomes.length > 0 && expenses.length > 0 ? ' (receitas e despesas usam categorias diferentes)' : ''}
            {onCard.length > 0 && onCard.length < selected.length ? ` · cartão vale para as ${onCard.length} compras no cartão` : ''}.
          </p>
        )}
      </Card>
    </div>
  )
}

// Colunas fixas só em tela larga (o menu lateral ocupa espaço); abaixo disso, duas linhas por lançamento.
const GRID = 'xl:grid-cols-[minmax(0,1fr)_11rem_10.5rem_8rem_6.5rem_4.5rem]'

// Só estes tipos têm categoria e pessoa; transferências, faturas, dívidas etc. não.
const CATEGORIZED: Transaction['kind'][] = ['expense_fixed', 'expense_variable', 'income', 'card_purchase', 'card_refund']

interface RowContext {
  accounts: { id: string; name: string; bank: string | null; color: string; archived_at: string | null }[]
  cards: CreditCardT[]
  members: HouseholdMember[]
  categories: CategoryWithSubs[]
  accountId?: string
  canEdit: boolean
  onSelect: (tx: Transaction) => void
  togglePaid: (tx: Transaction) => void
  togglePending: boolean
  update: (id: string, patch: Partial<Transaction>) => void
  isPicked: (id: string) => boolean
  togglePick: (id: string) => void
}

function TransactionRow({ tx, ctx }: { tx: Transaction; ctx: RowContext }) {
  const { accounts, cards, members, categories, accountId, canEdit } = ctx
  const category = tx.category_id ? categories.find((c) => c.id === tx.category_id) : undefined
  const isTransfer = tx.direction === 'transfer'
  const onCard = tx.kind === 'card_purchase' || tx.kind === 'card_refund'
  const categorized = CATEGORIZED.includes(tx.kind)
  const sign =
    tx.direction === 'inflow' || (isTransfer && accountId && tx.destination_account_id === accountId)
      ? 1
      : tx.direction === 'outflow' || (isTransfer && accountId)
        ? -1
        : 0
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? '?'

  // Linha de apoio embaixo do nome: o que não tem coluna própria.
  const meta = [
    !categorized && TX_KIND_LABEL[tx.kind],
    isTransfer && `${accountName(tx.bank_account_id)} → ${accountName(tx.destination_account_id)}`,
    onCard &&
      tx.competence_month?.slice(0, 7) !== tx.occurred_on.slice(0, 7) &&
      `fatura ${format(parseISO(tx.competence_month), 'MMM/yy', { locale: ptBR })}`,
    !tx.card_id && !isTransfer && tx.payment_method && PAYMENT_METHOD_LABEL[tx.payment_method],
    tx.status === 'pending' && tx.due_on && `vence ${format(parseISO(tx.due_on), 'dd/MM')}`,
  ]
    .filter(Boolean)
    .join(' · ')

  const amount = (
    <span className={cn('shrink-0 text-sm font-semibold tabular-nums', sign > 0 && 'text-income', sign < 0 && 'text-expense', tx.status === 'pending' && 'opacity-60')}>
      {sign < 0 ? '−' : sign > 0 ? '+' : ''}
      {formatCents(tx.amount)}
    </span>
  )
  const actions = (
    <div className="flex shrink-0 items-center justify-end">
      {onCard ? (
        // Compras no cartão não têm status próprio; quem se paga é a fatura.
        <span className="size-7" />
      ) : (
        <button
          type="button"
          disabled={!canEdit || ctx.togglePending}
          onClick={() => ctx.togglePaid(tx)}
          aria-label={tx.status === 'paid' ? 'Marcar como pendente' : 'Marcar como pago'}
          title={tx.status === 'paid' ? 'Pago' : 'Pendente'}
          className="rounded-full p-1 text-muted-foreground hover:text-foreground disabled:pointer-events-none"
        >
          {tx.status === 'paid' ? <CheckCircle2 className="size-5 text-income" /> : <Circle className="size-5" />}
        </button>
      )}
      <button
        type="button"
        onClick={() => ctx.onSelect(tx)}
        aria-label={`Abrir ${tx.description}`}
        title="Abrir lançamento"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )

  const dash = <span className="px-2 text-sm text-muted-foreground">—</span>

  const categoryCell = categorized ? (
    canEdit ? (
      <CategoryPicker
        variant="cell"
        categories={categories.filter((c) => c.kind === (tx.kind === 'income' ? 'income' : 'expense'))}
        categoryId={tx.category_id ?? ''}
        subcategoryId={tx.subcategory_id ?? ''}
        onChange={(cat, sub) => ctx.update(tx.id, { category_id: cat || null, subcategory_id: sub || null })}
      />
    ) : (
      <span className="truncate px-2 text-sm">{category?.name ?? 'Sem categoria'}</span>
    )
  ) : (
    dash
  )

  const payCell = onCard ? (
    <Dropdown
      variant="cell"
      aria-label="Cartão"
      disabled={!canEdit}
      value={tx.card_id ?? ''}
      onChange={(card_id) => card_id !== tx.card_id && ctx.update(tx.id, { card_id })}
      options={cards
        .filter((c) => !c.archived_at || c.id === tx.card_id)
        .map((c) => ({ value: c.id, label: c.name, icon: (size: 'sm' | 'md') => <BankLogo bank={c.bank} color={c.color} size={size} /> }))}
    />
  ) : categorized ? (
    <Dropdown
      variant="cell"
      aria-label="Conta"
      disabled={!canEdit}
      placeholder="Sem conta"
      value={tx.bank_account_id ?? ''}
      onChange={(id) => ctx.update(tx.id, { bank_account_id: id || null })}
      options={accounts
        .filter((a) => !a.archived_at || a.id === tx.bank_account_id)
        .map((a) => ({ value: a.id, label: a.name, icon: (size: 'sm' | 'md') => <BankLogo bank={a.bank} color={a.color} size={size} /> }))}
    />
  ) : (
    <span className="truncate px-2 text-sm text-muted-foreground">{tx.bank_account_id ? accountName(tx.bank_account_id) : '—'}</span>
  )

  const personCell = categorized ? (
    <Dropdown
      variant="cell"
      aria-label="Pessoa"
      disabled={!canEdit}
      value={tx.household_member_id ?? ''}
      onChange={(id) => ctx.update(tx.id, { household_member_id: id || null })}
      options={[
        { value: '', label: 'Casa' },
        ...members.map((m) => ({ value: m.id, label: m.full_name.split(' ')[0], color: m.color })),
      ]}
    />
  ) : (
    dash
  )

  return (
    <div className={cn('px-3 py-2 xl:grid xl:items-center xl:gap-2', GRID, ctx.isPicked(tx.id) && 'bg-primary/5')}>
      <div className="flex min-w-0 items-center gap-3">
        {canEdit && (
          // Área de toque maior que a caixinha.
          <label className="-m-2 flex size-10 shrink-0 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={ctx.isPicked(tx.id)}
              onChange={() => ctx.togglePick(tx.id)}
              aria-label={`Selecionar ${tx.description}`}
            />
          </label>
        )}
        {isTransfer || !category ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {isTransfer ? <ArrowLeftRight className="size-4" strokeWidth={1.75} /> : <Tag className="size-4" strokeWidth={1.75} />}
          </span>
        ) : (
          <CategoryIcon icon={category.emoji} color={category.color} />
        )}
        <div className="min-w-0 flex-1">
          {canEdit ? <NameInput tx={tx} onSave={(description) => ctx.update(tx.id, { description })} /> : <p className="truncate text-sm font-medium">{tx.description}</p>}
          {meta && <p className="truncate px-1.5 text-xs text-muted-foreground">{meta}</p>}
        </div>
        {/* Telas menores: valor e ações na primeira linha. */}
        <div className="flex items-center gap-1 xl:hidden">
          {amount}
          {actions}
        </div>
      </div>
      {/* Telas menores: categoria, cartão/conta e pessoa numa segunda linha; tela larga: viram colunas (contents). */}
      <div className="mt-1 grid grid-cols-3 gap-1 pl-10 max-sm:grid-cols-2 xl:contents">
        <div className="min-w-0 max-sm:col-span-2">{categoryCell}</div>
        <div className="min-w-0">{payCell}</div>
        <div className="min-w-0">{personCell}</div>
      </div>
      <div className="hidden text-right xl:block">{amount}</div>
      <div className="hidden xl:block">{actions}</div>
    </div>
  )
}

/** Nome editável na própria linha: salva ao sair do campo ou com Enter; Esc desfaz. */
function NameInput({ tx, onSave }: { tx: Transaction; onSave: (description: string) => void }) {
  const [value, setValue] = useState(tx.description)
  const [prev, setPrev] = useState(tx.description)
  // Valor novo vindo do servidor (ex.: editado no formulário) substitui o rascunho.
  if (prev !== tx.description) {
    setPrev(tx.description)
    setValue(tx.description)
  }
  const commit = () => {
    const next = value.trim()
    if (!next) return setValue(tx.description)
    if (next !== tx.description) onSave(next)
  }
  return (
    <input
      value={value}
      maxLength={120}
      aria-label="Nome do lançamento"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setValue(tx.description)
          e.currentTarget.blur()
        }
      }}
      className="h-8 w-full truncate rounded-md border border-transparent bg-transparent px-1.5 text-sm font-medium hover:border-input focus:border-input focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  )
}
