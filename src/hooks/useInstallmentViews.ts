import { useQuery } from '@tanstack/react-query'
import { todayIso, useCards, useInstallmentPlans, useInvoices, type InstallmentPlanWithParts } from '@/hooks/useCards'
import { useHousehold } from '@/hooks/useHousehold'
import { currentMonthKey, shiftMonth } from '@/lib/dates'
import { lastInstallmentMonth, parseInstallment } from '@/lib/finance/installments'
import { supabase } from '@/lib/supabase'
import type { Card, InvoiceSummary, Transaction } from '@/types/database'

export interface PlanView {
  plan: InstallmentPlanWithParts
  card?: Card
  /** Parcelas cuja fatura já venceu. */
  charged: number
  remaining: number
  remainingAmount: number
  installmentAmount: number
  /** Mês (de referência da fatura) da primeira e da última parcela. */
  startMonth?: string
  endMonth?: string
  /** Parcela que cai na fatura deste mês, se houver. */
  thisMonth?: number
  /** Reconhecido pelo texto da descrição (ex.: fatura importada), não criado como parcelamento no app. */
  detected?: boolean
}

function describe(plan: InstallmentPlanWithParts, invoices: Map<string, InvoiceSummary>, cards: Map<string, Card>, today: string): PlanView {
  const parts = [...plan.parts].sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0))
  const invoiceOf = (p: (typeof parts)[number]) => (p.invoice_id ? invoices.get(p.invoice_id) : undefined)
  const charged = parts.filter((p) => {
    const inv = invoiceOf(p)
    return inv ? inv.due_on < today : false
  })
  const month = currentMonthKey()
  const current = parts.find((p) => invoiceOf(p)?.reference_month === month)
  const last = parts.at(-1)
  return {
    plan,
    card: cards.get(plan.card_id),
    charged: charged.length,
    remaining: parts.length - charged.length,
    remainingAmount: parts.filter((p) => !charged.includes(p)).reduce((s, p) => s + p.amount, 0),
    // A 1ª parcela pode ter os centavos que sobram; a 2ª mostra o valor "cheio".
    installmentAmount: (parts[1] ?? parts[0])?.amount ?? Math.round(plan.total_amount / plan.installments),
    startMonth: parts[0] && invoiceOf(parts[0])?.reference_month,
    endMonth: last && invoiceOf(last)?.reference_month,
    thisMonth: current?.installment_number ?? undefined,
  }
}

type LooseRow = Pick<
  Transaction,
  'id' | 'amount' | 'description' | 'card_id' | 'competence_month' | 'category_id' | 'household_member_id' | 'installment_number' | 'invoice_id'
>

const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1

/**
 * Compras no cartão sem parcelamento cadastrado, mas com "3/12" (etc.) na descrição — típico de
 * fatura importada, onde cada mês traz a parcela como um lançamento solto. Agrupa as parcelas da
 * mesma compra (cartão + descrição base + total) e projeta até a última.
 */
function detectFromText(rows: LooseRow[], cards: Map<string, Card>): PlanView[] {
  const groups = new Map<string, { rows: LooseRow[]; base: string; total: number; card_id: string }>()
  for (const r of rows) {
    const info = r.card_id ? parseInstallment(r.description) : null
    if (!info) continue
    const key = `${r.card_id}|${info.base.toLowerCase()}|${info.total}`
    const g = groups.get(key) ?? { rows: [], base: info.base, total: info.total, card_id: r.card_id! }
    g.rows.push(r)
    groups.set(key, g)
  }

  const nowIdx = monthIndex(currentMonthKey())
  return [...groups.entries()].map(([key, g]) => {
    // A parcela mais adiantada que já está no app manda na projeção.
    const withInfo = g.rows.map((r) => ({ r, info: parseInstallment(r.description)! }))
    const latest = withInfo.reduce((a, b) => (b.info.current > a.info.current ? b : a))
    const latestIdx = monthIndex(latest.r.competence_month)
    const numberAt = (idx: number) => latest.info.current + (idx - latestIdx)
    const thisNumber = numberAt(nowIdx)
    // Parcela "paga" = a de um mês anterior ao atual.
    const charged = Math.min(g.total, Math.max(0, thisNumber - 1))
    const remaining = g.total - charged
    const endMonth = lastInstallmentMonth(latest.r.competence_month, latest.info)
    const startMonth = shiftMonth(latest.r.competence_month.slice(0, 7) + '-01', -(latest.info.current - 1))
    const amount = latest.r.amount
    return {
      plan: {
        id: `texto:${key}`,
        card_id: g.card_id,
        description: g.base,
        total_amount: amount * g.total,
        installments: g.total,
        first_date: startMonth,
        created_at: '',
        parts: withInfo
          .sort((a, b) => a.info.current - b.info.current)
          .map(({ r, info }) => ({ ...r, installment_number: info.current })),
      },
      card: cards.get(g.card_id),
      charged,
      remaining,
      remainingAmount: remaining * amount,
      installmentAmount: amount,
      startMonth,
      endMonth,
      thisMonth: thisNumber >= 1 && thisNumber <= g.total ? thisNumber : undefined,
      detected: true,
    }
  })
}

/** Compras no cartão com cara de parcela no texto e sem parcelamento cadastrado (últimos 18 meses). */
function useTextInstallments() {
  const householdId = useHousehold().current.household.id
  const since = shiftMonth(currentMonthKey(), -18)
  return useQuery({
    queryKey: ['transactions', householdId, 'text-installments', since],
    queryFn: async (): Promise<LooseRow[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, amount, description, card_id, competence_month, category_id, household_member_id, installment_number, invoice_id')
        .eq('household_id', householdId)
        .eq('kind', 'card_purchase')
        .is('installment_plan_id', null)
        .gte('competence_month', since)
        // Pré-filtro barato no banco; a regra exata fica em parseInstallment.
        .or('description.like.%/%,description.ilike.%parc%,description.ilike.%prest%,description.ilike.%pcl%,description.ilike.% de %')
      if (error) throw error
      return data as LooseRow[]
    },
  })
}

/** Parcelamentos já calculados: em andamento (os que acabam antes primeiro) e encerrados. */
export function useInstallmentViews() {
  const plans = useInstallmentPlans()
  const textRows = useTextInstallments()
  const invoices = useInvoices().data ?? []
  const cards = useCards({ includeArchived: true }).data ?? []
  const today = todayIso()

  const invoiceById = new Map(invoices.map((i) => [i.invoice_id, i]))
  const cardById = new Map(cards.map((c) => [c.id, c]))
  const views = [
    ...(plans.data ?? []).map((p) => describe(p, invoiceById, cardById, today)),
    ...detectFromText(textRows.data ?? [], cardById),
  ]
  const active = views.filter((v) => v.remaining > 0).sort((a, b) => (a.endMonth ?? '').localeCompare(b.endMonth ?? ''))
  const done = views.filter((v) => v.remaining === 0)
  // Quanto das parcelas cai na fatura deste mês.
  const monthly = active.filter((v) => v.thisMonth).reduce((s, v) => s + v.installmentAmount, 0)

  return { isPending: plans.isPending || textRows.isPending, all: views, active, done, monthly }
}
