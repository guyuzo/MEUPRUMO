// Formatação compacta para eixos de gráfico: "R$ 1,2 mil", "R$ 3 mi".
const compact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatCentsCompact(cents: number): string {
  return compact.format(cents / 100)
}
