import { createFileRoute } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CreditCard, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { CumulativeLineChart, FLOW_SERIES, GroupedBarChart, Legend } from '@/components/charts/charts'
import { GettingStarted } from '@/components/dashboard/GettingStarted'
import { BreakdownDonut } from '@/components/dashboard/CategoryDonut'
import { Breakdown, StatTile, UpcomingList } from '@/components/dashboard/sections'
import { MonthPicker } from '@/components/shared/pickers'
import { TransactionFormSheet } from '@/components/transactions/TransactionFormSheet'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { useAccounts } from '@/hooks/useAccounts'
import { useAvatarUrls } from '@/hooks/useAvatars'
import { useMembers, useSplits } from '@/hooks/useFamily'
import { todayIso, useCards, useInvoices } from '@/hooks/useCards'
import { useHousehold, usePermission } from '@/hooks/useHousehold'
import { useBudgets, useCategories } from '@/hooks/usePlanning'
import { usePendingTransactions, useTransactions } from '@/hooks/useTransactions'
import { currentMonthKey, formatMonth, isMonthKey, shiftMonth } from '@/lib/dates'
import type { ManualKind } from '@/lib/finance/labels'
import { dailyCumulative, percentChange, summarizeMonth } from '@/lib/finance/summary'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
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
  const members = useMembers().data ?? []
  const avatarUrls = useAvatarUrls(members).data
  const splits = useSplits(rows.map((t) => t.id)).data ?? []
  const summary = summarizeMonth(rows)
  const prev = summarizeMonth(previous.data ?? [])
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)
  const daily = dailyCumulative(rows, month)
  const [chartMode, setChartMode] = useState<'daily' | 'cumulative'>('daily')
  // Mês atual: a média considera só os dias que já passaram.
  const daysSoFar = month === currentMonthKey() ? Number(today.slice(8, 10)) : daily.length
  const dailyAverage = daysSoFar ? Math.round(summary.expenses / daysSoFar) : 0
  const busiest = daily.reduce<(typeof daily)[number] | null>((best, d) => (d.dayExpenses > (best?.dayExpenses ?? 0) ? d : best), null)
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
            <CardTitle>{chartMode === 'daily' ? 'Ganhos e gastos por dia' : 'Ganhos e gastos acumulados'}</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <Legend series={FLOW_SERIES} />
              <div className="inline-flex rounded-md border border-border p-0.5 text-xs" role="tablist" aria-label="Tipo de gráfico">
                {(
                  [
                    ['daily', 'Por dia'],
                    ['cumulative', 'Acumulado'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    role="tab"
                    aria-selected={chartMode === value}
                    onClick={() => setChartMode(value)}
                    className={cn('min-h-8 rounded px-2.5', chartMode === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {busiest && (
            <p className="text-xs text-muted-foreground">
              Média de <span className="font-semibold tabular-nums text-foreground">{formatCents(dailyAverage)}</span> gastos por dia · maior gasto no dia{' '}
              <span className="font-semibold text-foreground">{busiest.day}</span> (
              <span className="tabular-nums">{formatCents(busiest.dayExpenses)}</span>)
            </p>
          )}
          {current.isPending ? (
            <div className="h-56 animate-pulse rounded-md bg-muted" />
          ) : chartMode === 'daily' ? (
            <GroupedBarChart
              data={daily.map((d) => ({ day: d.day, income: d.dayIncome, expenses: d.dayExpenses }))}
              xKey="day"
              series={FLOW_SERIES}
              height="h-56"
              title={`Ganhos e gastos por dia em ${monthLabel}`}
              tickLabel={(day) => day}
              xLabel={(day) => format(parseISO(month).setDate(Number(day)), "EEEE, d 'de' MMM", { locale: ptBR })}
            />
          ) : (
            <CumulativeLineChart
              data={daily}
              xKey="day"
              series={FLOW_SERIES}
              title={`Ganhos e gastos acumulados em ${monthLabel}`}
              xLabel={(day) => format(parseISO(month).setDate(day), "d 'de' MMM", { locale: ptBR })}
              detail={(row) => [
                ['Gasto no dia', formatCents(Number(row.dayExpenses))],
                ['Recebido no dia', formatCents(Number(row.dayIncome))],
              ]}
            />
          )}
        </Card>
        <Breakdown summary={summary} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownDonut
          mode="expense"
          categories={categories}
          members={members}
          avatarUrls={avatarUrls}
          splits={splits}
          rows={rows}
          budgets={canViewPlanning ? budgets.data?.byCategory : undefined}
          month={month}
        />
        <BreakdownDonut
          mode="income"
          categories={categories}
          members={members}
          avatarUrls={avatarUrls}
          splits={splits}
          rows={rows}
          month={month}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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
