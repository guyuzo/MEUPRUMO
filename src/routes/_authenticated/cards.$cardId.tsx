import { createFileRoute, Link } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, FileUp, Plus, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { BankLogo } from '@/components/cards/BankLogo'
import { CardPurchaseSheet } from '@/components/cards/CardPurchaseSheet'
import { ImportInvoiceDialog } from '@/components/cards/ImportInvoiceDialog'
import { PayInvoiceDialog } from '@/components/cards/PayInvoiceDialog'
import { MonthPicker } from '@/components/shared/pickers'
import { TransactionList } from '@/components/transactions/TransactionList'
import { TransactionFormSheet } from '@/components/transactions/TransactionFormSheet'
import { Button } from '@/components/ui/button'
import { Card as Box } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { limitUsed, todayIso, useCards, useInvoices, useInvoiceTransactions } from '@/hooks/useCards'
import { usePermission } from '@/hooks/useHousehold'
import { useImportBatches, useInvoiceImportMutations } from '@/hooks/useInvoiceImport'
import { isMonthKey } from '@/lib/dates'
import { invoiceDates, invoiceStatus, INVOICE_STATUS_LABEL, type InvoiceStatus } from '@/lib/finance/invoice'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types/database'

export const Route = createFileRoute('/_authenticated/cards/$cardId')({
  // ref = mês da fatura (mês do vencimento). Sem ref, abre a fatura atual.
  validateSearch: z.object({ ref: z.string().refine(isMonthKey).optional().catch(undefined) }),
  component: CardDetailPage,
})

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  open: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  closed: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  paid: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  overdue: 'bg-red-500/15 text-red-700 dark:text-red-300',
  empty: 'bg-muted text-muted-foreground',
}

function CardDetailPage() {
  const { cardId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const canEdit = usePermission('transactions', 'edit')
  const cards = useCards({ includeArchived: true })
  const invoices = useInvoices().data ?? []
  const card = cards.data?.find((c) => c.id === cardId)

  const today = todayIso()
  const ref = search.ref ?? (card ? invoiceDates(today, card.closing_day, card.due_day).referenceMonth : undefined)
  const invoice = invoices.find((i) => i.card_id === cardId && i.reference_month === ref)
  const transactions = useInvoiceTransactions(invoice?.invoice_id)

  // Compras e pagamentos usam o formulário de lançamento; estornos, o formulário de cartão.
  const [entry, setEntry] = useState<{ open: boolean; tx?: Transaction }>({ open: false })
  const [refund, setRefund] = useState<{ open: boolean; tx?: Transaction }>({ open: false })
  const [importOpen, setImportOpen] = useState(false)
  const [undoBatchId, setUndoBatchId] = useState<string | null>(null)
  const batches = useImportBatches(cardId).data ?? []
  const { undoBatch } = useInvoiceImportMutations()
  const [payOpen, setPayOpen] = useState(false)

  if (cards.isSuccess && !card) {
    return (
      <Box className="py-12 text-center">
        <p className="text-sm text-muted-foreground">Cartão não encontrado.</p>
        <Link to="/cards" className="mt-2 inline-block text-sm text-primary hover:underline">
          Voltar para cartões
        </Link>
      </Box>
    )
  }
  if (!card || !ref) return null

  const status = invoice ? invoiceStatus(invoice, today) : 'empty'
  const remaining = invoice ? Math.max(0, invoice.total - invoice.paid) : 0
  const used = limitUsed(card.id, invoices)
  const batchesHere = batches.filter((b) => b.reference_month === ref)

  return (
    <div className="space-y-5">
      <Link to="/cards" className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Cartões
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BankLogo bank={card.bank} color={card.color} className="size-12" />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{card.name}</h1>
            <p className="text-sm text-muted-foreground">
              {[card.bank, card.last_four && `•••• ${card.last_four}`, `fecha dia ${card.closing_day}`, `vence dia ${card.due_day}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        {canEdit && !card.archived_at && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp /> Importar fatura
            </Button>
            <Button variant="outline" onClick={() => setRefund({ open: true })}>
              <Undo2 /> Estorno
            </Button>
            <Button onClick={() => setEntry({ open: true })}>
              <Plus /> Lançar compra
            </Button>
          </div>
        )}
      </div>

      <div className="flex justify-center sm:justify-start">
        <MonthPicker value={ref} onChange={(m) => navigate({ search: { ref: m }, replace: true })} />
      </div>

      <Box className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLE[status])}>
              {INVOICE_STATUS_LABEL[status]}
            </span>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{formatCents(invoice?.total ?? 0)}</p>
            {invoice && (
              <p className="mt-1 text-sm text-muted-foreground">
                Fecha {format(parseISO(invoice.closing_on), 'dd/MM')} · vence {format(parseISO(invoice.due_on), 'dd/MM/yyyy')}
              </p>
            )}
          </div>
          {invoice && invoice.paid > 0 && (
            <div className="text-right text-sm">
              <p className="text-muted-foreground">Pago {formatCents(invoice.paid)}</p>
              {remaining > 0 && <p className="font-medium">Falta {formatCents(remaining)}</p>}
            </div>
          )}
        </div>
        {canEdit && invoice && remaining > 0 && (
          <Button variant="outline" onClick={() => setPayOpen(true)}>
            Pagar fatura
          </Button>
        )}
        {card.credit_limit != null && card.credit_limit > 0 && (
          <p className="text-xs text-muted-foreground">
            Limite disponível {formatCents(Math.max(0, card.credit_limit - used))} de {formatCents(card.credit_limit)}
          </p>
        )}
      </Box>

      {batchesHere.length > 0 && (
        <Box className="space-y-2 p-4">
          <p className="text-sm font-medium">Importações desta fatura</p>
          <ul className="divide-y divide-border">
            {batchesHere.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2 text-sm">
                <FileUp className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{b.file_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(b.created_at), 'dd/MM/yyyy HH:mm')} · {b.rows_count} lançamento{b.rows_count === 1 ? '' : 's'} ·{' '}
                    {formatCents(b.total)}
                  </span>
                </span>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => setUndoBatchId(b.id)}>
                    Desfazer
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Box>
      )}

      <TransactionList
        transactions={invoice ? (transactions.data ?? []) : []}
        loading={Boolean(invoice) && transactions.isPending}
        onSelect={(tx) => (tx.kind === 'card_refund' ? setRefund({ open: true, tx }) : setEntry({ open: true, tx }))}
      />

      <TransactionFormSheet
        open={entry.open}
        transaction={entry.tx}
        defaults={{ kind: 'expense_variable', payment_method: 'credit', card_id: card.id }}
        onClose={() => setEntry({ open: false })}
      />
      <CardPurchaseSheet
        open={refund.open}
        transaction={refund.tx}
        defaultCardId={card.id}
        defaultKind="card_refund"
        onClose={() => setRefund({ open: false })}
      />
      {payOpen && invoice && <PayInvoiceDialog open card={card} invoice={invoice} onClose={() => setPayOpen(false)} />}
      <ImportInvoiceDialog open={importOpen} defaultCardId={card.id} onClose={() => setImportOpen(false)} />
      <ConfirmDialog
        open={Boolean(undoBatchId)}
        onClose={() => setUndoBatchId(null)}
        pending={undoBatch.isPending}
        onConfirm={() => undoBatchId && undoBatch.mutate(undoBatchId, { onSettled: () => setUndoBatchId(null) })}
        title="Desfazer esta importação?"
        description="Todos os lançamentos que vieram deste arquivo serão removidos da fatura."
        confirmLabel="Desfazer importação"
      />
    </div>
  )
}
