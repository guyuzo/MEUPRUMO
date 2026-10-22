import { format, parseISO } from 'date-fns'
import { AlertTriangle, FileUp, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { CategoryPicker } from '@/components/planning/CategoryPicker'
import { MonthPicker } from '@/components/shared/pickers'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Dropdown } from '@/components/ui/dropdown'
import { FieldError, Label } from '@/components/ui/input'
import { todayIso, useCards } from '@/hooks/useCards'
import {
  duplicateKey,
  fetchExistingKeys,
  useCategorySuggestions,
  useInvoiceImportMutations,
  type ImportRow,
} from '@/hooks/useInvoiceImport'
import { useCategories } from '@/hooks/usePlanning'
import { formatMonthTitle, shiftMonth } from '@/lib/dates'
import { invoiceDates, invoiceDatesForReference } from '@/lib/finance/invoice'
import { classifyLine, normalizeDescription, parseStatement, readStatementFile, type LineKind } from '@/lib/import/statement'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 2000

interface ReviewRow {
  id: string
  date: string
  description: string
  amount: number
  kind: LineKind
  duplicate: boolean
  include: boolean
  category_id: string
  subcategory_id: string
}

/** Importa uma fatura fechada (OFX/CSV): escolher cartão e fatura → enviar arquivo → revisar. */
function ImportInvoiceDialogContent({ onClose, defaultCardId }: { open: boolean; onClose: () => void; defaultCardId?: string }) {
  const cards = useCards().data ?? []
  const categories = (useCategories().data ?? []).filter((c) => c.kind === 'expense')
  const suggestions = useCategorySuggestions(true)
  const { importStatement } = useInvoiceImportMutations()
  const fileInput = useRef<HTMLInputElement>(null)
  const [today] = useState(todayIso)

  const [cardId, setCardId] = useState(defaultCardId ?? '')
  const card = cards.find((c) => c.id === (cardId || cards[0]?.id))
  // Padrão: a última fatura fechada (anterior à que está aberta hoje).
  const lastClosed = card ? shiftMonth(invoiceDates(today, card.closing_day, card.due_day).referenceMonth, -1) : null
  const [refChoice, setRefChoice] = useState<string | null>(null)
  const reference = refChoice ?? lastClosed
  const dates = card && reference ? invoiceDatesForReference(reference, card.closing_day, card.due_day) : null

  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const handleFile = async (file: File) => {
    if (!card || !reference) return
    setError(undefined)
    if (file.size > MAX_FILE_BYTES) return setError('Arquivo muito grande (máximo 5 MB).')
    setLoading(true)
    try {
      const text = await readStatementFile(file)
      const parsed = parseStatement(file.name, text, reference)
      if (parsed.lines.length === 0) {
        setError(parsed.warnings[0] ?? 'Nenhum lançamento encontrado no arquivo.')
        return
      }
      if (parsed.lines.length > MAX_ROWS) return setError(`O arquivo tem mais de ${MAX_ROWS} lançamentos.`)
      const sorted = [...parsed.lines].sort((a, b) => a.date.localeCompare(b.date))
      const existing = await fetchExistingKeys(card.id, sorted[0].date, sorted[sorted.length - 1].date)
      // O histórico pode ainda estar carregando se o arquivo foi escolhido logo ao abrir.
      const suggest = suggestions.data ?? (await suggestions.refetch()).data
      setRows(
        sorted.map((line) => {
          const kind = classifyLine(line)
          const duplicate = existing.externalIds.has(line.externalId) || existing.keys.has(duplicateKey(line.date, line.amount, line.description))
          const hint = suggest?.get(normalizeDescription(line.description))
          return {
            id: line.externalId,
            date: line.date,
            description: line.description,
            amount: line.amount,
            kind,
            duplicate,
            // Pagamentos da fatura e duplicados vêm desmarcados.
            include: kind !== 'payment' && !duplicate,
            category_id: kind === 'purchase' ? (hint?.category_id ?? '') : '',
            subcategory_id: kind === 'purchase' ? (hint?.subcategory_id ?? '') : '',
          }
        }),
      )
      setWarnings(parsed.warnings)
      setFileName(file.name)
    } catch {
      setError('Não consegui ler o arquivo. Confira se é um OFX ou CSV exportado pelo banco.')
    } finally {
      setLoading(false)
    }
  }

  const selected = (rows ?? []).filter((r) => r.include && r.kind !== 'payment')
  const total = selected.reduce((s, r) => s + r.amount, 0)
  const update = (id: string, patch: Partial<ReviewRow>) => setRows((list) => list?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? null)

  const submit = async () => {
    if (!card || !reference || selected.length === 0) return
    const payload: ImportRow[] = selected.map((r) => ({
      kind: r.kind === 'refund' ? 'card_refund' : 'card_purchase',
      occurred_on: r.date,
      description: r.description,
      amount: Math.abs(r.amount),
      external_id: r.id,
      category_id: r.kind === 'purchase' ? r.category_id || null : null,
      subcategory_id: r.kind === 'purchase' ? r.subcategory_id || null : null,
    }))
    await importStatement.mutateAsync({ cardId: card.id, referenceMonth: reference, fileName, rows: payload })
    onClose()
  }

  if (cards.length === 0) {
    return (
      <Dialog open onClose={onClose} title="Importar fatura">
        <p className="text-sm text-muted-foreground">Cadastre um cartão em Contas › Cartões para importar a fatura dele.</p>
      </Dialog>
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Importar fatura fechada"
      description={rows ? `${fileName} · ${card?.name} · Fatura de ${formatMonthTitle(reference!)}` : 'Use o arquivo OFX ou CSV que o banco disponibiliza para a fatura.'}
      className="max-w-3xl"
    >
      {!rows ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="imp-card">Cartão</Label>
              <Dropdown
                id="imp-card"
                value={card?.id ?? ''}
                onChange={(id) => {
                  setCardId(id)
                  setRefChoice(null)
                }}
                options={cards.map((c) => ({
                  value: c.id,
                  label: c.name,
                  color: c.color,
                  description: [c.bank, c.last_four && `•••• ${c.last_four}`].filter(Boolean).join(' · ') || undefined,
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fatura</Label>
              {reference && <MonthPicker value={reference} onChange={setRefChoice} />}
            </div>
          </div>
          {dates && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              Fatura de <span className="font-medium text-foreground">{formatMonthTitle(dates.referenceMonth).replace(' de ', '/')}</span> · fechou{' '}
              {format(parseISO(dates.closingOn), 'dd/MM')} · vence {format(parseISO(dates.dueOn), 'dd/MM')}
              {dates.closingOn > today && <span className="ml-1 text-amber-700 dark:text-amber-400">(ainda aberta)</span>}
            </p>
          )}

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files[0]
              if (file) handleFile(file)
            }}
            disabled={loading}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-input px-4 py-10 text-center hover:border-primary hover:bg-muted/50"
          >
            <FileUp className="size-8 text-muted-foreground" />
            <span className="text-sm font-medium">{loading ? 'Lendo arquivo…' : 'Escolher arquivo da fatura'}</span>
            <span className="text-xs text-muted-foreground">OFX ou CSV · ou arraste aqui · o arquivo é lido no seu navegador</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".ofx,.qfx,.csv,.txt,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
          <FieldError message={error} />
        </div>
      ) : (
        <div className="space-y-3">
          {warnings.length > 0 && (
            <details className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                <AlertTriangle className="mr-1 inline size-3.5" />
                {warnings.length} aviso{warnings.length === 1 ? '' : 's'} na leitura do arquivo
              </summary>
              <ul className="mt-1 list-disc pl-5">
                {warnings.slice(0, 20).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex items-center justify-between gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={rows.filter((r) => r.kind !== 'payment').every((r) => r.include)}
                onChange={(e) => setRows(rows.map((r) => (r.kind === 'payment' ? r : { ...r, include: e.target.checked })))}
              />
              Selecionar todos
            </label>
            <span className="text-muted-foreground">{rows.length} linhas no arquivo</span>
          </div>

          <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {rows.map((r) => (
              <li key={r.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2', !r.include && 'opacity-60')}>
                <input
                  type="checkbox"
                  aria-label={`Importar ${r.description}`}
                  className="size-4 shrink-0 accent-primary"
                  checked={r.include}
                  disabled={r.kind === 'payment'}
                  onChange={(e) => update(r.id, { include: e.target.checked })}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{r.description}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {format(parseISO(r.date), 'dd/MM/yyyy')}
                    {r.duplicate && <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300">Já lançado</Badge>}
                    {r.kind === 'payment' && <Badge className="bg-muted">Pagamento da fatura · não importa</Badge>}
                    {r.kind === 'refund' && <Badge className="bg-sky-500/15 text-sky-800 dark:text-sky-300">Estorno</Badge>}
                  </p>
                </div>
                {r.kind === 'purchase' && (
                  // Celular: categoria vai para a linha de baixo (depois do valor); desktop: entre descrição e valor.
                  <div className="order-last w-full pl-7 sm:order-none sm:w-56 sm:pl-0">
                    <CategoryPicker
                      categories={categories}
                      categoryId={r.category_id}
                      subcategoryId={r.subcategory_id}
                      onChange={(category_id, subcategory_id) => update(r.id, { category_id, subcategory_id })}
                    />
                  </div>
                )}
                <span className={cn('shrink-0 text-right text-sm font-medium tabular-nums sm:w-28', r.amount < 0 && 'text-income')}>
                  {r.amount < 0 ? '+' : ''}
                  {formatCents(Math.abs(r.amount))}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <p className="text-sm">
              <span className="font-medium">{selected.length}</span> para importar · total{' '}
              <span className="font-semibold tabular-nums">{formatCents(total)}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRows(null)}>
                Voltar
              </Button>
              <Button onClick={submit} disabled={selected.length === 0 || importStatement.isPending}>
                <Upload /> Importar {selected.length}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', className)}>{children}</span>
}

/** Monta só quando aberto: cada abertura começa do zero. */
export function ImportInvoiceDialog(props: { open: boolean; onClose: () => void; defaultCardId?: string }) {
  return props.open ? <ImportInvoiceDialogContent {...props} /> : null
}
