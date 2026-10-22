import { createFileRoute } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CreditCard, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { CumulativeLineChart, FLOW_SERIES, Legend } from '@/components/charts/charts'
import { GettingStarted } from '@/components/dashboard/GettingStarted'
import { CategoryDonut } from '@/components/dashboard/CategoryDonut'
import { Breakdown, StatTile, UpcomingList } from '@/components/dashboard/sections'
import { MonthPicker } from '@/components/shared/pickers'
import { TransactionFormSheet } from '@/components/transactions/TransactionFormSheet'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { useAccounts } from '@/hooks/useAccounts'
import { todayIso, useCards, useInvoices } from '@/hooks/useCards'
import { useHousehold, usePermission } from '@/hooks/useHousehold'
import { useBudgets, useCategories } from '@/hooks/usePlanning'
import { usePendingTransactions, useTransactions } from '@/hooks/useTransactions'
import { currentMonthKey, formatMonth, isMonthKey, shiftMonth } from '@/lib/dates'
import type { ManualKind } from '@/lib/finance/labels'
import { dailyCumulative, percentChange, spendingByCategory, summarizeMonth } from '@/lib/finance/summary'
import type { PaymentMethod, Transaction } from '@/types/database'

export const Route = createFileRoute('/_authenticated/dashboard')({
  validateSearch: z.object({
    month: z.string().refine(isMonthKey).catch(currentMonthKey).default(currentMonthKey),
  }),
  component: DashboardPage,
})

function DashboardPage() {
  const { month } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { profile, current: membership } = useHousehold()
  const isOwner = membership.permission.role === 'owner'
  const canViewTx = usePermission('transactions', 'view')
  const canEditTx = usePermission('transactions', 'edit')
  const canViewPlanning = usePermission('planning', 'view')
  const firstName = profile.full_name.split(' ')[0] || 'você'
  const today = todayIso()

  const current = useTransactions({ month })
  const previous = useTransactions({ month: shiftMonth(month, -1) })
  const pending = usePendingTransactions()
  const accounts = useAccounts().data ?? []
  const cards = useCards().data ?? []
  const invoices = useInvoices().data ?? []
  const categories = useCategories().data ?? []
  const budgets = useBudgets(month, canViewPlanning)

  const [sheet, setSheet] = useState<{ open: boolean; kind?: ManualKind; method?: PaymentMethod; tx?: Transaction }>({ open: false })

  const rows = current.data ?? []
  const summary = summarizeMonth(rows)
  const prev = summarizeMonth(previous.data ?? [])
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)
  const daily = dailyCumulative(rows, month)
  const monthLabel = formatMonth(month)

  if (!canViewTx) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {firstName}!</h1>
        <Card className="text-sm text-muted-foreground">Você não tem permissão para ver as transações desta casa.</Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Olá, {firstName}!</h1>
          <p className="text-sm text-muted-foreground">
            Resumo de {monthLabel}
          </p>
        </div>
        <MonthPicker value={month} onChange={(m) => navigate({ search: { month: m }, replace: true })} />
      </div>

      {isOwner && !membership.household.onboarding_completed && <GettingStarted />}

      {canEditTx && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setSheet({ open: true, kind: 'expense_variable', method: cards.length ? undefined : 'debit' })}>
            <Minus /> Despesa
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSheet({ open: true, kind: 'income' })}>
            <Plus /> Ganho
          </Button>
          {cards.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setSheet({ open: true, kind: 'expense_variable', method: 'credit' })}>
              <CreditCard /> Compra no cartão
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Saldo em contas" value={totalBalance} negative={totalBalance < 0} hint={`${accounts.length} conta${accounts.length === 1 ? '' : 's'} · hoje`} />
        <StatTile label="Ganhos do mês" value={summary.income} change={percentChange(summary.income, prev.income)} />
        <StatTile
          label="Gastos do mês"
          value={summary.expenses}
          change={percentChange(summary.expenses, prev.expenses)}
          goodWhenUp={false}
        />
        <StatTile
          label="Resultado do mês"
          value={summary.net}
          negative={summary.net < 0}
          hint={summary.net >= 0 ? 'Sobrou dinheiro 👏' : 'Gastou mais do que ganhou'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Ganhos e gastos acumulados</CardTitle>
            <Legend series={FLOW_SERIES} />
          </div>
          {current.isPending ? (
            <div className="h-56 animate-pulse rounded-md bg-muted" />
          ) : (
            <CumulativeLineChart
              data={daily}
              xKey="day"
              series={FLOW_SERIES}
              title={`Ganhos e gastos acumulados em ${monthLabel}`}
              xLabel={(day) => format(parseISO(month).setDate(day), "d 'de' MMM", { locale: ptBR })}
            />
          )}
        </Card>
        <Breakdown summary={summary} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryDonut
          categories={categories}
          rows={rows}
          spending={spendingByCategory(rows)}
          budgets={canViewPlanning ? budgets.data?.byCategory : undefined}
          month={month}
        />
        <UpcomingList
          pending={pending.data ?? []}
          invoices={invoices}
          cards={cards}
          today={today}
          onSelect={(tx) => setSheet({ open: true, tx })}
        />
      </div>

      <TransactionFormSheet
        open={sheet.open}
        transaction={sheet.tx}
        defaults={{ kind: sheet.kind, payment_method: sheet.method }}
        onClose={() => setSheet({ open: false })}
      />
    </div>
  )
}
