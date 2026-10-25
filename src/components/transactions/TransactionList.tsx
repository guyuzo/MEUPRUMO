import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeftRight, CheckCircle2, ChevronRight, Circle, Tag } from 'lucide-react'
import { useState } from 'react'
import { BankLogo } from '@/components/cards/BankLogo'
import { CategoryIcon } from '@/components/planning/CategoryIcon'
import { CategoryPicker } from '@/components/planning/CategoryPicker'
import { Card } from '@/components/ui/card'
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
  const { togglePaid, updateFields } = useTransactionMutations()

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
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho das colunas (só no desktop; no celular as colunas viram uma segunda linha). */}
      <div className={cn('hidden px-3 text-xs font-medium text-muted-foreground xl:grid xl:gap-2', GRID)}>
        <span className="pl-12">Nome</span>
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
    <div className={cn('px-3 py-2 xl:grid xl:items-center xl:gap-2', GRID)}>
      <div className="flex min-w-0 items-center gap-3">
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
