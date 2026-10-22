import { todayIso, useCards, useInstallmentPlans, useInvoices, type InstallmentPlanWithParts } from '@/hooks/useCards'
import { currentMonthKey } from '@/lib/dates'
import type { Card, InvoiceSummary } from '@/types/database'

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

/** Parcelamentos já calculados: em andamento (os que acabam antes primeiro) e encerrados. */
export function useInstallmentViews() {
  const plans = useInstallmentPlans()
  const invoices = useInvoices().data ?? []
  const cards = useCards({ includeArchived: true }).data ?? []
  const today = todayIso()

  const invoiceById = new Map(invoices.map((i) => [i.invoice_id, i]))
  const cardById = new Map(cards.map((c) => [c.id, c]))
  const views = (plans.data ?? []).map((p) => describe(p, invoiceById, cardById, today))
  const active = views.filter((v) => v.remaining > 0).sort((a, b) => (a.endMonth ?? '').localeCompare(b.endMonth ?? ''))
  const done = views.filter((v) => v.remaining === 0)
  // Quanto das parcelas cai na fatura deste mês.
  const monthly = active.filter((v) => v.thisMonth).reduce((s, v) => s + v.installmentAmount, 0)

  return { isPending: plans.isPending, all: views, active, done, monthly }
}
