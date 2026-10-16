// CSV no formato que o Excel em português abre direto: ";" como separador,
// vírgula decimal e BOM para manter os acentos.

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value)
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return '﻿' + [header, ...rows].map((r) => r.map(escape).join(';')).join('\r\n')
}

/** Centavos → "1234,56" (sem símbolo, para a planilha somar). */
export function centsToDecimal(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(cents)
  return `${negative ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

export function downloadFile(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
