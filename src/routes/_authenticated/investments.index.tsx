import { createFileRoute, Link } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import { Plus, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { GainText } from '@/components/investments/GainText'
import { InvestmentFormDialog } from '@/components/investments/InvestmentFormDialog'
import { EmptyState, ListSkeleton, PageHeader } from '@/components/shared/layout'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { usePermission } from '@/hooks/useHousehold'
import { useInvestments } from '@/hooks/useInvestments'
import { INVESTMENT_TYPE_LABEL } from '@/lib/finance/labels'
import { formatCents } from '@/lib/money'

export const Route = createFileRoute('/_authenticated/investments/')({ component: InvestmentsPage })

function InvestmentsPage() {
  const canEdit = usePermission('investments', 'edit')
  const investments = useInvestments()
  const [formOpen, setFormOpen] = useState(false)

  const all = (investments.data ?? []).filter((i) => !i.archived_at)
  const total = all.reduce((s, i) => s + i.current_value, 0)
  const invested = all.reduce((s, i) => s + i.invested, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investimentos"
        actions={
          canEdit && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus /> Novo investimento
            </Button>
          )
        }
      />

      {all.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardTitle>Patrimônio investido</CardTitle>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCents(total)}</p>
          </Card>
          <Card>
            <CardTitle>Líquido aportado</CardTitle>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCents(invested)}</p>
          </Card>
          <Card>
            <CardTitle>Rendimento</CardTitle>
            <p className="mt-2 text-2xl font-semibold">
              <GainText gain={total - invested} invested={invested} />
            </p>
          </Card>
        </div>
      )}

      {investments.isPending ? (
        <ListSkeleton className="h-16" />
      ) : all.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          text="Acompanhe seus investimentos: registre aportes e resgates e atualize o valor de tempos em tempos."
          action={
            canEdit && (
              <Button variant="outline" onClick={() => setFormOpen(true)}>
                <Plus /> Adicionar investimento
              </Button>
            )
          }
        />
      ) : (
        <Card className="divide-y divide-border p-0">
          {all.map((i) => (
            <Link
              key={i.id}
              to="/investments/$investmentId"
              params={{ investmentId: i.id }}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40"
            >
              <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: i.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{i.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[
                    INVESTMENT_TYPE_LABEL[i.type],
                    i.institution,
                    i.last_valued_on ? `valor de ${format(parseISO(i.last_valued_on), 'dd/MM')}` : 'sem atualização de valor',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-sm font-semibold tabular-nums">{formatCents(i.current_value)}</span>
                <GainText gain={i.gain} invested={i.invested} className="text-xs" />
              </span>
            </Link>
          ))}
        </Card>
      )}

      <InvestmentFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}
