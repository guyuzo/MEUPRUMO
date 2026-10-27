import { Link } from '@tanstack/react-router'
import { AlertTriangle, House, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Avatar } from '@/components/family/Avatar'
import { CategoryIcon } from '@/components/planning/CategoryIcon'
import { Card, CardTitle } from '@/components/ui/card'
import type { CategoryWithSubs } from '@/hooks/usePlanning'
import { categoryIcon } from '@/lib/categoryIcons'
import { spendingByMember } from '@/lib/finance/members'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { HouseholdMember, Transaction, TransactionSplit } from '@/types/database'

type Tx = Pick<Transaction, 'id' | 'kind' | 'amount' | 'category_id' | 'recurrence_id' | 'installment_plan_id' | 'household_member_id'>

/** Acima disso, o resto vira "Outros" (mais fatias que isso não se distinguem na rosca). */
const MAX_SLICES = 7
const OTHER_COLOR = '#94a3b8'

const spendSign = (t: Tx) =>
  t.kind === 'expense_fixed' || t.kind === 'expense_variable' || t.kind === 'card_purchase' ? 1 : t.kind === 'card_refund' ? -1 : 0

/**
 * Fixo = conta fixa, ou compra no cartão que vem de recorrência/parcelamento (já estava comprometida).
 * Variável = o resto (inclui estornos, que abatem do variável).
 */
export function splitFixedVariable(rows: Tx[]) {
  let fixed = 0
  let variable = 0
  for (const t of rows) {
    const s = spendSign(t)
    if (!s) continue
    const isFixed = t.kind === 'expense_fixed' || (t.kind === 'card_purchase' && Boolean(t.recurrence_id || t.installment_plan_id))
    if (isFixed) fixed += t.amount
    else variable += s * t.amount
  }
  return { fixed, variable: Math.max(0, variable) }
}

