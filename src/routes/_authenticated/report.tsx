import { createFileRoute } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import { Printer } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { CategoryIcon } from '@/components/planning/CategoryIcon'
import { BackLink } from '@/components/shared/layout'
import { MonthPicker } from '@/components/shared/pickers'
import { Button } from '@/components/ui/button'
import { APP_NAME } from '@/config/app'
import { useAccounts } from '@/hooks/useAccounts'
import { useHousehold, usePermission } from '@/hooks/useHousehold'
import { useBudgets, useCategories } from '@/hooks/usePlanning'
import { useTransactions } from '@/hooks/useTransactions'
import { currentMonthKey, formatMonthTitle, isMonthKey } from '@/lib/dates'
import { TX_KIND_LABEL } from '@/lib/finance/labels'
import { spendingByCategory, summarizeMonth } from '@/lib/finance/summary'
import { formatCents } from '@/lib/money'

export const Route = createFileRoute('/_authenticated/report')({
  validateSearch: z.object({
    month: z.string().refine(isMonthKey).catch(currentMonthKey).default(currentMonthKey),
  }),
  component: ReportPage,
})

/** Relatório do mês pensado para impressão ("Salvar como PDF" no diálogo de impressão). */
function ReportPage() {
  const { month } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { current } = useHousehold()
  const canViewPlanning = usePermission('planning', 'view')
  const transactions = useTransactions({ month })
  const categories = useCategories().data ?? []
  const budgets = useBudgets(month, canViewPlanning).data?.byCategory
  const accounts = useAccounts({ includeArchived: true }).data ?? []
  const [generatedAt] = useState(() => new Date())

  const rows = [...(transactions.data ?? [])].reverse()
  const s = summarizeMonth(rows)
  const spending = spendingByCategory(rows)
  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  const categoryRows = categories
    .filter((c) => c.kind === 'expense')
    .map((c) => ({ c, spent: spending.get(c.id) ?? 0, budget: budgets?.get(c.id) ?? 0 }))
    .filter((r) => r.spent || r.budget)
    .sort((a, b) => b.spent - a.spent)
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink to="/settings" label="Configurações" />
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker value={month} onChange={(m) => navigate({ search: { month: m }, replace: true })} />
          <Button onClick={() => window.print()} disabled={transactions.isPending}>
            <Printer /> Imprimir / PDF
          </Button>
        </div>
      </div>

      <article className="space-y-6 rounded-lg border border-border bg-card p-6 print:border-0 print:p-0 print:text-black">
        <header className="border-b border-border pb-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {APP_NAME} · {current.household.name}
          </p>
          <h1 className="text-2xl font-semibold">Relatório de {formatMonthTitle(month)}</h1>
          <p className="text-xs text-muted-foreground">Gerado em {format(generatedAt, 'dd/MM/yyyy HH:mm')}</p>
        </header>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              ['Ganhos', s.income],
              ['Gastos', s.expenses],
              ['Resultado', s.net],
              ['Pendente a pagar', s.pendingExpenses],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{formatCents(value)}</p>
            </div>
          ))}
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Composição dos gastos</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {(
                [
                  ['Despesas fixas', s.fixed],
                  ['Despesas variáveis', s.variable],
                  ['Cartão de crédito', s.card],
                  ['Dívidas', s.debt],
                  ['Investimentos', s.investment],
                ] as const
              ).map(([label, value]) => (
                <tr key={label}>
                  <td className="py-1.5">{label}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCents(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {categoryRows.length > 0 && (
          <section className="break-inside-avoid">
            <h2 className="mb-2 font-semibold">Gastos por categoria</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 font-medium">Categoria</th>
                  <th className="py-1.5 text-right font-medium">Gasto</th>
                  {budgets && <th className="py-1.5 text-right font-medium">Orçamento</th>}
                  {budgets && <th className="py-1.5 text-right font-medium">Diferença</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categoryRows.map(({ c, spent, budget }) => (
                  <tr key={c.id}>
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        <CategoryIcon icon={c.emoji} color={c.color} size="xs" />
                        {c.name}
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{formatCents(spent)}</td>
                    {budgets && <td className="py-1.5 text-right tabular-nums">{budget ? formatCents(budget) : '—'}</td>}
                    {budgets && (
                      <td className="py-1.5 text-right tabular-nums">{budget ? formatCents(budget - spent) : '—'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section>
          <h2 className="mb-2 font-semibold">Transações ({rows.length})</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 font-medium">Data</th>
                <th className="py-1.5 font-medium">Descrição</th>
                <th className="hidden py-1.5 font-medium sm:table-cell print:table-cell">Categoria</th>
                <th className="hidden py-1.5 font-medium sm:table-cell print:table-cell">Conta</th>
                <th className="py-1.5 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((t) => (
                <tr key={t.id} className="break-inside-avoid">
                  <td className="py-1.5 pr-2 tabular-nums">{format(parseISO(t.occurred_on), 'dd/MM')}</td>
                  <td className="py-1.5 pr-2">
                    {t.description}
                    {t.status === 'pending' && <span className="text-xs text-muted-foreground"> (pendente)</span>}
                  </td>
                  <td className="hidden py-1.5 pr-2 sm:table-cell print:table-cell">
                    {t.category_id ? categoryName.get(t.category_id) : TX_KIND_LABEL[t.kind]}
                  </td>
                  <td className="hidden py-1.5 pr-2 sm:table-cell print:table-cell">
                    {t.bank_account_id ? accountName.get(t.bank_account_id) : t.card_id ? 'Cartão' : ''}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {t.direction === 'outflow' ? '−' : t.direction === 'inflow' ? '+' : ''}
                    {formatCents(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </article>
    </div>
  )
}
