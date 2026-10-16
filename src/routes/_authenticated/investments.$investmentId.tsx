import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import { Archive, ArchiveRestore, Minus, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { GainText } from '@/components/investments/GainText'
import { InvestmentFormDialog } from '@/components/investments/InvestmentFormDialog'
import { BackLink, PageHeader } from '@/components/shared/layout'
import { MovementDialog } from '@/components/shared/MovementDialog'
import { TransactionFormSheet } from '@/components/transactions/TransactionFormSheet'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useAccounts } from '@/hooks/useAccounts'
import { usePermission } from '@/hooks/useHousehold'
import { useInvestmentFlows, useInvestmentMutations, useInvestments, useInvestmentValuations } from '@/hooks/useInvestments'
import { INVESTMENT_TYPE_LABEL } from '@/lib/finance/labels'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types/database'

export const Route = createFileRoute('/_authenticated/investments/$investmentId')({ component: InvestmentDetailPage })

function InvestmentDetailPage() {
  const { investmentId } = Route.useParams()
  const navigate = useNavigate()
  const canEdit = usePermission('investments', 'edit')
  const canEditTransactions = usePermission('transactions', 'edit')
  // Aporte/resgate são transações: exigem as duas permissões.
  const canMove = canEdit && canEditTransactions
  const investments = useInvestments()
  const inv = investments.data?.find((i) => i.id === investmentId)
  const flows = useInvestmentFlows(investmentId)
  const valuations = useInvestmentValuations(investmentId)
  const accounts = useAccounts({ includeArchived: true }).data ?? []
  const { save, remove, move, addValuation, removeValuation } = useInvestmentMutations()
  const [dialog, setDialog] = useState<'in' | 'out' | 'value' | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [selected, setSelected] = useState<Transaction>()

  if (investments.isSuccess && !inv) {
    return (
      <div className="space-y-4">
        <BackLink to="/investments" label="Investimentos" />
        <Card className="py-12 text-center text-sm text-muted-foreground">Investimento não encontrado.</Card>
      </div>
    )
  }
  if (!inv) return null

  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  // Linha do tempo única: aportes/resgates e atualizações de valor.
  const timeline = [
    ...(flows.data ?? []).map((t) => ({ key: t.id, date: t.occurred_on, kind: 'flow' as const, tx: t })),
    ...(valuations.data ?? []).map((v) => ({ key: v.id, date: v.valued_on, kind: 'value' as const, valuation: v })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="space-y-5">
      <BackLink to="/investments" label="Investimentos" />
      <PageHeader
        title={inv.name}
        subtitle={[INVESTMENT_TYPE_LABEL[inv.type], inv.institution, inv.archived_at && 'arquivado'].filter(Boolean).join(' · ')}
        actions={
          canEdit && (
            <>
              {canMove && (
                <>
                  <Button onClick={() => setDialog('in')}>
                    <Plus /> Aportar
                  </Button>
                  <Button variant="outline" onClick={() => setDialog('out')}>
                    <Minus /> Resgatar
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={() => setDialog('value')}>
                <RefreshCw /> Atualizar valor
              </Button>
              <Button variant="outline" size="icon" aria-label="Editar" onClick={() => setEditOpen(true)}>
                <Pencil />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={inv.archived_at ? 'Restaurar' : 'Arquivar'}
                onClick={() =>
                  save.mutate({
                    id: inv.id,
                    name: inv.name,
                    type: inv.type,
                    institution: inv.institution,
                    color: inv.color,
                    archived_at: inv.archived_at ? null : new Date().toISOString(),
                  })
                }
              >
                {inv.archived_at ? <ArchiveRestore /> : <Archive />}
              </Button>
              <Button variant="outline" size="icon" aria-label="Excluir" onClick={() => setConfirmDelete(true)}>
                <Trash2 />
              </Button>
            </>
          )
        }
      />

      <Card className="grid gap-4 sm:grid-cols-3">
        <div>
          <CardTitle>Valor atual</CardTitle>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCents(inv.current_value)}</p>
          <p className="text-xs text-muted-foreground">
            {inv.last_valued_on ? `com base no valor de ${format(parseISO(inv.last_valued_on), 'dd/MM/yyyy')}` : 'igual ao aportado (sem atualização)'}
          </p>
        </div>
        <div>
          <CardTitle>Líquido aportado</CardTitle>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCents(inv.invested)}</p>
          <p className="text-xs text-muted-foreground">
            {formatCents(inv.contributed)} aportados · {formatCents(inv.withdrawn)} resgatados
          </p>
        </div>
        <div>
          <CardTitle>Rendimento</CardTitle>
          <p className="mt-1 text-2xl font-semibold">
            <GainText gain={inv.gain} invested={inv.invested} />
          </p>
        </div>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Histórico</h2>
        <Card className="divide-y divide-border p-0">
          {timeline.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum movimento ainda.</p>
          ) : (
            timeline.map((item) =>
              item.kind === 'flow' ? (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelected(item.tx)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{item.tx.kind === 'investment_contribution' ? 'Aporte' : 'Resgate'}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[format(parseISO(item.date), 'dd/MM/yyyy'), item.tx.bank_account_id && accountName.get(item.tx.bank_account_id), item.tx.notes]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'text-sm font-semibold tabular-nums',
                      item.tx.kind === 'investment_contribution' ? 'text-income' : 'text-expense',
                    )}
                  >
                    {item.tx.kind === 'investment_contribution' ? '+' : '−'}
                    {formatCents(item.tx.amount)}
                  </span>
                </button>
              ) : (
                <div key={item.key} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">Valor atualizado</span>
                    <span className="block text-xs text-muted-foreground">{format(parseISO(item.date), 'dd/MM/yyyy')}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{formatCents(item.valuation.value)}</span>
                  {canEdit && (
                    <Button variant="ghost" size="icon" aria-label="Excluir atualização" onClick={() => removeValuation.mutate(item.valuation.id)}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
              ),
            )
          )}
        </Card>
      </section>

      <InvestmentFormDialog open={editOpen} investment={inv} onClose={() => setEditOpen(false)} />
      {(dialog === 'in' || dialog === 'out') && (
        <MovementDialog
          title={dialog === 'in' ? 'Aportar' : 'Resgatar'}
          description={dialog === 'in' ? 'O valor sai da conta escolhida.' : 'O valor volta para a conta escolhida.'}
          submitLabel={dialog === 'in' ? 'Registrar aporte' : 'Registrar resgate'}
          maxAmount={dialog === 'out' ? inv.current_value : undefined}
          onClose={() => setDialog(null)}
          onSubmit={(m) => move.mutateAsync({ investment: inv, direction: dialog, amount: m.amount, date: m.date, accountId: m.accountId!, note: m.note })}
        />
      )}
      {dialog === 'value' && (
        <MovementDialog
          title="Atualizar valor"
          description="Quanto o investimento vale hoje, já com rendimentos (veja no app do banco ou corretora)."
          submitLabel="Salvar"
          defaultAmount={inv.current_value || null}
          needsAccount={false}
          onClose={() => setDialog(null)}
          onSubmit={(m) => addValuation.mutateAsync({ investment_id: inv.id, value: m.amount, valued_on: m.date })}
        />
      )}
      <TransactionFormSheet open={Boolean(selected)} transaction={selected} onClose={() => setSelected(undefined)} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        pending={remove.isPending}
        onConfirm={() => remove.mutate(inv.id, { onSuccess: () => navigate({ to: '/investments' }), onSettled: () => setConfirmDelete(false) })}
        title={`Excluir "${inv.name}"?`}
        description="Só é possível excluir investimentos sem aportes ou resgates. Para guardar o histórico, arquive."
      />
    </div>
  )
}
