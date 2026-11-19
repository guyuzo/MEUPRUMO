// Layout da tela Início: ordem, tamanho e visibilidade de cada bloco. Guardado por pessoa em
// profiles.dashboard_layout (jsonb); null = layout padrão.

export type BlockId = 'actions' | 'stats' | 'chart' | 'breakdown' | 'expenses' | 'income' | 'upcoming'

/** Largura no computador (grade de 6 colunas): 1/3, 1/2, 2/3 ou a linha inteira. No celular, tudo ocupa a linha. */
export type BlockSize = 'small' | 'medium' | 'large' | 'full'

export interface LayoutItem {
  id: BlockId
  size: BlockSize
  hidden: boolean
}

export const BLOCK_LABEL: Record<BlockId, string> = {
  actions: 'Botões de lançamento',
  stats: 'Números do mês',
  chart: 'Gráfico de ganhos e gastos',
  breakdown: 'Para onde foi o dinheiro',
  expenses: 'Gastos por categoria',
  income: 'Ganhos por categoria',
  upcoming: 'Próximos vencimentos',
}

export const SIZE_LABEL: Record<BlockSize, string> = {
  small: 'Pequeno',
  medium: 'Médio',
  large: 'Grande',
  full: 'Linha inteira',
}

export const SIZES: BlockSize[] = ['small', 'medium', 'large', 'full']

/** Igual à tela antes de ser personalizável. */
export const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: 'actions', size: 'full', hidden: false },
  { id: 'stats', size: 'full', hidden: false },
  { id: 'chart', size: 'large', hidden: false },
  { id: 'breakdown', size: 'small', hidden: false },
  { id: 'expenses', size: 'medium', hidden: false },
  { id: 'income', size: 'medium', hidden: false },
  { id: 'upcoming', size: 'medium', hidden: false },
]

const isBlockId = (v: unknown): v is BlockId => typeof v === 'string' && v in BLOCK_LABEL
const isSize = (v: unknown): v is BlockSize => typeof v === 'string' && (SIZES as string[]).includes(v)

/**
 * Lê o que veio do banco sem confiar no formato: ignora blocos desconhecidos ou repetidos e
 * acrescenta no fim (na posição padrão relativa) os blocos novos que ainda não estavam salvos.
 */
export function normalizeLayout(raw: unknown): LayoutItem[] {
  if (!Array.isArray(raw)) return DEFAULT_LAYOUT.map((b) => ({ ...b }))
  const seen = new Set<BlockId>()
  const out: LayoutItem[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { id, size, hidden } = item as Record<string, unknown>
    if (!isBlockId(id) || seen.has(id)) continue
    seen.add(id)
    const fallback = DEFAULT_LAYOUT.find((b) => b.id === id)!
    out.push({ id, size: isSize(size) ? size : fallback.size, hidden: hidden === true })
  }
  for (const block of DEFAULT_LAYOUT) if (!seen.has(block.id)) out.push({ ...block })
  return out
}

export function isDefaultLayout(layout: LayoutItem[]) {
  return JSON.stringify(normalizeLayout(layout)) === JSON.stringify(DEFAULT_LAYOUT)
}

/** Move o bloco `id` para a posição de `targetId` (os do meio andam uma casa). */
export function moveBlock(layout: LayoutItem[], id: BlockId, targetId: BlockId): LayoutItem[] {
  const from = layout.findIndex((b) => b.id === id)
  const to = layout.findIndex((b) => b.id === targetId)
  if (from < 0 || to < 0 || from === to) return layout
  const next = [...layout]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Sobe (-1) ou desce (+1) entre os blocos visíveis, pulando os ocultos. */
export function stepBlock(layout: LayoutItem[], id: BlockId, direction: -1 | 1): LayoutItem[] {
  const visible = layout.filter((b) => !b.hidden)
  const index = visible.findIndex((b) => b.id === id)
  const neighbor = visible[index + direction]
  return neighbor ? moveBlock(layout, id, neighbor.id) : layout
}

export function updateBlock(layout: LayoutItem[], id: BlockId, patch: Partial<Omit<LayoutItem, 'id'>>): LayoutItem[] {
  return layout.map((b) => (b.id === id ? { ...b, ...patch } : b))
}
