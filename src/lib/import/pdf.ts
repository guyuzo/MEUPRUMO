// Extrai o texto de um PDF no navegador (pdf.js), linha a linha, na ordem em que aparece na página.
// Carregado sob demanda: o pdf.js só entra quando alguém importa um PDF.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export class PdfPasswordError extends Error {
  readonly wrongPassword: boolean
  constructor(wrongPassword: boolean) {
    super(wrongPassword ? 'Senha incorreta' : 'PDF protegido por senha')
    this.wrongPassword = wrongPassword
  }
}

export const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

export async function extractPdfLines(file: File, password?: string): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  let doc
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password }).promise
  } catch (error) {
    if ((error as { name?: string }).name === 'PasswordException') {
      throw new PdfPasswordError((error as { code?: number }).code === pdfjs.PasswordResponses.INCORRECT_PASSWORD)
    }
    throw error
  }

  const out: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    // Agrupa os pedaços de texto pela altura (y) e ordena da esquerda para a direita.
    const rows = new Map<number, { x: number; text: string }[]>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const [, , , , x, y] = item.transform as number[]
      const key = Math.round(y / 2) * 2
      const row = rows.get(key) ?? rows.get(key - 2) ?? rows.get(key + 2)
      if (row) row.push({ x, text: item.str })
      else rows.set(key, [{ x, text: item.str }])
    }
    const ordered = [...rows.entries()].sort((a, b) => b[0] - a[0])
    for (const [, items] of ordered) {
      out.push(
        items
          .sort((a, b) => a.x - b.x)
          .map((i) => i.text.trim())
          .join(' '),
      )
    }
    page.cleanup()
  }
  await doc.destroy()
  return out
}
