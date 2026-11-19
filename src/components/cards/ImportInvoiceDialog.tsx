import { format, parseISO } from 'date-fns'
import { AlertTriangle, FileUp, Lock, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { CategoryPicker } from '@/components/planning/CategoryPicker'
import { MonthPicker } from '@/components/shared/pickers'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Dropdown } from '@/components/ui/dropdown'
import { FieldError, Input, Label } from '@/components/ui/input'
import { todayIso, useCards } from '@/hooks/useCards'
import { useMembers } from '@/hooks/useFamily'
import {
  duplicateKey,
  fetchExistingKeys,
  parcelKey,
  PROJECTED_PREFIX,
  useCategorySuggestions,
  useInvoiceImportMutations,
  type ExistingKeys,
  type ImportRow,
} from '@/hooks/useInvoiceImport'
import { useCategories } from '@/hooks/usePlanning'
import { formatMonthTitle, shiftMonth } from '@/lib/dates'
import { parseInstallment, upcomingInstallments } from '@/lib/finance/installments'
import { invoiceDates, invoiceDatesForReference } from '@/lib/finance/invoice'
import { extractPdfLines, isPdf, PdfPasswordError } from '@/lib/import/pdf'
import { findSimilar, type Similar } from '@/lib/import/similar'
import { classifyLine, normalizeDescription, parsePdfLines, parseStatement, readStatementFile, type LineKind } from '@/lib/import/statement'
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
  member_id: string
  /** Final do cartão (adicional/virtual) que algumas faturas mostram antes da descrição. */
  cardFinal: string | null
  /** Parcela prevista (de uma fatura importada antes) que esta linha substitui. */
  replaces: string | null
  /** Gasto com o mesmo valor (no cartão ou repetido no arquivo): a pessoa responde se é o mesmo. */
  similar: Similar | null
  answer: SimilarAnswer | null
}

/** keep: é o mesmo, não importa esta linha · replace: é o mesmo, fica o da fatura · different: importa as duas. */
type SimilarAnswer = 'keep' | 'replace' | 'different'

type ExistingRow = ExistingKeys['rows'][number]

/**
 * Parcelas que ainda faltam das compras parceladas da fatura: cada uma vai para a fatura do mês em que
 * cai (3/10 na fatura de nov → 4/10 em dez … 10/10 em jun). Pula as que já estão no app ou no arquivo.
 */
function buildProjections(rows: ReviewRow[], reference: string, existing: ExistingKeys['parcels']): ImportRow[] {
  const inFile = new Set(rows.map((r) => parcelKey(r.date, r.description)).filter(Boolean))
  const out: ImportRow[] = []
  for (const r of rows) {
    // Já lançada também conta: reimportar uma fatura antiga completa as parcelas futuras que faltam.
    if (r.kind !== 'purchase' || !(r.include || r.duplicate)) continue
    const description = r.description.trim()
    for (const next of upcomingInstallments(description)) {
      const key = parcelKey(r.date, next.description)
      if (!key || existing.has(key) || inFile.has(key)) continue
      out.push({
        kind: 'card_purchase',
        occurred_on: r.date,
        description: next.description,
        amount: r.amount,
        external_id: `${PROJECTED_PREFIX}${r.id}:${next.number}`.slice(0, 200),
        category_id: r.category_id || null,
        subcategory_id: r.subcategory_id || null,
        household_member_id: r.member_id || null,
        invoice_month: shiftMonth(reference, next.monthsAhead),
      })
    }
  }
  return out
}

// "•••• 3568 Mp *Loja" → final 3568, descrição "Mp *Loja"
const CARD_FINAL = /^[•*·.]{2,}\s*(\d{4})\s+(.+)$/

function splitCardFinal(description: string): { cardFinal: string | null; description: string } {
  const match = description.match(CARD_FINAL)
  return match ? { cardFinal: match[1], description: match[2].trim() } : { cardFinal: null, description }
}

