import { createFileRoute, Link } from '@tanstack/react-router'
import { CheckCircle2, Plus, Wallet } from 'lucide-react'
import { useState } from 'react'
import { DebtFormDialog } from '@/components/debts/DebtFormDialog'
import { EmptyState, ListSkeleton, PageHeader, ProgressBar } from '@/components/shared/layout'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { useDebts } from '@/hooks/useDebts'
import { usePermission } from '@/hooks/useHousehold'
import { DEBT_TYPE_LABEL } from '@/lib/finance/labels'
import { formatCents } from '@/lib/money'

export const Route = createFileRoute('/_authenticated/debts/')({ component: DebtsPage })

function DebtsPage() {
  const canEdit = usePermission('debts', 'edit')
  const debts = useDebts()
  const [formOpen, setFormOpen] = useState(false)

  const all = debts.data ?? []
  const open = all.filter((d) => !d.paid_off_at && d.remaining > 0)
  const done = all.filter((d) => d.paid_off_at || d.remaining === 0)
  const totalRemaining = open.reduce((s, d) => s + d.remaining, 0)
  const monthly = open.reduce((s, d) => s + (d.installment_amount ?? 0), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dívidas"
        actions={
          canEdit && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus /> Nova dívida
            </Button>
          )
        }
      />

      {open.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardTitle>Total a pagar</CardTitle>
            <p className="mt-2 text-xl font-semibold tabular-nums sm:text-2xl">{formatCents(totalRemaining)}</p>
          </Card>
          <Card>
            <CardTitle>Parcelas por mês</CardTitle>
            <p className="mt-2 text-xl font-semibold tabular-nums sm:text-2xl">{formatCents(monthly)}</p>
          </Card>
        </div>
      )}

      {debts.isPending ? (
        <ListSkeleton />
      ) : all.length === 0 ? (
        <EmptyState
          icon={Wallet}
          text="Cadastre empréstimos, financiamentos e outras dívidas para acompanhar quanto falta pagar."
          action={
            canEdit && (
              <Button variant="outline" onClick={() => setFormOpen(true)}>
                <Plus /> Adicionar dívida
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {[...open, ...done].map((d) => {
            const finished = Boolean(d.paid_off_at) || d.remaining === 0
            return (
              <Link key={d.id} to="/debts/$debtId" params={{ debtId: d.id }} className="block">
                <Card className="space-y-3 transition-colors hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{d.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[DEBT_TYPE_LABEL[d.type], d.creditor].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {finished && (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-income">
                        <CheckCircle2 className="size-3.5" /> Quitada
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Falta pagar</p>
                    <p className="text-xl font-semibold tabular-nums">{formatCents(d.remaining)}</p>
                  </div>
                  <ProgressBar value={d.progress} label={`Progresso de ${d.name}`} />
                  <p className="text-xs text-muted-foreground">
                    {d.total_installments
                      ? `${Math.min(d.installments_paid, d.total_installments)} de ${d.total_installments} parcelas`
                      : `${formatCents(d.paid_amount)} pagos de ${formatCents(d.original_amount)}`}
                    {d.installment_amount && !finished && ` · ${formatCents(d.installment_amount)}/mês`}
                  </p>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      <DebtFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}
