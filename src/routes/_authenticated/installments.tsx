import { createFileRoute, Link } from '@tanstack/react-router'
import { CalendarCheck, Layers } from 'lucide-react'
import { useState } from 'react'
import { BankLogo } from '@/components/cards/BankLogo'
import { CategoryIcon } from '@/components/planning/CategoryIcon'
import { EmptyState, ListSkeleton, PageHeader, ProgressBar } from '@/components/shared/layout'
import { Card } from '@/components/ui/card'
import { useInstallmentViews, type PlanView } from '@/hooks/useInstallmentViews'
import { useCategories } from '@/hooks/usePlanning'
import { formatMonthTitle } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/installments')({ component: InstallmentsPage })

function InstallmentsPage() {
  const plans = useInstallmentViews()
  const categories = useCategories().data ?? []
  const [showDone, setShowDone] = useState(false)

  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const { all: views, active, done, monthly } = plans
  const totalRemaining = active.reduce((s, v) => s + v.remainingAmount, 0)
  const lastEnd = active.reduce<string | undefined>((max, v) => (v.endMonth && (!max || v.endMonth > max) ? v.endMonth : max), undefined)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parcelamentos"
        subtitle="Compras parceladas no cartão: quanto falta e em que mês cada uma termina."
      />

      {active.length > 0 && (
        <Card className="grid gap-2 p-4 sm:grid-cols-4 sm:gap-4">
          {(
            [
              ['Em andamento', `${active.length} ${active.length === 1 ? 'compra' : 'compras'}`, ''],
              ['Parcelas neste mês', formatCents(monthly), 'text-expense'],
              ['Falta pagar', formatCents(totalRemaining), 'text-expense'],
              ['Tudo quitado em', lastEnd ? formatMonthTitle(lastEnd) : '—', ''],
            ] as const
          ).map(([label, value, color]) => (
            <div key={label} className="flex items-baseline justify-between gap-2 sm:block">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn('font-semibold tabular-nums sm:mt-1', color)}>{value}</p>
            </div>
          ))}
        </Card>
      )}

      {plans.isPending ? (
        <ListSkeleton className="h-40" />
      ) : views.length === 0 ? (
        <EmptyState icon={Layers} text="Nenhuma compra parcelada ainda. Ao lançar uma compra no cartão, escolha o número de parcelas." />
      ) : (
        <>
          {active.length === 0 ? (
            <Card className="py-8 text-center text-sm text-muted-foreground">Nenhum parcelamento em andamento. 🎉</Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {active.map((v) => (
                <PlanCard key={v.plan.id} view={v} category={categoryById.get(v.plan.parts[0]?.category_id ?? '')} />
              ))}
            </div>
          )}

          {done.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowDone((s) => !s)} className="text-sm text-muted-foreground hover:underline">
                {showDone ? 'Ocultar' : 'Mostrar'} parcelamentos encerrados ({done.length})
              </button>
              {showDone && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {done.map((v) => (
                    <PlanCard key={v.plan.id} view={v} category={categoryById.get(v.plan.parts[0]?.category_id ?? '')} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PlanCard({ view, category }: { view: PlanView; category?: { emoji: string; color: string } }) {
  const { plan, card, charged, remaining, remainingAmount, installmentAmount, startMonth, endMonth, thisMonth } = view
  const finished = remaining === 0
  return (
    <Card className={cn('space-y-4', finished && 'opacity-70')}>
      <div className="flex items-start gap-3">
        {category ? (
          <CategoryIcon icon={category.emoji} color={category.color} size="lg" />
        ) : (
          <BankLogo bank={card?.bank} color={card?.color} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{plan.description}</p>
          <p className="truncate text-xs text-muted-foreground">
            {card ? (
              <Link to="/cards/$cardId" params={{ cardId: card.id }} className="hover:underline">
                {card.name}
              </Link>
            ) : (
              'Cartão'
            )}
            {' · '}
            {plan.installments}x de {formatCents(installmentAmount)}
          </p>
        </div>
        <p className="shrink-0 text-right text-sm font-semibold tabular-nums">{formatCents(plan.total_amount)}</p>
      </div>

      <div className="space-y-1.5">
        <ProgressBar value={(charged / plan.installments) * 100} color={card?.color} label={`${charged} de ${plan.installments} parcelas`} />
        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {charged} de {plan.installments} pagas
            {thisMonth && !finished && ` · ${thisMonth}ª neste mês`}
          </span>
          {!finished && <span className="tabular-nums">faltam {formatCents(remainingAmount)}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm">
        <CalendarCheck className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          {finished ? 'Terminou em ' : 'Termina em '}
          <span className="font-semibold">{endMonth ? formatMonthTitle(endMonth) : '—'}</span>
        </span>
        {startMonth && <span className="shrink-0 text-xs text-muted-foreground">desde {formatMonthTitle(startMonth).toLowerCase()}</span>}
      </div>
    </Card>
  )
}
