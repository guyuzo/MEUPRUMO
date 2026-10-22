import { Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { CategoryIcon } from '@/components/planning/CategoryIcon'
import { Card, CardTitle } from '@/components/ui/card'
import type { CategoryWithSubs } from '@/hooks/usePlanning'
import { categoryIcon } from '@/lib/categoryIcons'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types/database'

type Tx = Pick<Transaction, 'kind' | 'amount' | 'category_id' | 'recurrence_id' | 'installment_plan_id'>

/** Acima disso, o resto vira "Outros" (mais fatias que isso não se distinguem na rosca). */
const MAX_SLICES = 7
const OTHER_COLOR = '#94a3b8'

const sign = (t: Tx) =>
  t.kind === 'expense_fixed' || t.kind === 'expense_variable' || t.kind === 'card_purchase' ? 1 : t.kind === 'card_refund' ? -1 : 0

/**
 * Fixo = conta fixa, ou compra no cartão que vem de recorrência/parcelamento (já estava comprometida).
 * Variável = o resto (inclui estornos, que abatem do variável).
 */
export function splitFixedVariable(rows: Tx[]) {
  let fixed = 0
  let variable = 0
  for (const t of rows) {
    const s = sign(t)
    if (!s) continue
    const isFixed = t.kind === 'expense_fixed' || (t.kind === 'card_purchase' && Boolean(t.recurrence_id || t.installment_plan_id))
    if (isFixed) fixed += t.amount
    else variable += s * t.amount
  }
  return { fixed, variable: Math.max(0, variable) }
}

interface Slice {
  key: string
  name: string
  icon: string | null
  color: string
  spent: number
  budget: number
  share: number
}

// Arco de rosca entre dois ângulos (radianos, 0 = topo, sentido horário).
function arcPath(cx: number, cy: number, r: number, inner: number, a0: number, a1: number) {
  const p = (radius: number, a: number) => [cx + radius * Math.sin(a), cy - radius * Math.cos(a)]
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = p(r, a0)
  const [x1, y1] = p(r, a1)
  const [x2, y2] = p(inner, a1)
  const [x3, y3] = p(inner, a0)
  return `M${x0} ${y0}A${r} ${r} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${inner} ${inner} 0 ${large} 0 ${x3} ${y3}Z`
}

export function CategoryDonut({
  categories,
  rows,
  spending,
  budgets,
  month,
}: {
  categories: CategoryWithSubs[]
  rows: Tx[]
  spending: Map<string | null, number>
  budgets?: Map<string, number>
  month: string
}) {
  const [hover, setHover] = useState<string | null>(null)

  const all = categories
    .filter((c) => c.kind === 'expense')
    .map((c) => ({ category: c, spent: Math.max(0, spending.get(c.id) ?? 0), budget: budgets?.get(c.id) ?? 0 }))
    .filter((r) => r.spent > 0 || r.budget > 0)
    .sort((a, b) => b.spent - a.spent)
  const uncategorized = Math.max(0, spending.get(null) ?? 0)
  const total = all.reduce((s, r) => s + r.spent, 0) + uncategorized
  const { fixed, variable } = splitFixedVariable(rows)
  const fvTotal = Math.max(fixed + variable, 1)

  const spentRows = all.filter((r) => r.spent > 0)
  const top = spentRows.slice(0, MAX_SLICES)
  const restSpent = spentRows.slice(MAX_SLICES).reduce((s, r) => s + r.spent, 0) + uncategorized
  const slices: Slice[] = top.map(({ category: c, spent, budget }) => ({
    key: c.id,
    name: c.name,
    icon: c.emoji,
    color: c.color,
    spent,
    budget,
    share: total ? spent / total : 0,
  }))
  if (restSpent > 0) {
    slices.push({ key: 'other', name: 'Outros', icon: 'package', color: OTHER_COLOR, spent: restSpent, budget: 0, share: restSpent / total })
  }

  const size = 280
  const c = size / 2
  const outer = 98
  const inner = 76
  let angle = 0
  const arcs = slices.map((s) => {
    const a0 = angle
    angle += s.share * Math.PI * 2
    return { ...s, a0, a1: angle }
  })
  const focused = hover ? slices.find((s) => s.key === hover) : undefined

  return (
    <Card className="space-y-5">
      <div className="flex items-center justify-between">
        <CardTitle>Gastos por categoria</CardTitle>
        <Link to="/budget" search={{ month }} className="py-3 text-xs text-primary hover:underline">
          Orçamento
        </Link>
      </div>

      {total === 0 && all.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum gasto neste mês.</p>
      ) : (
        <>
          {total > 0 && (
            <div className="mx-auto w-full max-w-[300px]">
              <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label={`Gastos por categoria: total ${formatCents(total)}`}>
                {arcs.length === 1 ? (
                  <circle cx={c} cy={c} r={(outer + inner) / 2} fill="none" stroke={arcs[0].color} strokeWidth={outer - inner} />
                ) : (
                  arcs.map((a) => (
                    <path
                      key={a.key}
                      d={arcPath(c, c, outer, inner, a.a0, a.a1)}
                      fill={a.color}
                      // Contorno na cor do cartão: 2px de respiro entre as fatias.
                      stroke="var(--color-card)"
                      strokeWidth={2}
                      opacity={hover && hover !== a.key ? 0.35 : 1}
                      className="cursor-pointer transition-opacity"
                      onMouseEnter={() => setHover(a.key)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => setHover(hover === a.key ? null : a.key)}
                    >
                      <title>{`${a.name}: ${formatCents(a.spent)} (${Math.round(a.share * 100)}%)`}</title>
                    </path>
                  ))
                )}
                {/* Ícone de cada fatia (as muito finas ficam sem, para não embolar). */}
                {arcs
                  .filter((a) => a.share >= 0.04)
                  .map((a) => {
                    const mid = (a.a0 + a.a1) / 2
                    const r = outer + 22
                    const x = c + r * Math.sin(mid)
                    const y = c - r * Math.cos(mid)
                    const Icon = categoryIcon(a.icon)
                    return (
                      <g key={`i-${a.key}`} opacity={hover && hover !== a.key ? 0.35 : 1} className="pointer-events-none transition-opacity">
                        <circle cx={x} cy={y} r={15} fill="var(--color-card)" stroke={a.color} strokeOpacity={0.35} />
                        <Icon x={x - 8} y={y - 8} width={16} height={16} color={a.color} strokeWidth={1.75} />
                      </g>
                    )
                  })}
                <text x={c} y={c - 26} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {focused ? focused.name : `Variáveis (${Math.round((variable / fvTotal) * 100)}%)`}
                </text>
                <text x={c} y={c - 6} textAnchor="middle" className="fill-foreground text-[17px] font-semibold tabular-nums">
                  {formatCents(focused ? focused.spent : variable)}
                </text>
                <text x={c} y={c + 18} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {focused ? `${Math.round(focused.share * 100)}% dos gastos` : `Fixas (${Math.round((fixed / fvTotal) * 100)}%)`}
                </text>
                {!focused && (
                  <text x={c} y={c + 38} textAnchor="middle" className="fill-foreground text-[15px] font-semibold tabular-nums">
                    {formatCents(fixed)}
                  </text>
                )}
              </svg>
            </div>
          )}

          <ul className="space-y-1">
            {all.map(({ category, spent, budget }) => {
              const share = total ? Math.round((spent / total) * 100) : 0
              const over = budget > 0 && spent > budget
              const pct = budget > 0 ? (spent / budget) * 100 : total ? (spent / total) * 100 : 0
              return (
                <li
                  key={category.id}
                  onMouseEnter={() => setHover(category.id)}
                  onMouseLeave={() => setHover(null)}
                  className={cn('flex items-center gap-3 rounded-md px-2 py-2 transition-colors', hover === category.id && 'bg-muted/60')}
                >
                  <CategoryIcon icon={category.emoji} color={category.color} size="lg" className="rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{category.name}</p>
                      <p className="shrink-0 text-sm font-medium tabular-nums">{share}%</p>
                    </div>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {formatCents(spent)}
                      {budget > 0 ? (
                        <>
                          {' | '}
                          <span className="font-semibold text-foreground">{formatCents(budget)}</span>
                        </>
                      ) : (
                        ' · sem limite'
                      )}
                    </p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, pct)}%`, backgroundColor: over ? 'var(--color-destructive)' : category.color }}
                      />
                    </div>
                    {over && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="size-3" /> {formatCents(spent - budget)} acima do limite
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
            {uncategorized > 0 && (
              <li className="flex items-center gap-3 px-2 py-2 text-sm text-muted-foreground">
                <CategoryIcon icon="tag" color={OTHER_COLOR} size="lg" className="rounded-lg" />
                <span className="flex-1">Sem categoria</span>
                <span className="tabular-nums">{formatCents(uncategorized)}</span>
              </li>
            )}
          </ul>
        </>
      )}
    </Card>
  )
}
