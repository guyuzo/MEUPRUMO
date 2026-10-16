import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import { CheckCircle2, Pencil, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { DebtFormDialog } from '@/components/debts/DebtFormDialog'
import { BackLink, Field, PageHeader, ProgressBar } from '@/components/shared/layout'
import { MovementDialog } from '@/components/shared/MovementDialog'
import { TransactionFormSheet } from '@/components/transactions/TransactionFormSheet'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAccounts } from '@/hooks/useAccounts'
import { useDebtMutations, useDebtPayments, useDebts } from '@/hooks/useDebts'
import { usePermission } from '@/hooks/useHousehold'
import { DEBT_TYPE_LABEL } from '@/lib/finance/labels'
import { formatCents } from '@/lib/money'
import type { Debt, Transaction } from '@/types/database'

export const Route = createFileRoute('/_authenticated/debts/$debtId')({ component: DebtDetailPage })

function DebtDetailPage() {
  const { debtId } = Route.useParams()
  const navigate = useNavigate()
  const canEdit = usePermission('debts', 'edit')
  const canPay = usePermission('transactions', 'edit')
  const debts = useDebts()
  const debt = debts.data?.find((d) => d.id === debtId)
  const payments = useDebtPayments(debtId)
  const accounts = useAccounts({ includeArchived: true }).data ?? []
  const { save, remove, pay } = useDebtMutations()
  const [editOpen, setEditOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [installments, setInstallments] = useState(1)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [selected, setSelected] = useState<Transaction>()

  if (debts.isSuccess && !debt) {
    return (
      <div className="space-y-4">
        <BackLink to="/debts" label="Dívidas" />
        <Card className="py-12 text-center text-sm text-muted-foreground">Dívida não encontrada.</Card>
      </div>
    )
  }
  if (!debt) return null

  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  const finished = Boolean(debt.paid_off_at) || debt.remaining === 0

  return (
    <div className="space-y-5">
      <BackLink to="/debts" label="Dívidas" />
      <PageHeader
        title={debt.name}
        subtitle={[DEBT_TYPE_LABEL[debt.type], debt.creditor, debt.interest_rate != null && `${debt.interest_rate.toLocaleString('pt-BR')}% a.m.`]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {canPay && !finished && (
              <Button
                onClick={() => {
                  setInstallments(1)
                  setPayOpen(true)
                }}
              >
                Registrar pagamento
              </Button>
            )}
            {canEdit && (
              <>
                <Button variant="outline" size="icon" aria-label="Editar" onClick={() => setEditOpen(true)}>
                  <Pencil />
                </Button>
                <Button variant="outline" size="icon" aria-label="Excluir" onClick={() => setConfirmDelete(true)}>
                  <Trash2 />
                </Button>
              </>
            )}
          </>
        }
      />

      <Card className="space-y-4">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <CardTitle>Falta pagar</CardTitle>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{formatCents(debt.remaining)}</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-muted-foreground">Pago até agora</p>
            <p className="font-medium tabular-nums">{formatCents(debt.paid_amount)}</p>
          </div>
        </div>
        <ProgressBar value={debt.progress} label="Progresso de pagamento" />
        <p className="text-sm text-muted-foreground">
          {debt.total_installments
            ? `${Math.min(debt.installments_paid, debt.total_installments)} de ${debt.total_installments} parcelas pagas`
            : `${Math.round(debt.progress)}% do saldo inicial de ${formatCents(debt.original_amount)}`}
          {debt.installment_amount ? ` · parcela de ${formatCents(debt.installment_amount)}` : ''}
        </p>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              save.mutate({
                id: debt.id,
                ...pickEditable(debt),
                paid_off_at: debt.paid_off_at ? null : new Date().toISOString(),
              })
            }
          >
            {debt.paid_off_at ? (
              <>
                <Undo2 /> Reabrir dívida
              </>
            ) : (
              <>
                <CheckCircle2 /> Marcar como quitada
              </>
            )}
          </Button>
        )}
        {debt.notes && <p className="border-t border-border pt-3 text-sm text-muted-foreground">{debt.notes}</p>}
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Pagamentos</h2>
        <Card className="divide-y divide-border p-0">
          {(payments.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
          ) : (
            payments.data!.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
              >
                <span className="min-w-0">
                  <span className="block text-sm">{format(parseISO(t.occurred_on), 'dd/MM/yyyy')}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[
                      t.debt_installments && `${t.debt_installments} parcela${t.debt_installments > 1 ? 's' : ''}`,
                      t.bank_account_id && accountName.get(t.bank_account_id),
                      t.status === 'pending' && 'pendente',
                      t.notes,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{formatCents(t.amount)}</span>
              </button>
            ))
          )}
        </Card>
      </section>

      <DebtFormDialog open={editOpen} debt={debt} onClose={() => setEditOpen(false)} />
      {payOpen && (
        <MovementDialog
          title="Registrar pagamento"
          description={debt.name}
          submitLabel="Registrar"
          defaultAmount={debt.installment_amount ? debt.installment_amount * installments : null}
          onClose={() => setPayOpen(false)}
          extra={
            debt.total_installments ? (
              <Field label="Parcelas pagas" htmlFor="pay-inst">
                <Input
                  id="pay-inst"
                  type="number"
                  min={1}
                  max={Math.max(1, debt.total_installments - debt.installments_paid)}
                  value={installments}
                  onChange={(e) => setInstallments(Math.max(1, Number(e.target.value) || 1))}
                />
              </Field>
            ) : undefined
          }
          onSubmit={(m) => pay.mutateAsync({ debt, amount: m.amount, date: m.date, accountId: m.accountId!, installments, note: m.note })}
        />
      )}
      <TransactionFormSheet open={Boolean(selected)} transaction={selected} onClose={() => setSelected(undefined)} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(debt.id, {
            onSuccess: () => navigate({ to: '/debts' }),
            onSettled: () => setConfirmDelete(false),
          })
        }
        title={`Excluir "${debt.name}"?`}
        description="Só é possível excluir dívidas sem pagamentos. Para encerrar uma dívida com histórico, marque-a como quitada."
      />
    </div>
  )
}

/** Campos editáveis (o update reenvia o formulário inteiro junto com paid_off_at). */
function pickEditable(d: Debt) {
  return {
    name: d.name,
    creditor: d.creditor,
    type: d.type,
    original_amount: d.original_amount,
    installment_amount: d.installment_amount,
    total_installments: d.total_installments,
    interest_rate: d.interest_rate,
    start_on: d.start_on,
    notes: d.notes,
  }
}
