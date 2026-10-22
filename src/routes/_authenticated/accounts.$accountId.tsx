import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { MonthPicker } from '@/components/shared/pickers'
import { TotalsBar, TransactionList } from '@/components/transactions/TransactionList'
import { TransactionFormSheet } from '@/components/transactions/TransactionFormSheet'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAccounts } from '@/hooks/useAccounts'
import { usePermission } from '@/hooks/useHousehold'
import { useTransactions } from '@/hooks/useTransactions'
import { currentMonthKey, isMonthKey } from '@/lib/dates'
import { ACCOUNT_TYPE_LABEL } from '@/lib/finance/labels'
import { computeTotals } from '@/lib/finance/totals'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types/database'

export const Route = createFileRoute('/_authenticated/accounts/$accountId')({
  validateSearch: z.object({
    month: z.string().refine(isMonthKey).catch(currentMonthKey).default(currentMonthKey),
  }),
  component: AccountDetailPage,
})

function AccountDetailPage() {
  const { accountId } = Route.useParams()
  const { month } = Route.useSearch()
  const navigate = Route.useNavigate()
  const canEdit = usePermission('transactions', 'edit')
  const accounts = useAccounts({ includeArchived: true })
  const account = accounts.data?.find((a) => a.id === accountId)
  const transactions = useTransactions({ month, accountId })
  const rows = transactions.data ?? []
  const [sheet, setSheet] = useState<{ open: boolean; tx?: Transaction }>({ open: false })

  if (accounts.isSuccess && !account) {
    return (
      <Card className="py-12 text-center">
        <p className="text-sm text-muted-foreground">Conta não encontrada.</p>
        <Link to="/accounts" className="mt-2 inline-block text-sm text-primary hover:underline">
          Voltar para contas
        </Link>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Link to="/accounts" className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Contas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{account?.name ?? '…'}</h1>
          {account && (
            <p className="text-sm text-muted-foreground">
              {[ACCOUNT_TYPE_LABEL[account.type], account.bank, account.branch && `Ag. ${account.branch}`, account.account_number]
                .filter(Boolean)
                .join(' · ')}
              {account.archived_at && ' · arquivada'}
            </p>
          )}
        </div>
        {canEdit && account && !account.archived_at && (
          <Button onClick={() => setSheet({ open: true })}>
            <Plus /> Nova transação
          </Button>
        )}
      </div>

      {account && (
        <Card className="flex flex-wrap gap-8">
          <div>
            <p className="text-sm text-muted-foreground">Saldo atual</p>
            <p className={cn('mt-1 text-2xl font-semibold tabular-nums', account.balance < 0 && 'text-expense')}>
              {formatCents(account.balance)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Previsto</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-muted-foreground">
              {formatCents(account.projected_balance)}
            </p>
          </div>
        </Card>
      )}

      <div className="flex justify-center sm:justify-start">
        <MonthPicker value={month} onChange={(m) => navigate({ search: { month: m }, replace: true })} />
      </div>

      <TotalsBar totals={computeTotals(rows, accountId)} />

      <TransactionList
        transactions={rows}
        loading={transactions.isPending}
        accountId={accountId}
        onSelect={(tx) => setSheet({ open: true, tx })}
      />

      <TransactionFormSheet
        open={sheet.open}
        transaction={sheet.tx}
        defaults={{ bank_account_id: accountId }}
        onClose={() => setSheet({ open: false })}
      />
    </div>
  )
}
