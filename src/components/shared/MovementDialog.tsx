import { format } from 'date-fns'
import { useState, type ReactNode } from 'react'
import { Field } from '@/components/shared/layout'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FieldError, Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useAccounts } from '@/hooks/useAccounts'

export interface Movement {
  amount: number
  date: string
  accountId: string | null
  note: string
}

/**
 * Diálogo de "movimentar dinheiro": valor, data, conta (opcional) e observação.
 * Montar condicionalmente (`{open && <MovementDialog …/>}`) para reiniciar o estado a cada abertura.
 */
export function MovementDialog({
  title,
  description,
  submitLabel,
  defaultAmount,
  needsAccount = true,
  maxAmount,
  extra,
  onClose,
  onSubmit,
}: {
  title: string
  description?: string
  submitLabel: string
  defaultAmount?: number | null
  needsAccount?: boolean
  maxAmount?: number
  extra?: ReactNode
  onClose: () => void
  onSubmit: (movement: Movement) => Promise<unknown>
}) {
  const accounts = useAccounts().data ?? []
  const [amount, setAmount] = useState<number | null>(defaultAmount ?? null)
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  const submit = async () => {
    if (!amount || amount <= 0) return setError('Informe o valor')
    if (maxAmount != null && amount > maxAmount) return setError('Valor maior que o disponível')
    if (needsAccount && !accountId) return setError('Escolha a conta')
    setError(undefined)
    setPending(true)
    try {
      await onSubmit({ amount, date, accountId: needsAccount ? accountId : null, note: note.trim() })
      onClose()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title={title} description={description}>
      <div className="space-y-4">
        <Field label="Valor" htmlFor="mv-amount">
          <MoneyInput id="mv-amount" value={amount} onChange={setAmount} className="h-12 text-lg font-semibold" />
        </Field>
        {extra}
        <div className={needsAccount ? 'grid grid-cols-2 gap-3' : ''}>
          {needsAccount && (
            <Field label="Conta" htmlFor="mv-account">
              <Select id="mv-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Escolha…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id} data-color={a.color}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Data" htmlFor="mv-date">
            <Input id="mv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Observação" htmlFor="mv-note">
          <Input id="mv-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </Field>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
