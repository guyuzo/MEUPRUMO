import { createFileRoute } from '@tanstack/react-router'
import { FileUp, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { CardPurchaseSheet } from '@/components/cards/CardPurchaseSheet'
import { ImportInvoiceDialog } from '@/components/cards/ImportInvoiceDialog'
import { MonthPicker } from '@/components/shared/pickers'
import { TotalsBar, TransactionList } from '@/components/transactions/TransactionList'
import { TransactionFormSheet } from '@/components/transactions/TransactionFormSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useAccounts } from '@/hooks/useAccounts'
import { usePermission } from '@/hooks/useHousehold'
import { useCategories } from '@/hooks/usePlanning'
import { useTransactions } from '@/hooks/useTransactions'
import { currentMonthKey, isMonthKey } from '@/lib/dates'
import { computeTotals } from '@/lib/finance/totals'
import type { Transaction } from '@/types/database'

const searchSchema = z.object({
  month: z.string().refine(isMonthKey).catch(currentMonthKey).default(currentMonthKey),
  account: z.string().optional().catch(undefined),
  category: z.string().optional().catch(undefined),
  status: z.enum(['pending', 'paid']).optional().catch(undefined),
  direction: z.enum(['inflow', 'outflow', 'transfer']).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/transactions')({
  validateSearch: searchSchema,
  component: TransactionsPage,
})

type Search = z.infer<typeof searchSchema>

// Estornos têm formulário próprio; compras no cartão usam o formulário de lançamento.
const isCardEntry = (tx?: Transaction) => tx?.kind === 'card_refund'

function TransactionsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const canEdit = usePermission('transactions', 'edit')
  const accounts = useAccounts().data ?? []
  const categories = useCategories().data ?? []

  const setSearch = (patch: Partial<Search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  // Busca digitada aplica ao parar de digitar.
  const [term, setTerm] = useState(search.q ?? '')
  useEffect(() => {
    const id = setTimeout(() => {
      if ((search.q ?? '') !== term) setSearch({ q: term || undefined })
    }, 300)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term])

  const transactions = useTransactions({
    month: search.month,
    accountId: search.account,
    categoryId: search.category,
    status: search.status,
    direction: search.direction,
    search: search.q,
  })
  const rows = transactions.data ?? []

  const [sheet, setSheet] = useState<{ open: boolean; tx?: Transaction }>({ open: false })
  const [importOpen, setImportOpen] = useState(false)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Transações</h1>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp /> Importar fatura
            </Button>
            <Button onClick={() => setSheet({ open: true })}>
              <Plus /> Nova transação
            </Button>
          </div>
        )}
      </div>
      <ImportInvoiceDialog open={importOpen} onClose={() => setImportOpen(false)} />

      <div className="flex justify-center sm:justify-start">
        <MonthPicker value={search.month} onChange={(month) => setSearch({ month })} />
      </div>

      <TotalsBar totals={computeTotals(rows, search.account)} />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar descrição"
            aria-label="Buscar descrição"
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Tipo"
          value={search.direction ?? ''}
          onChange={(e) => setSearch({ direction: (e.target.value || undefined) as Search['direction'] })}
        >
          <option value="">Todos os tipos</option>
          <option value="inflow">Entradas</option>
          <option value="outflow">Saídas</option>
          <option value="transfer">Transferências</option>
        </Select>
        <Select
          aria-label="Conta"
          value={search.account ?? ''}
          onChange={(e) => setSearch({ account: e.target.value || undefined })}
        >
          <option value="">Todas as contas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id} data-color={a.color}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Categoria"
          value={search.category ?? ''}
          onChange={(e) => setSearch({ category: e.target.value || undefined })}
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id} data-color={c.color}>
              {c.emoji} {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex gap-1 text-sm" role="radiogroup" aria-label="Situação">
        {(
          [
            [undefined, 'Todas'],
            ['pending', 'Pendentes'],
            ['paid', 'Pagas'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            role="radio"
            aria-checked={search.status === value}
            onClick={() => setSearch({ status: value })}
            className={
              search.status === value
                ? 'rounded-full bg-foreground px-3 py-1 text-background'
                : 'rounded-full px-3 py-1 text-muted-foreground hover:bg-muted'
            }
          >
            {label}
          </button>
        ))}
      </div>

      <TransactionList
        transactions={rows}
        loading={transactions.isPending}
        accountId={search.account}
        onSelect={(tx) => setSheet({ open: true, tx })}
      />

      <TransactionFormSheet
        open={sheet.open && !isCardEntry(sheet.tx)}
        transaction={sheet.tx}
        defaults={{ bank_account_id: search.account }}
        onClose={() => setSheet({ open: false })}
      />
      <CardPurchaseSheet
        open={sheet.open && isCardEntry(sheet.tx)}
        transaction={sheet.tx}
        onClose={() => setSheet({ open: false })}
      />
    </div>
  )
}
