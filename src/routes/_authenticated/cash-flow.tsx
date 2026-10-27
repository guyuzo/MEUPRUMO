import { createFileRoute } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { GroupedBarChart, FLOW_SERIES, Legend } from '@/components/charts/charts'
import { Card, CardTitle } from '@/components/ui/card'
import { useAccounts } from '@/hooks/useAccounts'
import { useCashFlowTransactions } from '@/hooks/useCashFlow'
import { todayIso, useInvoices } from '@/hooks/useCards'
import { currentMonthKey, shiftMonth } from '@/lib/dates'
import { cashFlow, monthRange } from '@/lib/finance/cashflow'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/cash-flow')({ component: CashFlowPage })

const PAST_MONTHS = 2
const FUTURE_MONTHS = 6

function CashFlowPage() {
  const today = todayIso()
  const start = shiftMonth(currentMonthKey(), -PAST_MONTHS)
  const months = monthRange(start, PAST_MONTHS + 1 + FUTURE_MONTHS)
  const end = shiftMonth(months[months.length - 1], 1)

  const accounts = useAccounts()
  const invoices = useInvoices()
  const transactions = useCashFlowTransactions(start, end)

  const loading = accounts.isPending || invoices.isPending || transactions.isPending
  const currentBalance = (accounts.data ?? []).reduce((sum, a) => sum + a.balance, 0)
  const rows = cashFlow({
    months,
    transactions: transactions.data ?? [],
    invoices: invoices.data ?? [],
    currentBalance,
    today,
  })
  const monthShort = (m: string) => format(parseISO(m), 'MMM/yy', { locale: ptBR })
  // Totais do período mostrado (meses passados + atual + previstos).
  const totals = rows.reduce((t, r) => ({ inflow: t.inflow + r.inflow, outflow: t.outflow + r.outflow, net: t.net + r.net }), { inflow: 0, outflow: 0, net: 0 })
  const finalBalance = [...rows].reverse().find((r) => r.projectedBalance != null)?.projectedBalance ?? null
  const period = rows.length ? `${monthShort(rows[0].month)} a ${monthShort(rows[rows.length - 1].month)}` : ''
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCents(Math.abs(v))}`
  const lowest = rows.filter((r) => r.projectedBalance != null).reduce<(typeof rows)[number] | null>(
    (min, r) => (min == null || r.projectedBalance! < min.projectedBalance! ? r : min),
    null,
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fluxo de caixa</h1>
        <p className="text-sm text-muted-foreground">
          O que entra e sai das suas contas. Compras no cartão aparecem no vencimento da fatura.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>Saldo em contas hoje</CardTitle>
          <p className={cn('mt-2 text-2xl font-semibold tabular-nums', currentBalance < 0 && 'text-expense')}>
            {formatCents(currentBalance)}
          </p>
        </Card>
        {lowest && (
          <Card>
            <CardTitle>Menor saldo previsto</CardTitle>
            <p className={cn('mt-2 text-2xl font-semibold tabular-nums', lowest.projectedBalance! < 0 && 'text-expense')}>
              {formatCents(lowest.projectedBalance!)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              fim de {format(parseISO(lowest.month), 'MMMM', { locale: ptBR })}
            </p>
          </Card>
        )}
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle>Resumo do período</CardTitle>
          <span className="text-xs text-muted-foreground">{period}</span>
        </div>
        {loading ? (
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-4">
            {(
              [
                ['Ganhos', signed(totals.inflow), 'text-income'],
                ['Saídas', signed(-totals.outflow), 'text-expense'],
                ['Resultado', signed(totals.net), totals.net < 0 ? 'text-expense' : 'text-income'],
                ['Saldo final previsto', finalBalance == null ? '—' : formatCents(finalBalance), (finalBalance ?? 0) < 0 ? 'text-expense' : ''],
              ] as const
            ).map(([label, value, color]) => (
              <div key={label} className="flex items-baseline justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2.5 sm:block">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn('text-lg font-semibold tabular-nums sm:mt-0.5', color)}>{value}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Ganhos e saídas por mês</CardTitle>
          <Legend series={FLOW_SERIES} />
        </div>
        {loading ? (
          <div className="h-64 animate-pulse rounded-md bg-muted" />
        ) : (
          <GroupedBarChart
            data={rows.map((r) => ({ month: r.month, income: r.inflow, expenses: r.outflow }))}
            xKey="month"
            series={FLOW_SERIES}
            xLabel={monthShort}
            title="Ganhos e saídas por mês"
          />
        )}
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Mês</th>
              <th className="px-4 py-3 text-right font-medium">Ganhos</th>
              <th className="px-4 py-3 text-right font-medium">Saídas</th>
              <th className="px-4 py-3 text-right font-medium">Resultado</th>
              <th className="px-4 py-3 text-right font-medium">Saldo previsto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.month} className={cn(r.month === currentMonthKey() && 'bg-muted/50')}>
                <td className="px-4 py-2.5 capitalize">
                  {format(parseISO(r.month), 'MMMM yyyy', { locale: ptBR })}
                  {r.month === currentMonthKey() && <span className="ml-2 text-xs text-muted-foreground">atual</span>}
                </td>
                <td className={cn('px-4 py-2.5 text-right tabular-nums', r.inflow > 0 && 'text-income')}>{signed(r.inflow)}</td>
                <td className={cn('px-4 py-2.5 text-right tabular-nums', r.outflow > 0 && 'text-expense')}>{signed(-r.outflow)}</td>
                <td className={cn('px-4 py-2.5 text-right font-medium tabular-nums', r.net < 0 ? 'text-expense' : 'text-income')}>
                  {signed(r.net)}
                </td>
                <td className={cn('px-4 py-2.5 text-right font-medium tabular-nums', (r.projectedBalance ?? 0) < 0 && 'text-expense')}>
                  {r.projectedBalance == null ? '—' : formatCents(r.projectedBalance)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td className="px-4 py-3">Total do período</td>
              <td className={cn('px-4 py-3 text-right tabular-nums', totals.inflow > 0 && 'text-income')}>{signed(totals.inflow)}</td>
              <td className={cn('px-4 py-3 text-right tabular-nums', totals.outflow > 0 && 'text-expense')}>{signed(-totals.outflow)}</td>
              <td className={cn('px-4 py-3 text-right tabular-nums', totals.net < 0 ? 'text-expense' : 'text-income')}>{signed(totals.net)}</td>
              <td className={cn('px-4 py-3 text-right tabular-nums', (finalBalance ?? 0) < 0 && 'text-expense')}>
                {finalBalance == null ? '—' : formatCents(finalBalance)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>
      <p className="text-xs text-muted-foreground">
        O saldo previsto parte do saldo de hoje e soma as contas pendentes, as recorrências e as faturas em aberto.
      </p>
    </div>
  )
}
