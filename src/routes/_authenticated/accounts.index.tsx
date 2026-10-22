import { createFileRoute, Link } from '@tanstack/react-router'
import { Archive, ArchiveRestore, Landmark, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { useState } from 'react'
import { AccountFormDialog } from '@/components/accounts/AccountFormDialog'
import { BankCardArt } from '@/components/cards/BankCardArt'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useAccountMutations, useAccounts, type AccountWithBalance } from '@/hooks/useAccounts'
import { usePermission } from '@/hooks/useHousehold'
import { ACCOUNT_TYPE_LABEL } from '@/lib/finance/labels'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/accounts/')({ component: AccountsPage })

function AccountsPage() {
  const canEdit = usePermission('transactions', 'edit')
  const accounts = useAccounts({ includeArchived: true })
  const { setArchived, deleteAccount } = useAccountMutations()
  const [form, setForm] = useState<{ open: boolean; account?: AccountWithBalance }>({ open: false })
  const [toDelete, setToDelete] = useState<AccountWithBalance | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const all = accounts.data ?? []
  const active = all.filter((a) => !a.archived_at)
  const archived = all.filter((a) => a.archived_at)
  const total = active.reduce((sum, a) => sum + a.balance, 0)
  const projected = active.reduce((sum, a) => sum + a.projected_balance, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Contas</h1>
        {canEdit && (
          <Button onClick={() => setForm({ open: true })}>
            <Plus /> Nova conta
          </Button>
        )}
      </div>

      <Card className="flex flex-wrap gap-8">
        <div>
          <p className="text-sm text-muted-foreground">Saldo atual</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular-nums', total < 0 && 'text-expense')}>{formatCents(total)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Saldo previsto (com pendentes)</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular-nums text-muted-foreground', projected < 0 && 'text-expense')}>
            {formatCents(projected)}
          </p>
        </div>
      </Card>

      {accounts.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Landmark className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Cadastre suas contas para acompanhar os saldos.</p>
          {canEdit && (
            <Button variant="outline" onClick={() => setForm({ open: true })}>
              <Plus /> Adicionar conta
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              canEdit={canEdit}
              onEdit={() => setForm({ open: true, account })}
              onArchive={() => setArchived.mutate({ id: account.id, archived: true })}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-sm text-muted-foreground hover:underline">
            {showArchived ? 'Ocultar' : 'Mostrar'} contas arquivadas ({archived.length})
          </button>
          {showArchived && (
            <Card className="mt-2 divide-y divide-border p-0">
              {archived.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex-1 text-sm">{a.name}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{formatCents(a.balance)}</span>
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="icon" aria-label="Restaurar" onClick={() => setArchived.mutate({ id: a.id, archived: false })}>
                        <ArchiveRestore />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setToDelete(a)}>
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      <AccountFormDialog open={form.open} account={form.account} onClose={() => setForm({ open: false })} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        pending={deleteAccount.isPending}
        onConfirm={() => toDelete && deleteAccount.mutate(toDelete.id, { onSettled: () => setToDelete(null) })}
        title={`Excluir "${toDelete?.name}"?`}
        description="Só é possível excluir contas sem transações."
      />
    </div>
  )
}

function AccountCard({
  account,
  canEdit,
  onEdit,
  onArchive,
}: {
  account: AccountWithBalance
  canEdit: boolean
  onEdit: () => void
  onArchive: () => void
}) {
  return (
    <Card className="space-y-4 p-4">
      <Link to="/accounts/$accountId" params={{ accountId: account.id }} className="block rounded-xl" aria-label={`Abrir ${account.name}`}>
        <BankCardArt
          bank={account.bank}
          color={account.color}
          title={account.name}
          subtitle={ACCOUNT_TYPE_LABEL[account.type]}
          number={
            [account.branch && `Ag ${account.branch}`, account.account_number && `•••• ${account.account_number.slice(-4)}`]
              .filter(Boolean)
              .join(' · ') || null
          }
          fallbackIcon={account.type === 'cash' ? Wallet : Landmark}
        />
      </Link>
      <div className="flex items-start gap-2">
        <Link to="/accounts/$accountId" params={{ accountId: account.id }} className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Saldo atual</p>
          <p className={cn('mt-1 text-xl font-semibold tabular-nums', account.balance < 0 && 'text-expense')}>
            {formatCents(account.balance)}
          </p>
        </Link>
        {canEdit && (
          <div className="-mr-2 flex">
            <Button variant="ghost" size="icon" aria-label="Editar conta" onClick={onEdit}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Arquivar conta" onClick={onArchive}>
              <Archive />
            </Button>
          </div>
        )}
      </div>
      {account.pending_total !== 0 && (
        <p className="text-xs text-muted-foreground">
          Previsto: {formatCents(account.projected_balance)} ({account.pending_total > 0 ? '+' : ''}
          {formatCents(account.pending_total)} pendente)
        </p>
      )}
    </Card>
  )
}
