import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { equalPercentages } from '@/lib/finance/members'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { HouseholdMember } from '@/types/database'

export interface SplitDraft {
  member_id: string
  percentage: number
}

export function splitsTotal(splits: SplitDraft[]) {
  return Math.round(splits.reduce((s, x) => s + x.percentage, 0) * 100) / 100
}

/** Divisão igual entre todas as pessoas. */
export function equalSplit(members: HouseholdMember[]): SplitDraft[] {
  const pcts = equalPercentages(members.length)
  return members.map((m, i) => ({ member_id: m.id, percentage: pcts[i] }))
}

/** Lista de pessoas com percentual (soma precisa dar 100%). */
export function SplitEditor({
  members,
  splits,
  onChange,
  amount,
}: {
  members: HouseholdMember[]
  splits: SplitDraft[]
  onChange: (splits: SplitDraft[]) => void
  amount?: number
}) {
  const selected = new Map(splits.map((s) => [s.member_id, s.percentage]))
  const total = splitsTotal(splits)

  const redistribute = (ids: string[]) => {
    const pcts = equalPercentages(ids.length)
    onChange(ids.map((member_id, i) => ({ member_id, percentage: pcts[i] })))
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      {members.map((m) => {
        const pct = selected.get(m.id)
        return (
          <div key={m.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              aria-label={`Incluir ${m.full_name}`}
              className="size-4 accent-primary"
              checked={pct !== undefined}
              onChange={(e) => redistribute(e.target.checked ? [...selected.keys(), m.id] : [...selected.keys()].filter((x) => x !== m.id))}
            />
            <span className="flex-1 truncate text-sm">{m.full_name}</span>
            {pct !== undefined && (
              <>
                {amount ? (
                  <span className="text-xs tabular-nums text-muted-foreground">{formatCents(Math.round((amount * pct) / 100))}</span>
                ) : null}
                <div className="relative w-24">
                  <Input
                    type="number"
                    step="0.01"
                    min={0.01}
                    max={100}
                    aria-label={`Percentual de ${m.full_name}`}
                    className="h-8 pr-6 text-right"
                    value={pct}
                    onChange={(e) =>
                      onChange(splits.map((s) => (s.member_id === m.id ? { ...s, percentage: Number(e.target.value) || 0 } : s)))
                    }
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
              </>
            )}
          </div>
        )
      })}
      <div className="flex items-center justify-between pt-1">
        <span className={cn('text-xs', total === 100 ? 'text-muted-foreground' : 'font-medium text-destructive')}>
          Total: {total.toLocaleString('pt-BR')}%{total !== 100 && ' — precisa somar 100%'}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => redistribute([...selected.keys()])}>
          Dividir igualmente
        </Button>
      </div>
    </div>
  )
}
