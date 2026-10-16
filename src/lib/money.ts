import { CURRENCY, LOCALE } from '@/config/app'

// Todos os valores monetários trafegam em centavos (inteiros) para evitar erro de ponto flutuante.

const formatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY })

export function formatCents(cents: number): string {
  return formatter.format(cents / 100)
}

/** Converte texto digitado ("1.234,56", "R$ 10", "-5,5") em centavos. Retorna null se inválido. */
export function parseToCents(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, '')
  if (!cleaned || cleaned === '-') return null
  const negative = cleaned.startsWith('-')
  const unsigned = cleaned.replace(/-/g, '')
  const lastComma = unsigned.lastIndexOf(',')
  // Vírgula é o separador decimal em pt-BR; pontos são milhares.
  const normalized =
    lastComma >= 0
      ? unsigned.slice(0, lastComma).replace(/[.,]/g, '') + '.' + unsigned.slice(lastComma + 1)
      : unsigned.replace(/\./g, '')
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  const cents = Math.round(value * 100)
  return negative ? -cents : cents
}
