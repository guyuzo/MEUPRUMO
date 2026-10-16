import { format } from 'date-fns'
import { useState } from 'react'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useAccounts } from '@/hooks/useAccounts'
import { useCardMutations } from '@/hooks/useCards'
import { formatMonth } from '@/lib/dates'
import type { Card, InvoiceSummary } from '@/types/database'

export function PayInvoiceDialog({
  open,
  onClose,
  card,
  invoice,
}: {
  open: boolean
  onClose: () => void
  card: Card
  invoice: InvoiceSummary
}) {
  const accounts = useAccounts().data ?? []
  const { payInvoice } = useCardMutations()
  const remaining = Math.max(0, invoice.total - invoice.paid)
  const [amount, setAmount] = useState<number | null>(remaining)
  const [accountId, setAccountId] = useState(card.default_account_id ?? accounts[0]?.id ?? '')
  const [paidOn, setPaidOn] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [error, setError] = useState<string>()

  const submit = async () => {
    if (!amount || amount <= 0) return setError('Informe o valor')
    if (!accountId) return setError('Escolha a conta')
    setError(undefined)
    await payInvoice.mutateAsync({
      invoice,
      cardName: card.name,
      bank_account_id: accountId,
      amount,
      paid_on: paidOn,
      label: formatMonth(invoice.reference_month),
    })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Pagar fatura" description={`Fatura de ${formatMonth(invoice.reference_month)}`}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pay-amount">Valor</Label>
          <MoneyInput id="pay-amount" value={amount} onChange={setAmount} />
          <p className="text-xs text-muted-foreground">Pagamento parcial é permitido; o restante continua em aberto.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pay-account">Pagar com</Label>
            <Select id="pay-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Escolha…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} data-color={a.color}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-date">Data</Label>
            <Input id="pay-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
        </div>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={payInvoice.isPending}>
            Registrar pagamento
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
