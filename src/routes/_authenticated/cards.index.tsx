import { createFileRoute, Link } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import { Archive, ArchiveRestore, CreditCard, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BankCardArt } from '@/components/cards/BankCardArt'
import { CardFormDialog } from '@/components/cards/CardFormDialog'
import { TransactionFormSheet } from '@/components/transactions/TransactionFormSheet'
import { Button } from '@/components/ui/button'
import { Card as Box } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { limitUsed, todayIso, useCardMutations, useCards, useInvoices } from '@/hooks/useCards'
import { usePermission } from '@/hooks/useHousehold'
import { invoiceDates, invoiceStatus, INVOICE_STATUS_LABEL } from '@/lib/finance/invoice'
import { formatCents } from '@/lib/money'
import type { Card, InvoiceSummary } from '@/types/database'

export const Route = createFileRoute('/_authenticated/cards/')({ component: CardsPage })

function CardsPage() {
  const canEdit = usePermission('transactions', 'edit')
  const cards = useCards({ includeArchived: true })
  const invoices = useInvoices().data ?? []
  const { setArchived, deleteCard } = useCardMutations()
  const [form, setForm] = useState<{ open: boolean; card?: Card }>({ open: false })
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Card | null>(null)

  const all = cards.data ?? []
  const active = all.filter((c) => !c.archived_at)
  const archived = all.filter((c) => c.archived_at)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Cartões</h1>
        {canEdit && (
          <div className="flex gap-2">
            {active.length > 0 && (
              <Button variant="outline" onClick={() => setPurchaseOpen(true)}>
                <Plus /> Lançar compra
              </Button>
            )}
            <Button onClick={() => setForm({ open: true })}>
              <Plus /> Novo cartão
            </Button>
          </div>
        )}
      </div>

      {cards.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-80 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <Box className="flex flex-col items-center gap-3 py-12 text-center">
          <CreditCard className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Cadastre seus cartões para acompanhar faturas e limite.</p>
          {canEdit && (
            <Button variant="outline" onClick={() => setForm({ open: true })}>
              <Plus /> Adicionar cartão
            </Button>
          )}
        </Box>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              invoices={invoices}
              canEdit={canEdit}
              onEdit={() => setForm({ open: true, card })}
              onArchive={() => setArchived.mutate({ id: card.id, archived: true })}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <Box className="divide-y divide-border p-0">
          <p className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Arquivados</p>
          {archived.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1 text-sm">{c.name}</span>
              {canEdit && (
                <>
                  <Button variant="ghost" size="icon" aria-label="Restaurar" onClick={() => setArchived.mutate({ id: c.id, archived: false })}>
                    <ArchiveRestore />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setToDelete(c)}>
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
          ))}
        </Box>
      )}

      <CardFormDialog open={form.open} card={form.card} onClose={() => setForm({ open: false })} />
      <TransactionFormSheet
        open={purchaseOpen}
        defaults={{ kind: 'expense_variable', payment_method: 'credit' }}
        onClose={() => setPurchaseOpen(false)}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        pending={deleteCard.isPending}
        onConfirm={() => toDelete && deleteCard.mutate(toDelete.id, { onSettled: () => setToDelete(null) })}
        title={`Excluir "${toDelete?.name}"?`}
        description="Só é possível excluir cartões sem lançamentos."
      />
    </div>
  )
}

function CardTile({
  card,
  invoices,
  canEdit,
  onEdit,
  onArchive,
}: {
  card: Card
  invoices: InvoiceSummary[]
  canEdit: boolean
  onEdit: () => void
  onArchive: () => void
}) {
  const today = todayIso()
  const currentRef = invoiceDates(today, card.closing_day, card.due_day).referenceMonth
  const current = invoices.find((i) => i.card_id === card.id && i.reference_month === currentRef)
  const used = limitUsed(card.id, invoices)
  const usedPct = card.credit_limit ? Math.min(100, (used / card.credit_limit) * 100) : 0
  const status = current ? invoiceStatus(current, today) : 'empty'

  return (
    <Box className="space-y-4 p-4">
      <Link to="/cards/$cardId" params={{ cardId: card.id }} className="block rounded-xl" aria-label={`Abrir ${card.name}`}>
        <BankCardArt
          bank={card.bank}
          color={card.color}
          title={card.name}
          number={card.last_four ? `•••• ${card.last_four}` : null}
          chip
          fallbackIcon={CreditCard}
        />
      </Link>

      <div className="flex items-start gap-2">
        <Link to="/cards/$cardId" params={{ cardId: card.id }} className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            Fatura atual · {INVOICE_STATUS_LABEL[status]}
            {current && ` · vence ${format(parseISO(current.due_on), 'dd/MM')}`}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatCents(current?.total ?? 0)}</p>
        </Link>
        {canEdit && (
          <div className="-mr-2 flex">
            <Button variant="ghost" size="icon" aria-label="Editar cartão" onClick={onEdit}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Arquivar cartão" onClick={onArchive}>
              <Archive />
            </Button>
          </div>
        )}
      </div>

      {card.credit_limit != null && card.credit_limit > 0 && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${usedPct}%`, backgroundColor: card.color }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Disponível {formatCents(Math.max(0, card.credit_limit - used))} de {formatCents(card.credit_limit)}
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Fecha dia {card.closing_day} · vence dia {card.due_day}
      </p>
    </Box>
  )
}