/** Um item da rosca e da lista: categoria ou pessoa. */
interface Item {
  key: string
  name: string
  color: string
  value: number
  /** Limite do orçamento (só gastos por categoria). */
  budget?: number
  /** Ícone na lista. */
  badge: ReactNode
  /** O que aparece no círculo em volta da rosca. */
  glyph: { icon: LucideIcon } | { text: string }
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

type Mode = 'expense' | 'income'
type View = 'category' | 'person'

/** Gastos ou receitas do mês em rosca, por categoria ou por pessoa. */
export function BreakdownDonut({
  mode,
  categories,
  members,
  avatarUrls,
  splits,
  rows,
  budgets,
  month,
}: {
  mode: Mode
  categories: CategoryWithSubs[]
  members: HouseholdMember[]
  avatarUrls?: Map<string, string | null>
  splits: Pick<TransactionSplit, 'transaction_id' | 'member_id' | 'percentage'>[]
  rows: Tx[]
  budgets?: Map<string, number>
  month: string
}) {
  const [view, setView] = useState<View>('category')
  const [hover, setHover] = useState<string | null>(null)
  const isExpense = mode === 'expense'

  // Valor por categoria e por pessoa (null = sem categoria / casa).
  const byCategory = new Map<string | null, number>()
  const byPerson = new Map<string | null, number>()
  if (isExpense) {
    for (const t of rows) {
      const s = spendSign(t)
      if (s) byCategory.set(t.category_id, (byCategory.get(t.category_id) ?? 0) + s * t.amount)
    }
    for (const [k, v] of spendingByMember(rows, splits)) byPerson.set(k, v)
  } else {
    for (const t of rows) {
      if (t.kind !== 'income') continue
      byCategory.set(t.category_id, (byCategory.get(t.category_id) ?? 0) + t.amount)
      byPerson.set(t.household_member_id, (byPerson.get(t.household_member_id) ?? 0) + t.amount)
    }
  }

  let items: Item[]
  if (view === 'category') {
    items = categories
      .filter((c) => c.kind === mode)
      .map((c) => ({
        key: c.id,
        name: c.name,
        color: c.color,
        value: Math.max(0, byCategory.get(c.id) ?? 0),
        budget: isExpense ? (budgets?.get(c.id) ?? 0) : undefined,
        badge: <CategoryIcon icon={c.emoji} color={c.color} size="lg" className="rounded-lg" />,
        glyph: { icon: categoryIcon(c.emoji) },
      }))
      .filter((r) => r.value > 0 || (r.budget ?? 0) > 0)
    const none = Math.max(0, byCategory.get(null) ?? 0)
    if (none > 0) {
      items.push({ key: 'none', name: 'Sem categoria', color: OTHER_COLOR, value: none, badge: <CategoryIcon icon="tag" color={OTHER_COLOR} size="lg" className="rounded-lg" />, glyph: { icon: categoryIcon('tag') } })
    }
  } else {
    items = members
      .map((m) => ({
        key: m.id,
        name: m.full_name,
        color: m.color,
        value: Math.max(0, byPerson.get(m.id) ?? 0),
        badge: <Avatar member={m} url={avatarUrls?.get(m.id)} size="md" />,
        glyph: { text: m.full_name.trim().charAt(0).toUpperCase() },
      }))
      .filter((r) => r.value > 0)
    const house = Math.max(0, byPerson.get(null) ?? 0)
    if (house > 0) {
      items.push({
        key: 'house',
        name: 'Casa',
        color: OTHER_COLOR,
        value: house,
        badge: (
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <House className="size-[18px]" strokeWidth={1.75} />
          </span>
        ),
        glyph: { icon: House },
      })
    }
  }
  items.sort((a, b) => b.value - a.value)

  const total = items.reduce((s, r) => s + r.value, 0)
  // Fatias: as maiores e, se sobrar, "Outros".
  const withValue = items.filter((r) => r.value > 0)
  const slices = withValue.slice(0, MAX_SLICES)
  const rest = withValue.slice(MAX_SLICES).reduce((s, r) => s + r.value, 0)
  if (rest > 0) slices.push({ key: 'other', name: 'Outros', color: OTHER_COLOR, value: rest, badge: null, glyph: { icon: categoryIcon('package') } })

  const size = 280
  const c = size / 2
  const outer = 98
  const inner = 76
  let angle = 0
  const arcs = slices.map((s) => {
    const a0 = angle
    angle += (total ? s.value / total : 0) * Math.PI * 2
    return { ...s, share: total ? s.value / total : 0, a0, a1: angle }
  })
  const focused = hover ? arcs.find((s) => s.key === hover) : undefined
  const { fixed, variable } = splitFixedVariable(rows)
  const fvTotal = Math.max(fixed + variable, 1)
  const noun = isExpense ? 'gastos' : 'receitas'

  // Centro da rosca: item em foco, ou o resumo (gastos por categoria mostram fixas x variáveis).
  const center: [string, string, string?, string?] = focused
    ? [focused.name, formatCents(focused.value), `${Math.round(focused.share * 100)}% das ${noun}`]
    : isExpense && view === 'category'
      ? [`Variáveis (${Math.round((variable / fvTotal) * 100)}%)`, formatCents(variable), `Fixas (${Math.round((fixed / fvTotal) * 100)}%)`, formatCents(fixed)]
      : [isExpense ? 'Total gasto' : 'Total recebido', formatCents(total), `${withValue.length} ${view === 'person' ? (withValue.length === 1 ? 'pessoa' : 'pessoas') : withValue.length === 1 ? 'categoria' : 'categorias'}`]

  const title = isExpense ? 'Gastos' : 'Receitas'

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>
          {title} por {view === 'category' ? 'categoria' : 'pessoa'}
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5 text-xs" role="tablist" aria-label={`Agrupar ${noun}`}>
            {(
              [
                ['category', 'Categoria'],
                ['person', 'Pessoa'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => {
                  setView(v)
                  setHover(null)
                }}
                className={cn('min-h-8 rounded px-2.5', view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {label}
              </button>
            ))}
          </div>
          {isExpense ? (
            <Link to="/budget" search={{ month }} className="py-2 text-xs text-primary hover:underline">
              Orçamento
            </Link>
          ) : (
            <Link to="/income" search={{ month }} className="py-2 text-xs text-primary hover:underline">
              Ver receitas
            </Link>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{isExpense ? 'Nenhum gasto neste mês.' : 'Nenhuma receita neste mês.'}</p>
      ) : (
        <>
          {total > 0 && (
            <div className="mx-auto w-full max-w-[300px]">
              <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label={`${title} por ${view === 'category' ? 'categoria' : 'pessoa'}: total ${formatCents(total)}`}>
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
                      <title>{`${a.name}: ${formatCents(a.value)} (${Math.round(a.share * 100)}%)`}</title>
                    </path>
                  ))
                )}
                {/* Ícone ou inicial de cada fatia (as muito finas ficam sem, para não embolar). */}
                {arcs
                  .filter((a) => a.share >= 0.04)
                  .map((a) => {
                    const mid = (a.a0 + a.a1) / 2
                    const r = outer + 22
                    const x = c + r * Math.sin(mid)
                    const y = c - r * Math.cos(mid)
                    return (
                      <g key={`i-${a.key}`} opacity={hover && hover !== a.key ? 0.35 : 1} className="pointer-events-none transition-opacity">
                        <circle cx={x} cy={y} r={15} fill="var(--color-card)" stroke={a.color} strokeOpacity={0.35} />
                        {'icon' in a.glyph ? (
                          <a.glyph.icon x={x - 8} y={y - 8} width={16} height={16} color={a.color} strokeWidth={1.75} />
                        ) : (
                          <text x={x} y={y + 4.5} textAnchor="middle" fill={a.color} className="text-[13px] font-semibold">
                            {a.glyph.text}
                          </text>
                        )}
                      </g>
                    )
                  })}
                <text x={c} y={c - 26} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {center[0]}
                </text>
                <text x={c} y={c - 6} textAnchor="middle" className="fill-foreground text-[17px] font-semibold tabular-nums">
                  {center[1]}
                </text>
                {center[2] && (
                  <text x={c} y={c + 18} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                    {center[2]}
                  </text>
                )}
                {center[3] && (
                  <text x={c} y={c + 38} textAnchor="middle" className="fill-foreground text-[15px] font-semibold tabular-nums">
                    {center[3]}
                  </text>
                )}
              </svg>
            </div>
          )}

          <ul className="space-y-1">
            {items.map((it) => {
              const share = total ? Math.round((it.value / total) * 100) : 0
              const budget = it.budget ?? 0
              const over = budget > 0 && it.value > budget
              const pct = budget > 0 ? (it.value / budget) * 100 : total ? (it.value / total) * 100 : 0
              return (
                <li
                  key={it.key}
                  onMouseEnter={() => setHover(it.key)}
                  onMouseLeave={() => setHover(null)}
                  className={cn('flex items-center gap-3 rounded-md px-2 py-2 transition-colors', hover === it.key && 'bg-muted/60')}
                >
                  {it.badge}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{it.name}</p>
                      <p className="shrink-0 text-sm font-medium tabular-nums">{share}%</p>
                    </div>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {isExpense ? '' : '+'}
                      {formatCents(it.value)}
                      {isExpense && view === 'category' && it.key !== 'none' ? (
                        budget > 0 ? (
                          <>
                            {' | '}
                            <span className="font-semibold text-foreground">{formatCents(budget)}</span>
                          </>
                        ) : (
                          ' · sem limite'
                        )
                      ) : null}
                    </p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, pct)}%`, backgroundColor: over ? 'var(--color-destructive)' : it.color }}
                      />
                    </div>
                    {over && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="size-3" /> {formatCents(it.value - budget)} acima do limite
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Card>
  )
}
