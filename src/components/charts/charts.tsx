import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCentsCompact } from '@/lib/chartFormat'
import { formatCents } from '@/lib/money'

// Gráficos do app: 2 séries fixas (entradas = series-1, saídas = series-2), um eixo só,
// legenda sempre visível, tooltip no hover e tabela equivalente para leitores de tela.

export interface Series {
  key: string
  label: string
  color: string
}

type Row = Record<string, number | string>

export const FLOW_SERIES: Series[] = [
  { key: 'income', label: 'Entradas', color: 'var(--color-series-1)' },
  { key: 'expenses', label: 'Saídas', color: 'var(--color-series-2)' },
]

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: s.color, height: 3 }} />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

interface TooltipLike {
  active?: boolean
  payload?: readonly { dataKey?: unknown; value?: unknown; payload?: unknown }[]
  label?: unknown
}

/** Linhas extras no tooltip, calculadas a partir da linha de dados (ex.: "Gasto no dia"). */
export type TooltipDetail = (row: Row) => [label: string, value: string][]

function ChartTooltip({
  active,
  payload,
  label,
  series,
  labelFormatter,
  detail,
}: TooltipLike & { series: Series[]; labelFormatter: (label: string | number) => string; detail?: TooltipDetail }) {
  if (!active || !payload?.length) return null
  const extra = detail ? detail(payload[0].payload as Row) : []
  return (
    <div className="min-w-40 rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-foreground">{labelFormatter(label as string | number)}</p>
      {extra.length > 0 && (
        <div className="mb-1.5 space-y-0.5 border-b border-border pb-1.5">
          {extra.map(([l, v]) => (
            <p key={l} className="flex items-center justify-between gap-4 text-muted-foreground">
              <span>{l}</span>
              <span className="font-semibold tabular-nums text-foreground">{v}</span>
            </p>
          ))}
        </div>
      )}
      {series.map((s) => {
        const item = payload.find((p) => p.dataKey === s.key)
        if (!item) return null
        return (
          <p key={s.key} className="flex items-center justify-between gap-4 text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            <span className="font-medium tabular-nums text-foreground">{formatCents(Number(item.value))}</span>
          </p>
        )
      })}
    </div>
  )
}

const axisProps = {
  tick: { fill: 'var(--color-muted-foreground)', fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const

/** Linhas acumuladas ao longo do mês. */
export function CumulativeLineChart({
  data,
  xKey,
  series,
  xLabel,
  title,
  detail,
}: {
  data: Row[]
  xKey: string
  series: Series[]
  xLabel: (x: number) => string
  title: string
  detail?: TooltipDetail
}) {
  return (
    <figure aria-label={title}>
      <div className="h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
            <XAxis dataKey={xKey} {...axisProps} interval="preserveStartEnd" minTickGap={24} />
            <YAxis {...axisProps} width={72} tickFormatter={formatCentsCompact} />
            <Tooltip
              cursor={{ stroke: 'var(--color-muted-foreground)', strokeDasharray: '3 3' }}
              content={(props) => <ChartTooltip {...props} series={series} labelFormatter={(l) => xLabel(Number(l))} detail={detail} />}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                // linear: curva suavizada sugeriria gastos entre um dia e outro.
                type="linear"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-card)' }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <SrTable data={data} xKey={xKey} series={series} xLabel={(x) => xLabel(Number(x))} caption={title} />
    </figure>
  )
}

/** Barras agrupadas por período. */
export function GroupedBarChart({
  data,
  xKey,
  series,
  xLabel,
  title,
  tickLabel,
  height = 'h-64',
}: {
  data: Row[]
  xKey: string
  series: Series[]
  xLabel: (x: string) => string
  title: string
  /** Texto curto no eixo (padrão: o mesmo do tooltip). */
  tickLabel?: (x: string) => string
  height?: string
}) {
  return (
    <figure aria-label={title}>
      <div className={height} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="24%">
            <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
            <XAxis
              dataKey={xKey}
              {...axisProps}
              interval="preserveStartEnd"
              minTickGap={16}
              tickFormatter={(x) => (tickLabel ?? xLabel)(String(x))}
            />
            <YAxis {...axisProps} width={72} tickFormatter={formatCentsCompact} />
            <Tooltip
              cursor={{ fill: 'var(--color-muted)' }}
              content={(props) => <ChartTooltip {...props} series={series} labelFormatter={(l) => xLabel(String(l))} />}
            />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SrTable data={data} xKey={xKey} series={series} xLabel={(x) => xLabel(String(x))} caption={title} />
    </figure>
  )
}

function SrTable({
  data,
  xKey,
  series,
  xLabel,
  caption,
}: {
  data: Row[]
  xKey: string
  series: Series[]
  xLabel: (x: Row[string]) => string
  caption: string
}) {
  return (
    // Tabela não aceita a largura de 1px do sr-only (vazava a página no celular): esconde por um div.
    <div className="sr-only">
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Período</th>
          {series.map((s) => (
            <th key={s.key} scope="col">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i}>
            <th scope="row">{xLabel(row[xKey])}</th>
            {series.map((s) => (
              <td key={s.key}>{formatCents(Number(row[s.key]))}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
}