/** Importa uma fatura fechada (PDF/OFX/CSV): escolher cartão e fatura → enviar arquivo → revisar. */
function ImportInvoiceDialogContent({ onClose, defaultCardId }: { open: boolean; onClose: () => void; defaultCardId?: string }) {
  const cards = useCards().data ?? []
  const members = useMembers().data ?? []
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
  const [existingParcels, setExistingParcels] = useState<ExistingKeys['parcels']>(new Map())
  const [existingById, setExistingById] = useState<Map<string, ExistingRow>>(new Map())
  // PDF com senha: guarda o arquivo até a pessoa digitar a senha.
  const [locked, setLocked] = useState<File | null>(null)
  const [password, setPassword] = useState('')

  const handleFile = async (file: File, pdfPassword?: string) => {
    if (!card || !reference) return
    setError(undefined)
    if (file.size > MAX_FILE_BYTES) return setError('Arquivo muito grande (máximo 5 MB).')
    setLoading(true)
    try {
      let parsed
      if (isPdf(file)) {
        try {
          parsed = parsePdfLines(await extractPdfLines(file, pdfPassword), reference)
        } catch (e) {
          if (e instanceof PdfPasswordError) {
            setLocked(file)
            setError(e.wrongPassword ? 'Senha incorreta. Tente de novo.' : undefined)
            return
          }
          throw e
        }
        setLocked(null)
        setPassword('')
      } else {
        parsed = parseStatement(file.name, await readStatementFile(file), reference)
      }
      if (parsed.lines.length === 0) {
        setError(parsed.warnings[0] ?? 'Nenhum lançamento encontrado no arquivo.')
        return
      }
      if (parsed.lines.length > MAX_ROWS) return setError(`O arquivo tem mais de ${MAX_ROWS} lançamentos.`)
      const sorted = [...parsed.lines].sort((a, b) => a.date.localeCompare(b.date))
      const existing = await fetchExistingKeys(card.id, sorted[0].date, sorted[sorted.length - 1].date)
      // O histórico pode ainda estar carregando se o arquivo foi escolhido logo ao abrir.
      const suggest = suggestions.data ?? (await suggestions.refetch()).data
      setExistingParcels(existing.parcels)
      setExistingById(new Map(existing.rows.map((t) => [t.id, t])))
      const reviewed: ReviewRow[] = sorted.map((line) => {
          const kind = classifyLine(line)
          const { cardFinal, description } = splitCardFinal(line.description)
          // Parcela que uma fatura anterior já tinha previsto: a real entra no lugar dela.
          const key = kind === 'purchase' ? parcelKey(line.date, description) : null
          const known = key ? existing.parcels.get(key) : undefined
          const replaces = known?.projected ? known.id : null
          const duplicate =
            !replaces &&
            (Boolean(known) || existing.externalIds.has(line.externalId) || existing.keys.has(duplicateKey(line.date, line.amount, line.description)))
          const hint = suggest?.get(normalizeDescription(description)) ?? suggest?.get(normalizeDescription(line.description))
          return {
            id: line.externalId,
            date: line.date,
            description,
            cardFinal,
            replaces,
            member_id: '',
            amount: line.amount,
            kind,
            duplicate,
            // Pagamentos da fatura e duplicados vêm desmarcados.
            include: kind !== 'payment' && !duplicate,
            category_id: kind === 'purchase' ? (hint?.category_id ?? '') : '',
            subcategory_id: kind === 'purchase' ? (hint?.subcategory_id ?? '') : '',
            similar: null,
            answer: null,
          }
        })
      // Mesmo valor de um gasto já no cartão (ou repetido no arquivo): perguntar antes de importar.
      const similar = findSimilar(
        reviewed.map((r) => ({ id: r.id, date: r.date, description: r.description, amount: r.amount, comparable: r.kind !== 'payment' })),
        existing.rows,
        new Set(reviewed.filter((r) => r.duplicate || r.replaces).map((r) => r.id)),
      )
      setRows(reviewed.map((r) => ({ ...r, similar: similar.get(r.id) ?? null })))
      setWarnings(parsed.warnings)
      setFileName(file.name)
    } catch {
      setError('Não consegui ler o arquivo. Confira se é o PDF, OFX ou CSV da fatura exportado pelo banco.')
    } finally {
      setLoading(false)
    }
  }

  const selected = (rows ?? []).filter((r) => r.include && r.kind !== 'payment')
  const total = selected.reduce((s, r) => s + r.amount, 0)
  const projections = rows && reference ? buildProjections(rows, reference, existingParcels) : []
  const update = (id: string, patch: Partial<ReviewRow>) => setRows((list) => list?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? null)

  // Resposta sobre o gasto de mesmo valor. "Usar o da fatura" herda categoria e pessoa do lançado à mão.
  const answerFor = (r: ReviewRow, answer: SimilarAnswer): ReviewRow => {
    if (answer === 'keep') return { ...r, answer, include: false }
    if (answer === 'replace' && r.similar?.source === 'existing') {
      const old = existingById.get(r.similar.tx.id)
      return {
        ...r,
        answer,
        include: true,
        category_id: r.category_id || old?.category_id || '',
        subcategory_id: r.category_id ? r.subcategory_id : old?.subcategory_id || '',
        member_id: r.member_id || old?.household_member_id || '',
      }
    }
    return { ...r, answer, include: true }
  }
  const answer = (id: string, value: SimilarAnswer) => setRows((list) => list?.map((r) => (r.id === id ? answerFor(r, value) : r)) ?? null)
  const answerAllPending = (value: 'keep' | 'different') =>
    setRows((list) => list?.map((r) => (r.similar && !r.answer ? answerFor(r, value) : r)) ?? null)
  const pending = (rows ?? []).filter((r) => r.similar && !r.answer && r.include)
  const similarCount = (rows ?? []).filter((r) => r.similar).length
  const rowById = new Map((rows ?? []).map((r) => [r.id, r]))
  const finals = [...new Set((rows ?? []).map((r) => r.cardFinal).filter(Boolean) as string[])]
  // Pessoa de um final vale para todas as linhas daquele final.
  const setFinalMember = (final: string, member_id: string) =>
    setRows((list) => list?.map((r) => (r.cardFinal === final ? { ...r, member_id } : r)) ?? null)
  const finalMember = (final: string) => {
    const ids = new Set((rows ?? []).filter((r) => r.cardFinal === final).map((r) => r.member_id))
    return ids.size === 1 ? [...ids][0] : '__mixed'
  }
  const memberOptions = [
    { value: '', label: 'Casa', description: 'Sem pessoa' },
    ...members.map((m) => ({ value: m.id, label: m.full_name, color: m.color })),
  ]

  const submit = async () => {
    if (!card || !reference || selected.length + projections.length === 0 || pending.length > 0) return
    const payload: ImportRow[] = selected.map((r) => {
      const replaces = r.replaces ?? (r.answer === 'replace' && r.similar?.source === 'existing' ? r.similar.tx.id : null)
      return {
      kind: r.kind === 'refund' ? 'card_refund' : 'card_purchase',
      occurred_on: r.date,
      description: r.description.trim() || 'Compra no cartão',
      household_member_id: r.member_id || null,
      amount: Math.abs(r.amount),
      external_id: r.id,
      category_id: r.kind === 'purchase' ? r.category_id || null : null,
      subcategory_id: r.kind === 'purchase' ? r.subcategory_id || null : null,
      ...(replaces ? { replaces } : {}),
      }
    })
    await importStatement.mutateAsync({ cardId: card.id, referenceMonth: reference, fileName, rows: [...payload, ...projections] })
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
      description={rows ? `${fileName} · ${card?.name} · Fatura de ${formatMonthTitle(reference!)}` : 'Use o PDF da fatura ou o arquivo OFX/CSV que o banco disponibiliza.'}
      className="max-w-4xl"
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
            <span className="text-xs text-muted-foreground">PDF, OFX ou CSV · ou arraste aqui · o arquivo é lido no seu navegador</span>
          </button>
          {locked && (
            <form
              className="space-y-2 rounded-lg border border-border p-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (password) handleFile(locked, password)
              }}
            >
              <Label htmlFor="imp-pdf-password">
                <Lock className="mr-1 inline size-3.5" /> {locked.name} tem senha
              </Label>
              <p className="text-xs text-muted-foreground">
                Muitos bancos protegem a fatura com parte do CPF. A senha só é usada aqui no navegador para abrir o arquivo.
              </p>
              <div className="flex gap-2">
                <Input
                  id="imp-pdf-password"
                  type="password"
                  autoFocus
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button type="submit" disabled={!password || loading}>
                  Abrir
                </Button>
              </div>
            </form>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,application/pdf,.ofx,.qfx,.csv,.txt,text/csv"
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

          {members.length > 1 && finals.length > 0 && (
            <div className="space-y-2 rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                Quem usa cada final do cartão? A escolha vale para todas as compras daquele final (dá para mudar linha a linha depois).
              </p>
              <div className="flex flex-wrap gap-2">
                {finals.map((final) => (
                  <div key={final} className="flex items-center gap-2 rounded-lg border border-border bg-card pl-3">
                    <span className="text-sm tabular-nums text-muted-foreground">•••• {final}</span>
                    <div className="w-40">
                      <Dropdown
                        aria-label={`Pessoa do final ${final}`}
                        variant="row"
                        value={finalMember(final)}
                        placeholder="Várias pessoas"
                        onChange={(id) => setFinalMember(final, id)}
                        options={memberOptions}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {similarCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-500/10 p-3 text-sm">
              <p className="min-w-0 flex-1">
                <AlertTriangle className="mr-1 inline size-4 text-amber-700 dark:text-amber-400" />
                {similarCount === 1 ? '1 gasto tem' : `${similarCount} gastos têm`} o mesmo valor de outro já lançado ou repetido na fatura.{' '}
                {pending.length > 0 ? (
                  <span className="font-medium">Diga em cada linha se é o mesmo gasto ({pending.length} sem resposta).</span>
                ) : (
                  <span className="text-muted-foreground">Tudo respondido.</span>
                )}
              </p>
              {pending.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => answerAllPending('keep')}>
                    Todos são o mesmo
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => answerAllPending('different')}>
                    Todos são diferentes
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={rows.filter((r) => r.kind !== 'payment').every((r) => r.include)}
                onChange={(e) => setRows(rows.map((r) => (r.kind === 'payment' ? r : { ...r, include: e.target.checked })))}
              />
              Selecionar todos
            </label>
            <span className="text-muted-foreground">
              {rows.length} linhas no arquivo
              {(() => {
                const parcels = rows.filter((r) => r.kind === 'purchase' && parseInstallment(r.description)).length
                return parcels ? ` · ${parcels} parcela${parcels === 1 ? '' : 's'}` : ''
              })()}
            </span>
          </div>

          <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {rows.map((r) => (
              <li key={r.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2', !r.include && 'opacity-60')}>
                <Checkbox
                  aria-label={`Importar ${r.description}`}
                  checked={r.include}
                  disabled={r.kind === 'payment'}
                  onChange={(e) =>
                    r.similar
                      ? // Marcar/desmarcar um possível duplicado também responde a pergunta.
                        answer(r.id, e.target.checked ? (r.answer === 'replace' ? 'replace' : 'different') : 'keep')
                      : update(r.id, { include: e.target.checked })
                  }
                />
                <div className="min-w-0 flex-1">
                  {r.kind === 'payment' ? (
                    <p className="truncate text-sm">{r.description}</p>
                  ) : (
                    <input
                      value={r.description}
                      maxLength={120}
                      onChange={(e) => update(r.id, { description: e.target.value })}
                      aria-label="Nome do lançamento"
                      title="Clique para renomear"
                      className="-ml-1.5 h-8 w-full truncate rounded-md border border-transparent bg-transparent px-1.5 text-sm hover:border-input focus:border-input focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  )}
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {format(parseISO(r.date), 'dd/MM/yyyy')}
                    {r.cardFinal && <span className="tabular-nums">· final {r.cardFinal}</span>}
                    {r.duplicate && <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300">Já lançado</Badge>}
                    {r.replaces && <Badge className="bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">Confirma parcela prevista</Badge>}
                    {r.kind === 'payment' && <Badge className="bg-muted">Pagamento da fatura · não importa</Badge>}
                    {r.kind === 'refund' && <Badge className="bg-sky-500/15 text-sky-800 dark:text-sky-300">Estorno</Badge>}
                    {r.kind === 'purchase' &&
                      (() => {
                        const parcel = parseInstallment(r.description)
                        return parcel ? (
                          <Badge className="bg-violet-500/15 text-violet-800 dark:text-violet-300">
                            Parcela {parcel.current}/{parcel.total}
                            {parcel.current < parcel.total
                              ? ` · faltam ${parcel.total - parcel.current}`
                              : ' · última'}
                          </Badge>
                        ) : null
                      })()}
                  </p>
                </div>
                {r.kind !== 'payment' && (
                  // Celular: categoria e pessoa vão para a linha de baixo (depois do valor); desktop: entre descrição e valor.
                  <div className="order-last flex w-full gap-1 pl-7 sm:order-none sm:w-auto sm:pl-0">
                    {r.kind === 'purchase' && (
                      <div className="min-w-0 flex-1 sm:w-48 sm:flex-none">
                        <CategoryPicker
                          categories={categories}
                          categoryId={r.category_id}
                          subcategoryId={r.subcategory_id}
                          onChange={(category_id, subcategory_id) => update(r.id, { category_id, subcategory_id })}
                        />
                      </div>
                    )}
                    {members.length > 1 && (
                      <div className="min-w-0 flex-1 sm:w-32 sm:flex-none">
                        <Dropdown
                          aria-label="Quem gastou"
                          variant="row"
                          value={r.member_id}
                          onChange={(member_id) => update(r.id, { member_id })}
                          options={memberOptions}
                        />
                      </div>
                    )}
                  </div>
                )}
                <span className={cn('shrink-0 text-right text-sm font-medium tabular-nums sm:w-28', r.amount < 0 && 'text-income')}>
                  {r.amount < 0 ? '+' : ''}
                  {formatCents(Math.abs(r.amount))}
                </span>
                {r.similar && <SimilarQuestion row={r} other={r.similar.source === 'file' ? rowById.get(r.similar.lineId) : undefined} onAnswer={(a) => answer(r.id, a)} />}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <p className="text-sm">
              <span className="font-medium">{selected.length}</span> para importar · total{' '}
              <span className="font-semibold tabular-nums">{formatCents(total)}</span>
              {projections.length > 0 && (
                <span className="block text-xs text-muted-foreground">
                  + {projections.length} parcela{projections.length === 1 ? '' : 's'} futura{projections.length === 1 ? '' : 's'} nas próximas
                  faturas ({formatCents(projections.reduce((s, p) => s + p.amount, 0))})
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRows(null)}>
                Voltar
              </Button>
              <Button onClick={submit} disabled={selected.length + projections.length === 0 || pending.length > 0 || importStatement.isPending}>
                <Upload />{' '}
                {pending.length > 0
                  ? `Responda ${pending.length} possíve${pending.length === 1 ? 'l duplicado' : 'is duplicados'}`
                  : selected.length > 0
                    ? `Importar ${selected.length}`
                    : `Lançar ${projections.length} parcelas futuras`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}

/** Pergunta de uma linha com o mesmo valor de outro gasto: é o mesmo ou são diferentes? */
function SimilarQuestion({ row, other, onAnswer }: { row: ReviewRow; other?: ReviewRow; onAnswer: (a: SimilarAnswer) => void }) {
  const similar = row.similar!
  const options: { value: SimilarAnswer; label: string }[] =
    similar.source === 'existing'
      ? [
          { value: 'keep', label: 'É o mesmo · manter o que já está' },
          // Parcela de um parcelamento do app não pode ser trocada sozinha.
          ...(similar.tx.inPlan ? [] : [{ value: 'replace' as const, label: 'É o mesmo · usar o da fatura' }]),
          { value: 'different', label: 'São diferentes' },
        ]
      : [
          { value: 'keep', label: 'É cobrança repetida · importar só uma' },
          { value: 'different', label: 'São compras diferentes' },
        ]
  return (
    <div
      className={cn(
        'order-last flex w-full flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs',
        row.answer ? 'bg-muted/60' : 'bg-amber-500/10 ring-1 ring-amber-500/30',
      )}
    >
      <p className="min-w-0 flex-1 basis-full sm:basis-auto">
        {similar.source === 'existing' ? (
          <>
            Mesmo valor de <span className="font-medium">“{similar.tx.description}”</span> em {format(parseISO(similar.tx.date), 'dd/MM')}, já
            lançado neste cartão. É o mesmo gasto?
          </>
        ) : (
          <>
            Aparece {other ? <>também como <span className="font-medium">“{other.description}”</span></> : 'outra vez'} na fatura, com a mesma data e
            valor. É cobrança repetida?
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="É o mesmo gasto?">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={row.answer === o.value}
            onClick={() => onAnswer(o.value)}
            className={cn(
              'rounded-full border px-2.5 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              row.answer === o.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', className)}>{children}</span>
}

/** Monta só quando aberto: cada abertura começa do zero. */
export function ImportInvoiceDialog(props: { open: boolean; onClose: () => void; defaultCardId?: string }) {
  return props.open ? <ImportInvoiceDialogContent {...props} /> : null
}
